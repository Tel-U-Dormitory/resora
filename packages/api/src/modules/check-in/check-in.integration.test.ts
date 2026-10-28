import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomBytes, randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { getActiveSr } from "@resora/auth/sr-access";
import { createDb, type Database } from "@resora/db";
import { seedOrganization } from "@resora/db/organization";
import {
	attendanceRecords,
	attendanceSessions,
	eventParticipants,
	events,
	qrChallenges,
} from "@resora/db/schema/attendance";
import { user } from "@resora/db/schema/auth";
import {
	buildings,
	srPeriodMemberships,
	srProfiles,
	userProfiles,
} from "@resora/db/schema/identity";
import { assignSyntheticSrTenure } from "@resora/db/sr-tenure.fixture";
import { and, eq, inArray, sql } from "drizzle-orm";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { eventDraftSchema } from "../attendance/attendance.schema";
import * as service from "../events/event.service";
import {
	localProvisioningTarget,
	verifyLocalProvisioningDatabase,
} from "../provisioning/sr-provisioning";
import { checkIn } from "./check-in";
import { signChallenge } from "./qr";

const target = process.env.RESORA_IDENTITY_TEST_DB_URL;
// Existing loopback guard, plus an empty, purpose-specific migrated disposable DB.
(target ? describe : describe.skip)(
	"QR shared locks on disposable PostgreSQL",
	() => {
		let db: Database;
		let verified = false;
		const creatorId = `synthetic-qr-${randomUUID()}`;
		const ids = [
			creatorId,
			`synthetic-qr-${randomUUID()}`,
			`synthetic-qr-${randomUUID()}`,
		];
		const secret = randomBytes(32).toString("hex");
		let identities: NonNullable<Awaited<ReturnType<typeof getActiveSr>>>[] = [];
		const identity = (index: number) => {
			const result = identities[index];
			if (!result) throw Error("SYNTHETIC_IDENTITY_REQUIRED");
			return result;
		};
		beforeAll(async () => {
			const url = localProvisioningTarget(target);
			if (
				!/^\/resora_identity_test_qr_[a-f0-9]{12}$/.test(new URL(url).pathname)
			)
				throw Error("DISPOSABLE_QR_TEST_DATABASE_REQUIRED");
			db = createDb({ DATABASE_URL: url, DB_POOL_MAX: 5 });
			db.$client.options.statement_timeout = 8000;
			db.$client.options.lock_timeout = 3000;
			await verifyLocalProvisioningDatabase(db, url);
			const history = await db.execute<{ hash: string }>(
				sql`select hash from drizzle.__drizzle_migrations order by id`,
			);
			expect(history.rows.map((row) => row.hash)).toEqual(
				readMigrationFiles({
					migrationsFolder: resolve(
						import.meta.dir,
						"../../../../db/src/migrations",
					),
				}).map((migration) => migration.hash),
			);
			const existing = await db.execute<{ n: number; isolation: string }>(sql`
			select ((select count(*) from "user") + (select count(*) from events))::int n,
			current_setting('transaction_isolation') isolation`);
			expect(existing.rows[0]).toEqual({ n: 0, isolation: "read committed" });
			verified = true;
			await seedOrganization(db);
			const [building] = await db
				.select()
				.from(buildings)
				.where(eq(buildings.code, "A"));
			if (!building) throw Error("SYNTHETIC_BUILDING_REQUIRED");
			await db.transaction(async (tx) => {
				for (const [index, id] of ids.entries()) {
					await tx.insert(user).values({
						id,
						name: "Synthetic QR test",
						email: `${id}@synthetic.invalid`,
						username: `000${randomBytes(8).toString("hex")}`,
					});
					await tx
						.insert(userProfiles)
						.values({ userId: id, actor: "SR", mustChangePassword: false });
					await tx.insert(srProfiles).values({
						userId: id,
						departmentCode: index === 0 ? "HCO" : "RND",
						positionCode: "ANGGOTA",
						buildingId: building.id,
					});
				}
			});
			await assignSyntheticSrTenure(db, ids);
			const result = await Promise.all(ids.map((id) => getActiveSr(db, id)));
			if (result.some((entry) => !entry))
				throw Error("SYNTHETIC_IDENTITIES_REQUIRED");
			identities = result as typeof identities;
		});
		afterAll(async () => {
			try {
				if (!verified) return;
				// Only this run's random creator/users; deferred session constraints stay enabled.
				await db.transaction(async (tx) => {
					const owned = await tx
						.select({ id: events.id })
						.from(events)
						.where(eq(events.createdByUserId, creatorId));
					const eventIds = owned.map((row) => row.id);
					if (eventIds.length) {
						const sessions = await tx
							.select({ id: attendanceSessions.id })
							.from(attendanceSessions)
							.where(inArray(attendanceSessions.internalEventId, eventIds));
						const sessionIds = sessions.map((row) => row.id);
						if (sessionIds.length) {
							await tx
								.delete(attendanceRecords)
								.where(inArray(attendanceRecords.sessionId, sessionIds));
							await tx
								.delete(qrChallenges)
								.where(inArray(qrChallenges.sessionId, sessionIds));
						}
						await tx
							.delete(eventParticipants)
							.where(inArray(eventParticipants.eventId, eventIds));
						await tx
							.delete(attendanceSessions)
							.where(inArray(attendanceSessions.internalEventId, eventIds));
						await tx.delete(events).where(inArray(events.id, eventIds));
					}
					await tx
						.delete(srPeriodMemberships)
						.where(inArray(srPeriodMemberships.userId, ids));
					await tx.delete(srProfiles).where(inArray(srProfiles.userId, ids));
					await tx
						.delete(userProfiles)
						.where(inArray(userProfiles.userId, ids));
					await tx.delete(user).where(inArray(user.id, ids));
				});
			} finally {
				if (db) await db.$client.end();
			}
		});
		async function current(sessionId: string) {
			const [row] = await db
				.select()
				.from(qrChallenges)
				.where(
					and(
						eq(qrChallenges.sessionId, sessionId),
						eq(qrChallenges.isCurrent, true),
					),
				);
			if (!row) throw Error("CURRENT_QR_REQUIRED");
			return row;
		}
		async function fixture() {
			const event = await service.createEvent(
				db,
				identity(0),
				eventDraftSchema.parse({
					title: "Synthetic shared-lock QR test",
					startsAt: new Date(Date.now() - 60_000).toISOString(),
					endsAt: new Date(Date.now() + 3600_000).toISOString(),
					rosterCriteria: { individuals: ids.slice(1) },
					session: { centerLat: 0, centerLng: 0 },
				}),
			);
			await service.publishEvent(db, identity(0), event.eventId);
			await service.activateSession(db, identity(0), event.eventId);
			const [session] = await db
				.select()
				.from(attendanceSessions)
				.where(eq(attendanceSessions.internalEventId, event.eventId));
			if (!session) throw Error("SESSION_REQUIRED");
			const challenge = await current(session.id);
			return {
				id: event.eventId,
				sessionId: session.id,
				input: {
					qrToken: signChallenge(secret, session.id, challenge.id),
					location: { latitude: 0, longitude: 0, accuracyMeters: 1 },
				},
			};
		}
		async function records(sessionId: string) {
			return db
				.select()
				.from(attendanceRecords)
				.where(eq(attendanceRecords.sessionId, sessionId));
		}
		// Hold the actual service transaction AFTER its work, BEFORE commit. No replacement row locks.
		function observed(hold = false) {
			const pid = Promise.withResolvers<number>();
			const ready = Promise.withResolvers<void>();
			const release = Promise.withResolvers<void>();
			const source = new Proxy(db, {
				get(object, key, receiver) {
					if (key !== "transaction") return Reflect.get(object, key, receiver);
					return (callback: Parameters<Database["transaction"]>[0]) =>
						db.transaction(async (tx) => {
							const result = await tx.execute<{ pid: number }>(
								sql`select pg_backend_pid() pid`,
							);
							const backend = result.rows[0]?.pid;
							if (!backend) throw Error("BACKEND_PID_REQUIRED");
							pid.resolve(backend);
							const value = await callback(tx);
							ready.resolve();
							if (hold) {
								const timeout = setTimeout(
									() => release.reject(Error("TEST_GATE_TIMEOUT")),
									5000,
								);
								try {
									await release.promise;
								} finally {
									clearTimeout(timeout);
								}
							}
							return value;
						});
				},
			});
			return {
				source,
				pid: pid.promise,
				ready: ready.promise,
				release: release.resolve,
			};
		}
		async function ordered(
			first: (source: Database) => Promise<unknown>,
			second: (source: Database) => Promise<unknown>,
		) {
			const a = observed(true);
			const b = observed();
			const one = first(a.source);
			try {
				await Promise.race([a.ready, one]);
				const two = second(b.source);
				const outcomes = Promise.allSettled([one, two]);
				try {
					const blocker = await a.pid;
					const waiter = await Promise.race([
						b.pid,
						two.then(() => {
							throw Error("EXPECTED_WAITING_TRANSACTION");
						}),
					]);
					let blocked = false;
					const deadline = Date.now() + 2000;
					while (Date.now() < deadline) {
						const result = await db.execute<{ blocked: boolean }>(
							sql`select ${blocker} = any(pg_blocking_pids(${waiter})) blocked`,
						);
						if (result.rows[0]?.blocked) {
							blocked = true;
							break;
						}
					}
					expect(blocked).toBe(true);
				} finally {
					a.release();
				}
				return await outcomes;
			} finally {
				a.release();
				await Promise.allSettled([one]);
			}
		}
		test("distinct SR check-in commits while another check-in still holds event/session locks", async () => {
			const f = await fixture();
			const held = observed(true);
			const first = checkIn(held.source, identity(1), secret, f.input);
			try {
				await Promise.race([held.ready, first]);
				expect((await checkIn(db, identity(2), secret, f.input)).status).toBe(
					"CHECKED_IN",
				);
				expect(await records(f.sessionId)).toHaveLength(1); // First transaction is still uncommitted.
				// SHARE must also block non-key session updates (KEY SHARE would not).
				let conflict: unknown;
				try {
					await db.transaction(async (tx) => {
						await tx.execute(
							sql`select id from attendance_sessions where id=${f.sessionId} for no key update nowait`,
						);
					});
				} catch (error) {
					conflict = error;
				}
				expect((conflict as { cause?: { code?: string } })?.cause?.code).toBe(
					"55P03",
				);
			} finally {
				held.release();
				await Promise.allSettled([first]);
			}
			expect((await first).status).toBe("CHECKED_IN");
			expect(await records(f.sessionId)).toHaveLength(2);
		}, 15000);
		test("concurrent duplicate shares read locks but uniqueness permits exactly one original record", async () => {
			const f = await fixture();
			const result = await ordered(
				(source) => checkIn(source, identity(1), secret, f.input),
				(source) => checkIn(source, identity(1), secret, f.input),
			);
			expect(
				result.map((entry) =>
					entry.status === "fulfilled"
						? (entry.value as { status: string }).status
						: "REJECTED",
				),
			).toEqual(["CHECKED_IN", "ALREADY_CHECKED_IN"]);
			expect(await records(f.sessionId)).toHaveLength(1);
		}, 15000);
		for (const action of ["close", "revoke", "metadata"] as const) {
			test(`QR check-in vs ${action} respects both transaction orders`, async () => {
				for (const adminFirst of [false, true]) {
					const f = await fixture();
					const scan = (source: Database) =>
						checkIn(source, identity(1), secret, f.input);
					const admin = (source: Database) =>
						action === "close"
							? service.closeEvent(source, identity(0), f.id)
							: action === "revoke"
								? service.changeQr(source, identity(0), f.id, "revoke")
								: service.editMetadata(source, identity(0), f.id, {
										title: "Synthetic revised title",
										description: "Synthetic metadata edit",
									});
					const result = await ordered(
						adminFirst ? admin : scan,
						adminFirst ? scan : admin,
					);
					expect(result[0]?.status).toBe("fulfilled");
					expect(result[1]?.status).toBe(
						adminFirst && action !== "metadata" ? "rejected" : "fulfilled",
					);
					const scanResult = result[adminFirst ? 1 : 0];
					if (scanResult?.status === "rejected")
						expect((scanResult.reason as Error).message).toBe(
							action === "close" ? "SESSION_CLOSED" : "QR_REVOKED",
						);
					expect(await records(f.sessionId)).toHaveLength(
						adminFirst && action !== "metadata" ? 0 : 1,
					);
					if (action !== "metadata") {
						let rejected: unknown;
						try {
							await checkIn(db, identity(2), secret, f.input);
						} catch (error) {
							rejected = error;
						}
						expect((rejected as Error).message).toBe(
							action === "close" ? "SESSION_CLOSED" : "QR_REVOKED",
						);
					}
				}
			}, 15000);
		}
		test("reissue waits for in-flight check-in and rejects a valid current challenge; replaced QR stays invalid", async () => {
			const f = await fixture();
			const result = await ordered(
				(source) => checkIn(source, identity(1), secret, f.input),
				(source) => service.changeQr(source, identity(0), f.id, "reissue"),
			);
			expect(result[0]?.status).toBe("fulfilled");
			expect(result[1]?.status).toBe("rejected"); // Existing business rule: revoke/expire before reissuing.
			await service.changeQr(db, identity(0), f.id, "revoke");
			const replaced = await ordered(
				(source) => service.changeQr(source, identity(0), f.id, "reissue"),
				(source) => checkIn(source, identity(2), secret, f.input),
			);
			expect(replaced[0]?.status).toBe("fulfilled");
			expect(replaced[1]?.status).toBe("rejected");
			if (replaced[1]?.status === "rejected")
				expect((replaced[1].reason as Error).message).toBe("QR_REVOKED");
			const fresh = await current(f.sessionId);
			expect(
				(
					await checkIn(db, identity(2), secret, {
						...f.input,
						qrToken: signChallenge(secret, f.sessionId, fresh.id),
					})
				).status,
			).toBe("CHECKED_IN");
			expect(await records(f.sessionId)).toHaveLength(2);
		}, 15000);
	},
);
