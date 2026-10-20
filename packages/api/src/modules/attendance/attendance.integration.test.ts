import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomBytes, randomUUID } from "node:crypto";
import type { Server } from "node:http";
import { resolve } from "node:path";
import { createAuth } from "@resora/auth";
import { getActiveSr } from "@resora/auth/sr-access";
import { createDb, type Database } from "@resora/db";
import { seedOrganization } from "@resora/db/organization";
import {
	attendanceSessions,
	eventParticipants,
	events,
	qrChallenges,
} from "@resora/db/schema/attendance";
import { account, user } from "@resora/db/schema/auth";
import {
	buildings,
	srPeriodMemberships,
	srProfiles,
	systemPrivileges,
	userProfiles,
} from "@resora/db/schema/identity";
import { assignSyntheticSrTenure } from "@resora/db/sr-tenure.fixture";
import { and, eq, inArray } from "drizzle-orm";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { createApp } from "../../../../../apps/server/src/app";
import { getActiveSrDirectory } from "../identity/identity.public";
import {
	localProvisioningTarget,
	verifyLocalProvisioningDatabase,
} from "../identity/sr-provisioning";
import { eventDraftSchema } from "./attendance.schema";
import * as service from "./attendance.service";
import { signChallenge, verifySessionChallenge } from "./qr";

// Await Drizzle thenables directly: Bun's promise matcher can stall after deferred errors.
async function rejects(operation: PromiseLike<unknown>, code?: string) {
	let failure: unknown;
	try {
		await operation;
	} catch (error) {
		failure = error;
	}
	expect(failure instanceof Error).toBe(true);
	if (code)
		expect(
			failure && typeof failure === "object" && "code" in failure
				? failure.code
				: undefined,
		).toBe(code);
}
const target = process.env.RESORA_IDENTITY_TEST_DB_URL;
(target ? describe : describe.skip)(
	"Attendance on guarded disposable PostgreSQL",
	() => {
		let db: Database;
		let auth: ReturnType<typeof createAuth>;
		let server: Server;
		let base: string;
		const prefix = `synthetic-attendance-${randomUUID()}`;
		const ids = [
			"hco",
			"inti",
			"kadep",
			"rnd",
			"inactive",
			"initial",
			"non-sr",
			"legacy",
		].map((key) => `${prefix}-${key}`);
		const ownedEvents: string[] = [];
		const secret = randomBytes(32).toString("hex");
		const password = randomBytes(24).toString("hex");
		const nims = ids.map(
			(_, index) => `000${randomBytes(8).toString("hex")}${index}`,
		);
		const origin = "http://localhost:3001";
		const request = async (url: string, options?: RequestInit) => {
			const response = await fetch(url, options);
			await response.arrayBuffer();
			return response;
		};
		const id = (index: number) => {
			const value = ids[index];
			if (!value) throw new Error("Missing fixture");
			return value;
		};
		const identity = async (index = 0) => {
			const value = await getActiveSr(db, id(index));
			if (!value) throw new Error("Missing active SR fixture");
			return value;
		};
		const draft = () =>
			eventDraftSchema.parse({
				title: "Synthetic internal event",
				startsAt: "2026-10-18T10:00:00+07:00",
				endsAt: "2026-10-18T11:00:00+07:00",
				rosterCriteria: {
					inti: true,
					kadep: true,
					include: [id(0), id(4), id(6), id(7)],
				},
				session: { centerLat: -6.9, centerLng: 107.6 },
			});
		const create = async () => {
			const result = await service.createEvent(db, await identity(), draft());
			ownedEvents.push(result.eventId);
			return result.eventId;
		};
		const detail = async (eventId: string) =>
			service.getEvent(db, await identity(), eventId);
		const current = async (sessionId: string) => {
			const [row] = await db
				.select()
				.from(qrChallenges)
				.where(
					and(
						eq(qrChallenges.sessionId, sessionId),
						eq(qrChallenges.isCurrent, true),
					),
				);
			if (!row) throw new Error("Missing QR fixture");
			return row;
		};
		const login = async (index: number) => {
			const response = await auth.handler(
				new Request("http://127.0.0.1:3000/api/auth/sign-in/username", {
					method: "POST",
					headers: {
						origin,
						"content-type": "application/json",
						"x-resora-client-ip": `192.0.2.${index + 100}`,
					},
					body: JSON.stringify({ username: nims[index], password }),
				}),
			);
			expect(response.status).toBe(200);
			return response.headers
				.getSetCookie()
				.map((value) => value.split(";")[0])
				.join("; ");
		};
		beforeAll(async () => {
			const url = localProvisioningTarget(target);
			db = createDb({ DATABASE_URL: url });
			await verifyLocalProvisioningDatabase(db, url);
			await seedOrganization(db);
			auth = createAuth(
				{
					BETTER_AUTH_URL: "http://127.0.0.1:3000",
					BETTER_AUTH_SECRET: secret,
					CORS_ORIGIN: origin,
				},
				db,
			);
			const hash = await (await auth.$context).password.hash(password);
			const [building] = await db
				.select()
				.from(buildings)
				.where(eq(buildings.code, "A"));
			if (!building) throw new Error("Missing building");
			await db.transaction(async (tx) => {
				for (const [index, userId] of ids.entries()) {
					await tx.insert(user).values({
						id: userId,
						name: "Synthetic attendance SR",
						email: `${userId}@example.invalid`,
						username: nims[index],
					});
					await tx.insert(account).values({
						id: userId,
						userId,
						accountId: userId,
						providerId: "credential",
						password: hash,
						updatedAt: new Date(),
					});
					await tx.insert(userProfiles).values({
						userId,
						actor: index === 6 ? "MAHASISWA" : "SR",
						isActive: index !== 4,
						mustChangePassword: index === 5,
					});
					if (index !== 6)
						await tx.insert(srProfiles).values({
							userId,
							departmentCode:
								index === 1 ? "INTI" : index === 3 ? "RND" : "HCO",
							positionCode:
								index === 1 || index === 7
									? "KETUM"
									: index === 2 || index === 3
										? "KADEP"
										: "ANGGOTA",
							buildingId: building.id,
						});
				}
				await tx
					.insert(systemPrivileges)
					.values({ userId: id(3), privilegeCode: "SUPERADMIN" });
			});
			await assignSyntheticSrTenure(db, ids);
			server = createApp({ db, auth }, origin).listen(0, "127.0.0.1");
			server.keepAliveTimeout = 1;
			await new Promise<void>((done) => server.once("listening", done));
			const address = server.address();
			if (!address || typeof address === "string")
				throw new Error("Missing listener");
			base = `http://127.0.0.1:${address.port}`;
		}, 20_000);
		afterAll(async () => {
			if (server) {
				server.closeAllConnections();
				server.close();
			}
			if (db) {
				await db.transaction(async (tx) => {
					const sessions = await tx
						.select({ id: attendanceSessions.id })
						.from(attendanceSessions)
						.where(inArray(attendanceSessions.internalEventId, ownedEvents));
					await tx.delete(qrChallenges).where(
						inArray(
							qrChallenges.sessionId,
							sessions.map((row) => row.id),
						),
					);
					await tx
						.delete(eventParticipants)
						.where(inArray(eventParticipants.eventId, ownedEvents));
					await tx
						.delete(attendanceSessions)
						.where(inArray(attendanceSessions.internalEventId, ownedEvents));
					await tx.delete(events).where(inArray(events.id, ownedEvents));
					await tx
						.delete(systemPrivileges)
						.where(inArray(systemPrivileges.userId, ids));
					await tx
						.delete(srPeriodMemberships)
						.where(inArray(srPeriodMemberships.userId, ids));
					await tx.delete(srProfiles).where(inArray(srProfiles.userId, ids));
					await tx.delete(user).where(inArray(user.id, ids));
				});
				await db.$client.end();
			}
		}, 20_000);
		test("local migration history and deferred exactly-one-session triggers exist", async () => {
			expect(
				(
					await db.$client.query(
						"SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations",
					)
				).rows[0]?.n,
			).toBe(
				readMigrationFiles({
					migrationsFolder: resolve(
						import.meta.dir,
						"../../../../db/src/migrations",
					),
				}).length,
			);
			const triggers = await db.$client.query(
				"SELECT tgdeferrable, tginitdeferred, tgenabled FROM pg_trigger WHERE tgname IN ('events_require_session','attendance_sessions_event_consistency')",
			);
			expect(triggers.rows.length).toBe(2);
			expect(
				triggers.rows.every(
					(row) =>
						row.tgdeferrable && row.tginitdeferred && row.tgenabled === "O",
				),
			).toBe(true);
		});
		test("legacy assignments are reported and excluded without modifying users", async () => {
			await rejects(seedOrganization(db));
			const directory = await getActiveSrDirectory(db);
			expect(directory.invalidAssignmentCount).toBe(1);
			expect(
				directory.candidates.some((sr) =>
					[id(4), id(6), id(7)].includes(sr.userId),
				),
			).toBe(false);
			expect(
				(
					await db
						.select()
						.from(srProfiles)
						.where(eq(srProfiles.userId, id(7)))
				)[0]?.positionCode,
			).toBe("KETUM");
		});
		test("HCO and explicit SUPERADMIN manage events; unprivileged INTI/invalid assignments do not", async () => {
			for (const index of [1, 7])
				await rejects(
					service.createEvent(db, await identity(index), draft()),
					"FORBIDDEN",
				);
			const eventId = await create();
			const inti = await identity(1);
			let denied = false;
			try {
				await service.getEvent(db, inti, eventId);
			} catch (error) {
				denied =
					error instanceof Error && error.message === "Event unavailable";
			}
			expect(denied).toBe(true);
			expect(
				(await service.getQr(db, await identity(3), eventId, secret)).state,
			).toBe("NONE");
			const superadminEvent = await service.createEvent(
				db,
				await identity(3),
				draft(),
			);
			ownedEvents.push(superadminEvent.eventId);
			await rejects(
				service.getRosterDirectory(db, await identity(7)),
				"FORBIDDEN",
			);
			expect((await service.listEvents(db, await identity(7))).canManage).toBe(
				false,
			);
		});
		test("event plus session creation is atomic and exactly one session is enforced", async () => {
			const operator = await identity();
			const value = draft();
			const before = (await db.select().from(events)).length;
			await rejects(
				service.createEvent(db, operator, {
					...value,
					session: { ...value.session, geofenceRadiusM: -1 },
				}),
			);
			expect((await db.select().from(events)).length).toBe(before);
			await rejects(
				db.transaction(async (tx) => {
					await tx.insert(events).values({
						title: value.title,
						startsAt: new Date(value.startsAt),
						endsAt: new Date(value.endsAt),
						rosterCriteria: value.rosterCriteria,
						createdByUserId: id(0),
					});
				}),
			);
			const eventId = await create();
			const row = await detail(eventId);
			expect(row.session.status).toBe("INACTIVE");
			await service.editDraft(db, operator, eventId, {
				...value,
				title: "Edited draft",
				session: { ...value.session, qrTtlMinutes: 120 },
			});
			const edited = await detail(eventId);
			expect(edited.event.title).toBe("Edited draft");
			expect(edited.session.qrTtlMinutes).toBe(120);
			await rejects(
				db
					.insert(attendanceSessions)
					.values({ internalEventId: eventId, centerLat: 0, centerLng: 0 })
					.execute(),
			);
			await rejects(
				db.transaction(async (tx) => {
					await tx
						.delete(attendanceSessions)
						.where(eq(attendanceSessions.id, row.session.id));
				}),
			);
			const second = await create();
			await rejects(
				db
					.update(attendanceSessions)
					.set({ internalEventId: second })
					.where(eq(attendanceSessions.id, row.session.id))
					.execute(),
			);
		});
		test("publish resolves live eligibility, snapshots once and does not activate session", async () => {
			const eventId = await create();
			const operator = await identity();
			expect(
				(await service.previewRoster(db, operator, eventId)).participants
					.map((p) => p.userId)
					.sort(),
			).toEqual([id(0), id(1), id(2), id(3)].sort());
			await db
				.update(userProfiles)
				.set({ isActive: false })
				.where(eq(userProfiles.userId, id(3)));
			try {
				expect(
					(await service.publishEvent(db, operator, eventId)).participantCount,
				).toBe(3);
			} finally {
				await db
					.update(userProfiles)
					.set({ isActive: true })
					.where(eq(userProfiles.userId, id(3)));
			}
			const row = await detail(eventId);
			expect(row.event.status).toBe("PUBLISHED");
			expect(row.session.status).toBe("INACTIVE");
			await db
				.update(srProfiles)
				.set({ departmentCode: "SOSIAL" })
				.where(eq(srProfiles.userId, id(2)));
			try {
				expect(
					(await detail(eventId)).participants.find((p) => p.userId === id(2))
						?.departmentCode,
				).toBe("HCO");
			} finally {
				await db
					.update(srProfiles)
					.set({ departmentCode: "HCO" })
					.where(eq(srProfiles.userId, id(2)));
			}
			const invited = await service.getEvent(db, await identity(1), eventId);
			expect(invited.participants).toEqual([]);
			expect(invited.event.rosterCriteria).toBeNull();
			expect(
				(await service.getEvent(db, await identity(3), eventId)).canManage,
			).toBe(true);
			await rejects(
				service.getEvent(db, await identity(7), eventId),
				"NOT_FOUND",
			);
			await rejects(
				service.editDraft(db, operator, eventId, draft()),
				"CONFLICT",
			);
			await service.editMetadata(db, operator, eventId, {
				title: "Updated title",
				description: "Updated description",
			});
			expect((await detail(eventId)).event.title).toBe("Updated title");
			await rejects(service.publishEvent(db, operator, eventId), "CONFLICT");
			await service.closeEvent(db, operator, eventId);
			expect((await detail(eventId)).session.status).toBe("CLOSED");
		});
		test("snapshot insertion failure rolls back publication and all new participants", async () => {
			const eventId = await create();
			await db.insert(eventParticipants).values({
				eventId,
				userId: id(2),
				nim: "000synthetic",
				name: "Synthetic",
				departmentCode: "HCO",
				positionCode: "KADEP",
				buildingCode: "A",
				buildingName: "Gedung A",
			});
			await rejects(service.publishEvent(db, await identity(), eventId));
			const row = await detail(eventId);
			expect(row.event.status).toBe("DRAFT");
			expect(row.participants.length).toBe(1);
		});
		test("QR activation, static redisplay, expiry, revoke and race-safe reissue", async () => {
			const eventId = await create();
			const operator = await identity();
			await service.publishEvent(db, operator, eventId);
			const activation = await Promise.allSettled([
				service.activateSession(db, operator, eventId),
				service.activateSession(db, operator, eventId),
			]);
			expect(activation.filter((r) => r.status === "fulfilled").length).toBe(1);
			const row = await detail(eventId);
			const first = await current(row.session.id);
			expect(first.expiresAt.getTime() - first.activatedAt.getTime()).toBe(
				360 * 60_000,
			);
			const token = signChallenge(secret, row.session.id, first.id);
			expect(
				Boolean(
					await verifySessionChallenge(db, secret, {
						sessionId: row.session.id,
						token,
					}),
				),
			).toBe(true);
			expect(
				await verifySessionChallenge(db, secret, {
					sessionId: randomUUID(),
					token,
				}),
			).toBeNull();
			expect(
				await verifySessionChallenge(
					db,
					secret,
					{ sessionId: row.session.id, token },
					first.expiresAt,
				),
			).toBeNull();
			const image = (await service.getQr(db, operator, eventId, secret)).image;
			expect(image?.startsWith("data:image/png;base64,")).toBe(true);
			expect(
				(await service.getQr(db, operator, eventId, secret)).image === image,
			).toBe(true);
			await rejects(
				service.changeQr(db, operator, eventId, "reissue"),
				"CONFLICT",
			);
			await service.changeQr(db, operator, eventId, "revoke");
			expect((await service.getQr(db, operator, eventId, secret)).state).toBe(
				"REVOKED",
			);
			expect(
				await verifySessionChallenge(db, secret, {
					sessionId: row.session.id,
					token,
				}),
			).toBeNull();
			const issued = await Promise.allSettled([
				service.changeQr(db, operator, eventId, "reissue"),
				service.changeQr(db, operator, eventId, "reissue"),
			]);
			expect(issued.filter((r) => r.status === "fulfilled").length).toBe(1);
			expect(
				(
					await db
						.select()
						.from(qrChallenges)
						.where(
							and(
								eq(qrChallenges.sessionId, row.session.id),
								eq(qrChallenges.isCurrent, true),
							),
						)
				).length,
			).toBe(1);
			const second = await current(row.session.id);
			expect(second.id !== first.id).toBe(true);
			expect(
				await verifySessionChallenge(db, secret, {
					sessionId: row.session.id,
					token,
				}),
			).toBeNull();
			await db
				.update(qrChallenges)
				.set({
					activatedAt: new Date(Date.now() - 120_000),
					expiresAt: new Date(Date.now() - 60_000),
				})
				.where(eq(qrChallenges.id, second.id));
			expect((await service.getQr(db, operator, eventId, secret)).state).toBe(
				"EXPIRED",
			);
			expect((await detail(eventId)).event.status).toBe("PUBLISHED");
			await service.changeQr(db, operator, eventId, "reissue");
			const third = await current(row.session.id);
			const thirdToken = signChallenge(secret, row.session.id, third.id);
			await service.closeEvent(db, operator, eventId);
			const closed = await detail(eventId);
			expect(closed.event.status).toBe("CLOSED");
			expect(closed.session.status).toBe("CLOSED");
			expect(closed.event.closedAt?.getTime()).toBe(
				closed.session.closedAt?.getTime(),
			);
			expect(
				await verifySessionChallenge(db, secret, {
					sessionId: row.session.id,
					token: thirdToken,
				}),
			).toBeNull();
			expect(
				(
					await db
						.select()
						.from(qrChallenges)
						.where(
							and(
								eq(qrChallenges.sessionId, row.session.id),
								eq(qrChallenges.isCurrent, true),
							),
						)
				).length,
			).toBe(0);
			await rejects(service.activateSession(db, operator, eventId), "CONFLICT");
			await rejects(
				service.getEvent(db, await identity(1), eventId),
				"NOT_FOUND",
			);
		});
		test("real Express/tRPC transport preserves authentication, password gate and DB authorization", async () => {
			const call = (cookie?: string) =>
				request(`${base}/trpc/attendance.list`, {
					headers: cookie ? { cookie } : {},
				});
			expect((await call()).status).toBe(401);
			expect((await call("better-auth.session_token=invalid")).status).toBe(
				401,
			);
			expect((await call(await login(5))).status).toBe(200);
			const cookie = await login(0);
			expect((await call(cookie)).status).toBe(200);
			await db
				.update(userProfiles)
				.set({ isActive: false })
				.where(eq(userProfiles.userId, id(0)));
			try {
				expect((await call(cookie)).status).toBe(401);
			} finally {
				await db
					.update(userProfiles)
					.set({ isActive: true })
					.where(eq(userProfiles.userId, id(0)));
			}
			const nonHco = await login(1);
			const response = await request(`${base}/trpc/attendance.create`, {
				method: "POST",
				headers: { cookie: nonHco, origin, "content-type": "application/json" },
				body: JSON.stringify(draft()),
			});
			expect(response.status).toBe(403);
			const forged = await request(`${base}/trpc/attendance.create`, {
				method: "POST",
				headers: { cookie: nonHco, origin, "content-type": "application/json" },
				body: JSON.stringify({
					...draft(),
					departmentCode: "HCO",
					isSuperadmin: true,
				}),
			});
			expect(forged.status).toBe(400);
			const eventId = await create();
			await service.publishEvent(db, await identity(), eventId);
			const frozen = await request(`${base}/trpc/attendance.editMetadata`, {
				method: "POST",
				headers: { cookie, origin, "content-type": "application/json" },
				body: JSON.stringify({
					eventId,
					title: "Allowed title",
					description: "",
					startsAt: draft().startsAt,
				}),
			});
			expect(frozen.status).toBe(400);
		});
		test("failed activation and close leave event/session/QR unchanged", async () => {
			const eventId = await create();
			const operator = await identity();
			await service.publishEvent(db, operator, eventId);
			const { session } = await detail(eventId);
			await db.insert(qrChallenges).values({
				sessionId: session.id,
				activatedAt: new Date(),
				expiresAt: new Date(Date.now() + 60_000),
				issuedByUserId: id(0),
			});
			await rejects(service.activateSession(db, operator, eventId));
			expect((await detail(eventId)).session.status).toBe("INACTIVE");
			await db
				.delete(qrChallenges)
				.where(eq(qrChallenges.sessionId, session.id));
			await service.activateSession(db, operator, eventId);
			// Synthetic scratch-only failure at the final write proves earlier close writes roll back.
			await db.$client.query(
				`ALTER TABLE public.events ADD CONSTRAINT synthetic_phase4_close_guard CHECK (status <> 'CLOSED' OR id <> '${eventId}'::uuid)`,
			);
			try {
				await rejects(service.closeEvent(db, operator, eventId));
				const row = await detail(eventId);
				expect(row.event.status).toBe("PUBLISHED");
				expect(row.session.status).toBe("ACTIVE");
				expect((await current(session.id)).revokedAt).toBeNull();
			} finally {
				await db.$client.query(
					"ALTER TABLE public.events DROP CONSTRAINT synthetic_phase4_close_guard",
				);
			}
			await service.changeQr(db, operator, eventId, "revoke");
			const revoked = await current(session.id);
			await service.closeEvent(db, operator, eventId);
			const [stored] = await db
				.select()
				.from(qrChallenges)
				.where(eq(qrChallenges.id, revoked.id));
			expect(stored?.revokedAt?.getTime()).toBe(revoked.revokedAt?.getTime());
		});
	},
);
