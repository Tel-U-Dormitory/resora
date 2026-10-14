import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createAuth } from "@resora/auth";
import { getActiveIdentity } from "@resora/auth/sr-access";
import { createDb, type Database } from "@resora/db";
import { seedOrganization } from "@resora/db/organization";
import {
	attendanceAuditLogs,
	attendanceRecords,
	events,
	qrChallenges,
} from "@resora/db/schema/attendance";
import { user } from "@resora/db/schema/auth";
import {
	accountAuditLogs,
	srProfiles,
	systemPrivileges,
	userProfiles,
} from "@resora/db/schema/identity";
import { eq, sql } from "drizzle-orm";
import { appRouter } from "../../routers";
import { eventDraftSchema } from "../attendance/attendance.schema";
import { signChallenge } from "../attendance/qr";
import { getActiveSrDirectory } from "./identity.public";
import { readCsv } from "./provisioning-csv";
import {
	localProvisioningTarget,
	verifyLocalProvisioningDatabase,
} from "./sr-provisioning";
import {
	type BootstrapTarget,
	bootstrapSystemAdmin,
	verifyBootstrapDatabase,
} from "./system-admin-bootstrap";

const url = process.env.RESORA_IDENTITY_TEST_DB_URL;
const root = resolve(import.meta.dir, "../../../../..");
(url ? describe : describe.skip)(
	"SA-01/02/03 on guarded disposable PostgreSQL",
	() => {
		let db: Database;
		let auth: ReturnType<typeof createAuth>;
		let target: BootstrapTarget;
		let adminId: string;
		let credentialPath: string;
		let cookie: string;
		let srId: string;
		let secondSrId: string;
		let eventId: string;
		let recordId: string;
		let adminInitialPassword: string;
		const adminPassword = randomBytes(24).toString("base64url");
		const srPassword = randomBytes(24).toString("base64url");
		const config = {
			BETTER_AUTH_URL: "http://127.0.0.1:3000",
			CORS_ORIGIN: "http://127.0.0.1:3001",
			BETTER_AUTH_SECRET: randomBytes(32).toString("hex"),
			NODE_ENV: "test",
		};
		const adminInput = {
			username: "resora.admin",
			name: "Synthetic System Admin SA03",
			email: "system-sa03@example.invalid",
		};
		const bootstrap = (mode: "dry-run" | "apply") =>
			bootstrapSystemAdmin({
				db,
				authConfig: config,
				target,
				projectRoot: root,
				input: adminInput,
				mode,
			});
		async function authRequest(
			path: string,
			body?: unknown,
			requestCookie?: string,
			ip = "127.0.0.12",
		) {
			return auth.handler(
				new Request(`${config.BETTER_AUTH_URL}/api/auth/${path}`, {
					method: body ? "POST" : "GET",
					headers: {
						origin: config.CORS_ORIGIN,
						"content-type": "application/json",
						"x-resora-client-ip": ip,
						...(requestCookie ? { cookie: requestCookie } : {}),
					},
					...(body ? { body: JSON.stringify(body) } : {}),
				}),
			);
		}
		const cookies = (response: Response) =>
			response.headers
				.getSetCookie()
				.map((value) => value.split(";")[0])
				.join("; ");
		async function caller() {
			let session = null;
			try {
				session = await auth.api.getSession({
					headers: new Headers({ cookie }),
				});
			} catch (error) {
				if (
					!error ||
					typeof error !== "object" ||
					!("statusCode" in error) ||
					error.statusCode !== 401
				)
					throw error;
			}
			return appRouter.createCaller({
				db,
				authConfig: config,
				session,
				qrSigningSecret: config.BETTER_AUTH_SECRET,
			});
		}
		async function rejected(operation: PromiseLike<unknown>, message?: string) {
			let failed: unknown;
			try {
				await operation;
			} catch (error) {
				failed = error;
			}
			expect(failed instanceof Error).toBe(true);
			if (message)
				expect(
					failed instanceof Error && failed.message.includes(message),
				).toBe(true);
		}
		beforeAll(async () => {
			if (!url) throw new Error("Local test URL required");
			const parsed = new URL(localProvisioningTarget(url));
			if (!parsed.pathname.startsWith("/resora_identity_test_sa03_"))
				throw new Error("SA03-exclusive empty test database required");
			db = createDb({ DATABASE_URL: url });
			await verifyLocalProvisioningDatabase(db, url);
			target = { mode: "local", url, database: parsed.pathname.slice(1) };
			await verifyBootstrapDatabase(db, target, root);
			const count = await db.execute<{ count: number }>(
				sql`SELECT count(*)::int AS count FROM public."user"`,
			);
			if (count.rows[0]?.count !== 0)
				throw new Error(
					"SA03 fixture database must be empty; never reuse real or previous data",
				);
			auth = createAuth(config, db);
		}, 15000);
		afterAll(async () => {
			await db?.$client.end();
		});

		test("dry-run/preflight makes no account/export writes; failed export cannot leave an account", async () => {
			expect(await bootstrap("dry-run")).toMatchObject({
				created: 0,
				planned: 1,
			});
			await rejected(
				bootstrapSystemAdmin({
					db,
					authConfig: config,
					target,
					projectRoot: root,
					input: adminInput,
					mode: "apply",
					prepareOutput: async () => {
						throw new Error("synthetic export failure");
					},
				}),
				"BOOTSTRAP_FAILED",
			);
			expect(await db.select().from(userProfiles)).toHaveLength(0);
			expect(await db.select().from(systemPrivileges)).toHaveLength(0);
		});

		test("bootstrap audit failure rolls back user/credential/profile/grant atomically", async () => {
			await db.execute(
				sql`CREATE FUNCTION public.sa03_test_reject_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Synthetic audit failure'; END; $$`,
			);
			await db.execute(
				sql`CREATE TRIGGER sa03_test_reject_audit BEFORE INSERT ON public.account_audit_logs FOR EACH ROW EXECUTE FUNCTION public.sa03_test_reject_audit()`,
			);
			try {
				await rejected(
					bootstrapSystemAdmin({
						db,
						authConfig: config,
						target,
						projectRoot: root,
						input: adminInput,
						mode: "apply",
						prepareOutput: async () => ({
							path: "synthetic-no-export.csv",
							mark: async () => {},
						}),
					}),
					"BOOTSTRAP_FAILED",
				);
				expect(await db.select().from(user)).toHaveLength(0);
				expect(await db.select().from(userProfiles)).toHaveLength(0);
				expect(await db.select().from(systemPrivileges)).toHaveLength(0);
			} finally {
				await db.execute(
					sql`DROP TRIGGER sa03_test_reject_audit ON public.account_audit_logs`,
				);
				await db.execute(sql`DROP FUNCTION public.sa03_test_reject_audit()`);
			}
		});

		test("concurrent bootstrap creates exactly one dedicated account and COMMITTED private export", async () => {
			const results = await Promise.allSettled([
				bootstrap("apply"),
				bootstrap("apply"),
			]);
			expect(
				results.filter((result) => result.status === "fulfilled"),
			).toHaveLength(1);
			const winner = results.find((result) => result.status === "fulfilled");
			if (
				winner?.status !== "fulfilled" ||
				!("userId" in winner.value) ||
				!winner.value.userId ||
				!winner.value.credentialsFile
			)
				throw new Error("Missing bootstrap result");
			adminId = winner.value.userId;
			credentialPath = winner.value.credentialsFile;
			const [header, values] = readCsv(await readFile(credentialPath, "utf8"));
			expect(header?.[0]).toBe("username");
			const password = values?.[3];
			if (!password) throw new Error("Missing private synthetic credential");
			adminInitialPassword = password;
			expect(password.length).toBeGreaterThanOrEqual(24);
			const status = JSON.parse(
				await readFile(resolve(credentialPath, "../status.json"), "utf8"),
			);
			expect(status.state).toBe("COMMITTED");
			expect(
				await db
					.select()
					.from(srProfiles)
					.where(eq(srProfiles.userId, adminId)),
			).toHaveLength(0);
			const [grant] = await db
				.select()
				.from(systemPrivileges)
				.where(eq(systemPrivileges.userId, adminId));
			expect(grant?.grantedByUserId).toBeNull();
			const [audit] = await db
				.select()
				.from(accountAuditLogs)
				.where(eq(accountAuditLogs.targetUserId, adminId));
			expect(audit).toMatchObject({
				actorUserId: null,
				action: "SYSTEM_ADMIN_BOOTSTRAPPED",
			});
		});

		test("dedicated login and mandatory password change work; no profile/organization/NIM fabrication", async () => {
			const login = await authRequest("sign-in/username", {
				username: adminInput.username,
				password: adminInitialPassword,
			});
			expect(login.status).toBe(200);
			cookie = cookies(login);
			let api = await caller();
			expect(await api.identity.session()).toMatchObject({
				actor: "SYSTEM_ADMIN",
				username: adminInput.username,
				mustChangePassword: true,
				isSuperadmin: false,
			});
			await rejected(api.identity.listAccounts({}), "PASSWORD_CHANGE_REQUIRED");
			const changed = await authRequest(
				"change-password",
				{
					currentPassword: adminInitialPassword,
					newPassword: adminPassword,
					revokeOtherSessions: true,
				},
				cookie,
			);
			expect(changed.status).toBe(200);
			if (cookies(changed)) cookie = cookies(changed);
			api = await caller();
			const session = await api.identity.session();
			expect(session?.mustChangePassword).toBe(false);
			const profile = await api.identity.profile();
			expect(profile.actor).toBe("SYSTEM_ADMIN");
			for (const field of ["nim", "department", "position", "building"])
				expect(profile).not.toHaveProperty(field);
		});

		test("SR fixtures still login; dedicated admin can create/list SR through SA02 and never grants admin implicitly", async () => {
			await seedOrganization(db, true);
			const api = await caller();
			const created = await api.identity.createAccount({
				name: "Synthetic SA03 SR",
				nim: "0000000301",
				email: "sr-sa03@example.invalid",
				departmentCode: "HCO",
				positionCode: "ANGGOTA",
				buildingCode: "A",
			});
			srId = created.userId;
			const srLogin = await authRequest(
				"sign-in/username",
				{ username: created.nim, password: created.temporaryPassword },
				undefined,
				"127.0.0.13",
			);
			expect(srLogin.status).toBe(200);
			const srCookie = cookies(srLogin);
			const changed = await authRequest(
				"change-password",
				{ currentPassword: created.temporaryPassword, newPassword: srPassword },
				srCookie,
				"127.0.0.13",
			);
			expect(changed.status).toBe(200);
			const srSession = await auth.api.getSession({
				headers: new Headers({ cookie: cookies(changed) || srCookie }),
			});
			const srCaller = appRouter.createCaller({
				db,
				authConfig: config,
				session: srSession,
			});
			await rejected(srCaller.identity.listAccounts({}), "SUPERADMIN_REQUIRED");
			const listing = await api.identity.listAccounts({ search: "0000000301" });
			expect(listing.accounts).toHaveLength(1);
			expect(listing.accounts[0]?.nim).toBe("0000000301");
			expect(
				await db
					.select()
					.from(systemPrivileges)
					.where(eq(systemPrivileges.userId, srId)),
			).toHaveLength(0);
			const second = await api.identity.createAccount({
				name: "Synthetic SA03 second SR",
				nim: "0000000302",
				email: "second-sr-sa03@example.invalid",
				departmentCode: "RND",
				positionCode: "ANGGOTA",
				buildingCode: "B",
			});
			secondSrId = second.userId;
		});

		test("system operator manages event/QR/manual/correction/recap without entering SR roster/check-in/history", async () => {
			const api = await caller();
			const draft = eventDraftSchema.parse({
				title: "SYNTHETIC-SA03-INTEGRATION",
				startsAt: new Date(Date.now() - 3600000).toISOString(),
				endsAt: new Date(Date.now() + 3600000).toISOString(),
				rosterCriteria: { allSr: true },
				session: { centerLat: 0, centerLng: 0 },
			});
			const event = await api.attendance.create(draft);
			eventId = event.eventId;
			await api.attendance.editDraft({
				eventId,
				draft: { ...draft, description: "Synthetic only" },
			});
			await api.attendance.publish({ eventId });
			await api.attendance.editMetadata({
				eventId,
				title: draft.title,
				description: "Published synthetic",
			});
			const detail = await api.attendance.detail({ eventId });
			expect(
				detail.participants.map((participant) => participant.userId).sort(),
			).toEqual([srId, secondSrId].sort());
			expect(
				(await getActiveSrDirectory(db)).candidates.some(
					(candidate) => candidate.userId === adminId,
				),
			).toBe(false);
			await api.attendance.activate({ eventId });
			expect((await api.attendance.qr({ eventId })).state).toBe("ACTIVE");
			await api.attendance.revokeQr({ eventId });
			await api.attendance.reissueQr({ eventId });
			const [challenge] = await db
				.select()
				.from(qrChallenges)
				.where(eq(qrChallenges.sessionId, detail.session.id));
			if (!challenge) throw new Error("Missing synthetic challenge");
			await rejected(
				api.attendance.checkIn({
					qrToken: signChallenge(
						config.BETTER_AUTH_SECRET,
						detail.session.id,
						challenge.id,
					),
					location: { latitude: 0, longitude: 0, accuracyMeters: 10 },
				}),
				"NOT_ELIGIBLE",
			);
			await rejected(api.attendance.ownHistory({}));
			const inserted = await api.attendance.manualInsert({
				eventId,
				userId: srId,
				reason: "Synthetic admin insert",
			});
			recordId = inserted.attendanceId;
			await api.attendance.manualCorrect({
				attendanceId: recordId,
				attendanceAt: new Date(Date.now() - 7200000).toISOString(),
				reason: "Synthetic admin correction",
			});
			const [record] = await db
				.select()
				.from(attendanceRecords)
				.where(eq(attendanceRecords.id, recordId));
			expect(record).toMatchObject({
				source: "MANUAL",
				recordedByUserId: adminId,
				timingClass: "EARLY",
			});
			const audits = await db
				.select()
				.from(attendanceAuditLogs)
				.where(eq(attendanceAuditLogs.attendanceId, recordId));
			expect(audits).toHaveLength(2);
			expect(audits.every((audit) => audit.actorUserId === adminId)).toBe(true);
			expect((await api.attendance.recap({ eventId })).counts.present).toBe(1);
			expect(
				(await api.attendance.exportCsv({ eventId })).content.includes(
					"scanLat",
				),
			).toBe(false);
			await api.attendance.close({ eventId });
			expect((await api.attendance.detail({ eventId })).session.status).toBe(
				"CLOSED",
			);
		});

		test("grant revocation/deactivation and password gate take effect without relogin", async () => {
			await db
				.delete(systemPrivileges)
				.where(eq(systemPrivileges.userId, adminId));
			expect(await getActiveIdentity(db, adminId)).toBeNull();
			await rejected(
				(await caller()).identity.listAccounts({}),
				"Authentication required",
			);
			const deniedLogin = await authRequest("sign-in/username", {
				username: adminInput.username,
				password: adminPassword,
			});
			expect(deniedLogin.status).toBe(401);
			await db.insert(systemPrivileges).values({
				userId: adminId,
				privilegeCode: "SUPERADMIN",
				grantedByUserId: null,
			});
			await db
				.update(userProfiles)
				.set({ isActive: false })
				.where(eq(userProfiles.userId, adminId));
			await rejected(
				(await caller()).attendance.recap({ eventId }),
				"Authentication required",
			);
			await db
				.update(userProfiles)
				.set({ isActive: true, mustChangePassword: true })
				.where(eq(userProfiles.userId, adminId));
			await rejected(
				(await caller()).identity.listAccounts({}),
				"PASSWORD_CHANGE_REQUIRED",
			);
			await db
				.update(userProfiles)
				.set({ mustChangePassword: false })
				.where(eq(userProfiles.userId, adminId));
			expect(
				(await (await caller()).identity.listAccounts({})).accounts,
			).toHaveLength(2);
		});

		test("parallel SA02 creations use DB uniqueness and produce exactly one account/audit", async () => {
			const api = await caller();
			const input = {
				name: "Synthetic SA03 concurrent SR",
				nim: "0000000303",
				email: "concurrent-sr-sa03@example.invalid",
				departmentCode: "RND",
				positionCode: "ANGGOTA",
				buildingCode: "B",
			};
			const results = await Promise.allSettled([
				api.identity.createAccount(input),
				api.identity.createAccount(input),
			]);
			expect(
				results.filter((result) => result.status === "fulfilled"),
			).toHaveLength(1);
			const [target] = await db
				.select({ id: user.id })
				.from(user)
				.where(eq(user.username, input.nim));
			if (!target) throw new Error("Missing synthetic concurrent target");
			expect(
				await db
					.select()
					.from(accountAuditLogs)
					.where(eq(accountAuditLogs.targetUserId, target.id)),
			).toHaveLength(1);
			await rejected(
				api.attendance.manualInsert({
					eventId,
					userId: target.id,
					attendanceAt: new Date(Date.now() - 7200000).toISOString(),
					reason: "Uninvited synthetic target",
				}),
				"NOT_INVITED",
			);
		});

		test("concurrent SYSTEM_ADMIN corrections serialize original before/after audit states", async () => {
			const api = await caller();
			const before = await db
				.select()
				.from(attendanceRecords)
				.where(eq(attendanceRecords.id, recordId));
			await Promise.all(
				[0, 1].map((index) =>
					api.attendance.manualCorrect({
						attendanceId: recordId,
						attendanceAt: new Date(
							Date.now() - 7200000 + index * 1000,
						).toISOString(),
						reason: "Concurrent synthetic correction",
					}),
				),
			);
			const logs = await api.attendance.auditHistory({ eventId, userId: srId });
			expect(logs.items).toHaveLength(4);
			expect(logs.items[0]?.before?.attendanceAt).toBe(
				logs.items[1]?.after.attendanceAt,
			);
			expect(logs.items[1]?.before?.attendanceAt).toBe(
				before[0]?.attendanceAt.toISOString(),
			);
		});

		test("privilege revoked while manual mutation waits for event lock is rechecked in PostgreSQL", async () => {
			const api = await caller();
			let unlock: () => void = () => {};
			let locked: () => void = () => {};
			const ready = new Promise<void>((resolve) => {
				locked = resolve;
			});
			const release = new Promise<void>((resolve) => {
				unlock = resolve;
			});
			const blocker = db.transaction(async (tx) => {
				await tx
					.select({ id: events.id })
					.from(events)
					.where(eq(events.id, eventId))
					.for("update");
				locked();
				await release;
			});
			await ready;
			const result = api.attendance
				.manualCorrect({
					attendanceId: recordId,
					attendanceAt: new Date(Date.now() - 7200000).toISOString(),
					reason: "Revoked synthetic operator",
				})
				.then(
					() => ({ allowed: true, message: "" }),
					(error: Error) => ({ allowed: false, message: error.message }),
				);
			try {
				let waiting = false;
				for (let attempt = 0; attempt < 40; attempt++) {
					const count = await db.execute<{ count: number }>(
						sql`SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND pid<>pg_backend_pid()`,
					);
					if ((count.rows[0]?.count ?? 0) > 0) {
						waiting = true;
						break;
					}
					await new Promise((resolve) => setTimeout(resolve, 50));
				}
				expect(waiting).toBe(true);
				await db
					.delete(systemPrivileges)
					.where(eq(systemPrivileges.userId, adminId));
				unlock();
				await blocker;
				expect(await result).toMatchObject({
					allowed: false,
					message: "MANUAL_ACCESS_REQUIRED",
				});
			} finally {
				unlock();
				await blocker;
				await db
					.insert(systemPrivileges)
					.values({
						userId: adminId,
						privilegeCode: "SUPERADMIN",
						grantedByUserId: null,
					})
					.onConflictDoNothing();
			}
		});

		test("existing identity and append-only audits remain enforced; failed SA02 audit rolls back account", async () => {
			await rejected(
				db.transaction(async (tx) => {
					await tx.insert(srProfiles).values({
						userId: adminId,
						departmentCode: "HCO",
						positionCode: "KADEP",
						buildingId:
							(
								await tx
									.select()
									.from(srProfiles)
									.where(eq(srProfiles.userId, srId))
							)[0]?.buildingId ?? "",
					});
					await tx.execute(sql`SET CONSTRAINTS ALL IMMEDIATE`);
				}),
			);
			await rejected(
				db.transaction(async (tx) => {
					await tx
						.update(accountAuditLogs)
						.set({ action: "ACCOUNT_CREATED" })
						.where(eq(accountAuditLogs.targetUserId, adminId));
				}),
			);
			await rejected(
				db.transaction(async (tx) => {
					await tx
						.delete(accountAuditLogs)
						.where(eq(accountAuditLogs.targetUserId, adminId));
				}),
			);
			await rejected(
				db.transaction(async (tx) => {
					await tx.execute(sql`TRUNCATE public.account_audit_logs`);
				}),
			);
			await db.execute(
				sql`CREATE FUNCTION public.sa03_test_reject_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Synthetic audit failure'; END; $$`,
			);
			await db.execute(
				sql`CREATE TRIGGER sa03_test_reject_audit BEFORE INSERT ON public.account_audit_logs FOR EACH ROW EXECUTE FUNCTION public.sa03_test_reject_audit()`,
			);
			try {
				await rejected(
					(await caller()).identity.createAccount({
						name: "Rollback only",
						nim: "0000000399",
						email: "rollback-only@example.invalid",
						departmentCode: "HCO",
						positionCode: "ANGGOTA",
						buildingCode: "A",
					}),
				);
				expect(
					await db
						.select({ id: user.id })
						.from(user)
						.where(eq(user.username, "0000000399")),
				).toHaveLength(0);
			} finally {
				await db.execute(
					sql`DROP TRIGGER sa03_test_reject_audit ON public.account_audit_logs`,
				);
				await db.execute(sql`DROP FUNCTION public.sa03_test_reject_audit()`);
			}
		});

		test("logout invalidates the session and duplicate bootstrap is refused", async () => {
			await rejected(
				bootstrap("apply"),
				"DEDICATED_SYSTEM_ADMIN_ALREADY_EXISTS",
			);
			const logout = await authRequest("sign-out", {}, cookie);
			expect(logout.status).toBe(200);
			expect(
				await auth.api.getSession({ headers: new Headers({ cookie }) }),
			).toBeNull();
			expect(await db.select().from(userProfiles)).toHaveLength(4);
		});
	},
);
