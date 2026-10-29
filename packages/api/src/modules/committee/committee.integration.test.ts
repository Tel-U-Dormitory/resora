import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomBytes, randomUUID } from "node:crypto";
import { cpSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { getActiveIdentity } from "@resora/auth/sr-access";
import { createDb, type Database } from "@resora/db";
import { seedOrganization } from "@resora/db/organization";
import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { appRouter } from "../../routers";
import {
	eventAssignment,
	filterRecapParticipants,
} from "../attendance/reporting-context";
import { signChallenge } from "../check-in/qr";
import { addMembers, createCommittee } from "./committee.service";

function scratchTarget(value: string) {
	const url = new URL(value);
	if (
		!["postgres:", "postgresql:"].includes(url.protocol) ||
		url.hostname !== "127.0.0.1" ||
		url.pathname !== "/resora_identity_test_committee_api" ||
		!url.username ||
		!url.port ||
		url.search ||
		url.hash
	)
		throw Error("EXPLICIT_EMPTY_LOOPBACK_COMMITTEE_API_DATABASE_REQUIRED");
	return url;
}
test("committee API integration suite refuses remote and ambiguous databases", () => {
	for (const value of [
		"invalid",
		"postgresql://test@remote:5432/resora_identity_test_committee_api",
		"postgresql://test@127.0.0.1:5432/resora",
		"postgresql://test@127.0.0.1/resora_identity_test_committee_api",
		"postgresql://test@127.0.0.1:5432/resora_identity_test_committee_api?host=remote",
	])
		expect(() => scratchTarget(value)).toThrow();
});
const target = process.env.RESORA_COMMITTEE_API_TEST_DB_URL;
async function expectFailure(
	request: Promise<unknown>,
	expected: { code: string; message?: string },
) {
	try {
		await request;
	} catch (error) {
		expect(error).toMatchObject(expected);
		return;
	}
	throw Error("Expected rejected committee request");
}
(target ? describe : describe.skip)(
	"committee API on verified disposable PostgreSQL",
	() => {
		let db: Database;
		let periodId: string;
		let legacyEventId: string;
		const ids = Object.fromEntries(
			[
				"admin",
				"kadep",
				"sekdep",
				"hco",
				"rnd",
				"sr",
				"inactive",
				"expired",
				"unassigned",
				"invalid",
				"future",
			].map((key) => [key, randomUUID()]),
		);
		function caller(key = "admin", qrSigningSecret?: string) {
			return appRouter.createCaller({
				db,
				qrSigningSecret,
				session: {
					user: { id: ids[key], name: "Synthetic operator" },
				} as never,
			});
		}
		async function fixture(name = `Synthetic ${randomUUID()}`) {
			const committee = await caller().committee.create({ name });
			if (!committee) throw Error("Missing committee");
			const division = await caller().committee.createDivision({
				committeeId: committee.id,
				name: "Acara",
			});
			if (!division) throw Error("Missing division");
			return {
				committeeId: committee.id,
				divisionId: division.id,
				userId: ids.sr ?? "",
				positionCode: "ANGGOTA" as const,
			};
		}
		beforeAll(async () => {
			const url = scratchTarget(target ?? "");
			db = createDb({ DATABASE_URL: url.href, DB_POOL_MAX: 4 });
			const result = await db.$client.query(
				`SELECT current_database() name,current_user role,host(inet_server_addr()) host,inet_server_port() port,(SELECT count(*)::int FROM pg_tables WHERE schemaname IN ('public','drizzle')) tables`,
			);
			expect(result.rows[0]).toEqual({
				name: "resora_identity_test_committee_api",
				role: decodeURIComponent(url.username),
				host: "127.0.0.1",
				port: Number(url.port),
				tables: 0,
			});
			const migrationsFolder = resolve(
				import.meta.dir,
				"../../../../db/src/migrations",
			);
			const temporaryBase = resolve(import.meta.dir, "../../../../../tmp");
			mkdirSync(temporaryBase, { recursive: true });
			const prior = mkdtempSync(
				resolve(temporaryBase, "committee-migrations-"),
			);
			if (
				!prior.startsWith(
					`${temporaryBase}${process.platform === "win32" ? "\\" : "/"}committee-migrations-`,
				)
			)
				throw Error("UNSAFE_TEST_MIGRATION_DIRECTORY");
			try {
				for (const entry of readdirSync(migrationsFolder, {
					withFileTypes: true,
				}))
					if (
						entry.isDirectory() &&
						entry.name < "20261025050126_committee_event_snapshots"
					)
						cpSync(
							resolve(migrationsFolder, entry.name),
							resolve(prior, entry.name),
							{ recursive: true },
						);
				await migrate(db, { migrationsFolder: prior });
			} finally {
				rmSync(prior, { recursive: true });
			}
			await seedOrganization(db);
			const periods = await db.$client.query(
				`INSERT INTO sr_periods(name,starts_on,ends_on) VALUES ('Synthetic active',CURRENT_DATE-2,CURRENT_DATE+2),('Synthetic expired',CURRENT_DATE-20,CURRENT_DATE-10),('Synthetic future',CURRENT_DATE+10,CURRENT_DATE+20) RETURNING id,name`,
			);
			periodId = periods.rows.find((row) => row.name === "Synthetic active").id;
			for (const [key, id] of Object.entries(ids)) {
				await db.transaction(async (tx) => {
					await tx.execute(
						sql`INSERT INTO "user"(id,name,email,username) VALUES (${id},${`Synthetic ${key}`},${`${key}@committee-api.invalid`},${key === "admin" ? "committee.admin" : `000${Object.keys(ids).indexOf(key)}`})`,
					);
					await tx.execute(
						sql`INSERT INTO user_profiles(user_id,actor,must_change_password,is_active) VALUES (${id},${key === "admin" ? "SYSTEM_ADMIN" : "SR"}::actor_type,false,${key !== "inactive"})`,
					);
					if (key === "admin")
						await tx.execute(
							sql`INSERT INTO system_privileges(user_id,privilege_code) VALUES (${id},'SUPERADMIN')`,
						);
					else {
						await tx.execute(
							sql`INSERT INTO sr_profiles(user_id,department_code,position_code,building_id) SELECT ${id},${["kadep", "sekdep", "hco", "invalid", "inactive", "expired", "future", "unassigned"].includes(key) ? "HCO" : "RND"},${key === "invalid" ? "KETUM" : ["kadep", "rnd"].includes(key) ? "KADEP" : key === "sekdep" ? "SEKDEP" : "ANGGOTA"},id FROM buildings WHERE code='A'`,
						);
						if (key !== "unassigned") {
							const selected = periods.rows.find(
								(row) =>
									row.name ===
									(key === "expired"
										? "Synthetic expired"
										: key === "future"
											? "Synthetic future"
											: "Synthetic active"),
							).id;
							await tx.execute(
								sql`INSERT INTO sr_period_memberships(user_id,period_id) VALUES (${id},${selected})`,
							);
						}
					}
				});
			}
			legacyEventId = randomUUID();
			await db.transaction(async (tx) => {
				await tx.execute(
					sql`INSERT INTO events(id,title,created_by_user_id,starts_at,ends_at,roster_criteria) VALUES (${legacyEventId},'Synthetic pre-migration SR event',${ids.admin},now(),now()+interval '1 hour','{"allSr":true,"inti":false,"kadep":false,"departments":[],"individuals":[],"include":[],"exclude":[]}'::jsonb)`,
				);
				await tx.execute(
					sql`INSERT INTO attendance_sessions(internal_event_id,center_lat,center_lng) VALUES (${legacyEventId},0,0)`,
				);
			});
			await migrate(db, { migrationsFolder });
		}, 30000);
		afterAll(async () => {
			await db?.$client.end();
		});

		test("SUPERADMIN and all eligible structural HCO create/update with backend creator and trimmed fields", async () => {
			for (const key of ["admin", "kadep", "sekdep", "hco"]) {
				const created = await caller(key).committee.create({
					name: `  Synthetic ${key}  `,
					description: " Test ",
				});
				if (!created) throw Error("Missing result");
				await caller(key).committee.update({
					committeeId: created.id,
					name: "Renamed",
					description: " Updated ",
				});
				const detail = await caller(key).committee.detail({
					committeeId: created.id,
				});
				expect(detail).toMatchObject({
					name: "Renamed",
					description: "Updated",
					divisions: [],
					members: [],
				});
				expect(
					(
						await db.$client.query(
							"SELECT created_by_user_id FROM committees WHERE id=$1",
							[created.id],
						)
					).rows[0].created_by_user_id,
				).toBe(ids[key]);
				expect(detail.updatedAt.getTime()).toBeGreaterThanOrEqual(
					detail.createdAt.getTime(),
				);
			}
		});
		test("SEKDEP and ANGGOTA HCO manage another creator's committee, divisions and members; non-HCO stay denied", async () => {
			for (const key of ["hco", "sekdep"]) {
				const input = await fixture(); // Created by SUPERADMIN, not this operator.
				const api = caller(key).committee;
				expect(
					(
						await caller(key).committee.detail({
							committeeId: input.committeeId,
						})
					).id,
				).toBe(input.committeeId);
				expect((await caller(key).committee.list({})).total).toBeGreaterThan(0);
				expect(
					(
						await api.candidates({
							committeeId: input.committeeId,
							search: "Synthetic",
						})
					).some((row) => row.userId === input.userId),
				).toBe(true);
				await api.update({
					committeeId: input.committeeId,
					name: `Managed by ${key}`,
				});
				const division = await api.createDivision({
					committeeId: input.committeeId,
					name: "Konsumsi",
				});
				if (!division) throw Error("Missing division");
				await api.updateDivision({
					committeeId: input.committeeId,
					divisionId: input.divisionId,
					name: "Acara baru",
				});
				await api.addMember(input);
				await expectFailure(api.addMember(input), { code: "CONFLICT" });
				await api.updateMember({
					...input,
					divisionId: division.id,
					positionCode: "PIC1",
				});
				const detail = await api.detail({ committeeId: input.committeeId });
				expect(detail.name).toBe(`Managed by ${key}`);
				expect(
					detail.divisions.find((row) => row.id === input.divisionId)?.name,
				).toBe("Acara baru");
				expect(detail.members).toMatchObject([
					{
						userId: input.userId,
						divisionId: division.id,
						positionCode: "PIC1",
					},
				]);
				await expectFailure(
					api.deleteDivision({
						committeeId: input.committeeId,
						divisionId: division.id,
					}),
					{ code: "CONFLICT" },
				);
				await expectFailure(api.delete({ committeeId: input.committeeId }), {
					code: "CONFLICT",
				});
				await api.removeMember({
					committeeId: input.committeeId,
					userId: input.userId,
				});
				await api.deleteDivision({
					committeeId: input.committeeId,
					divisionId: input.divisionId,
				});
				await api.deleteDivision({
					committeeId: input.committeeId,
					divisionId: division.id,
				});
				await api.delete({ committeeId: input.committeeId });
				await expectFailure(api.detail({ committeeId: input.committeeId }), {
					code: "NOT_FOUND",
				});
			}
			const input = await fixture();
			await caller().committee.addMember({ ...input, positionCode: "KADEP" });
			for (const key of ["rnd", "sr"]) {
				await expectFailure(
					caller(key).committee.detail({ committeeId: input.committeeId }),
					{ code: "FORBIDDEN" },
				);
				await expectFailure(caller(key).committee.create({ name: "Denied" }), {
					code: "FORBIDDEN",
				});
			}
		});
		test("concurrent HCO member additions retain one membership without partial writes", async () => {
			const input = await fixture();
			const outcomes = await Promise.allSettled([
				caller("hco").committee.addMember(input),
				caller("sekdep").committee.addMember(input),
			]);
			expect(
				outcomes.filter((result) => result.status === "fulfilled"),
			).toHaveLength(1);
			const rejected = outcomes.find((result) => result.status === "rejected");
			if (rejected?.status !== "rejected")
				throw Error("Expected duplicate rejection");
			expect(rejected.reason).toMatchObject({
				code: "CONFLICT",
				message: "COMMITTEE_DUPLICATE",
			});
			expect(
				(
					await caller("hco").committee.detail({
						committeeId: input.committeeId,
					})
				).members,
			).toHaveLength(1);
		});
		test("inactive, expired, future and unassigned HCO operators are rejected by protected routes", async () => {
			for (const key of ["inactive", "expired", "future", "unassigned"])
				await expectFailure(caller(key).committee.list({}), {
					code: "UNAUTHORIZED",
				});
		});
		test("live recheck rejects revoked privilege, forced rotation and inactive operator before writes", async () => {
			const admin = await getActiveIdentity(db, ids.admin ?? "");
			if (!admin) throw Error("Missing identity");
			try {
				await db.$client.query(
					"DELETE FROM system_privileges WHERE user_id=$1",
					[ids.admin],
				);
				await expectFailure(
					createCommittee(db, admin, { name: "Stale grant", description: "" }),
					{ code: "FORBIDDEN" },
				);
			} finally {
				await db.$client.query(
					"INSERT INTO system_privileges(user_id,privilege_code) VALUES ($1,'SUPERADMIN')",
					[ids.admin],
				);
			}
			for (const column of ["must_change_password", "is_active"]) {
				await db.$client.query(
					`UPDATE user_profiles SET ${column}=$1 WHERE user_id=$2`,
					[column !== "is_active", ids.admin],
				);
				try {
					await expectFailure(
						createCommittee(db, admin, {
							name: "Stale identity",
							description: "",
						}),
						{ code: "FORBIDDEN" },
					);
				} finally {
					await db.$client.query(
						`UPDATE user_profiles SET ${column}=$1 WHERE user_id=$2`,
						[column === "is_active", ids.admin],
					);
				}
			}
			for (const key of ["kadep", "sekdep", "hco"]) {
				const operator = await getActiveIdentity(db, ids[key] ?? "");
				if (!operator) throw Error("Missing HCO identity");
				await db.$client.query(
					"UPDATE sr_profiles SET department_code='RND' WHERE user_id=$1",
					[ids[key]],
				);
				try {
					await expectFailure(
						createCommittee(db, operator, {
							name: "Stale structural permission",
							description: "",
						}),
						{ code: "FORBIDDEN" },
					);
				} finally {
					await db.$client.query(
						"UPDATE sr_profiles SET department_code='HCO' WHERE user_id=$1",
						[ids[key]],
					);
				}
			}
		});
		test("division names are trimmed and case-insensitively unique within their owner", async () => {
			const input = await fixture();
			await expectFailure(
				caller().committee.createDivision({
					committeeId: input.committeeId,
					name: " acara ",
				}),
				{
					code: "CONFLICT",
					message: "COMMITTEE_DUPLICATE",
				},
			);
			await caller().committee.updateDivision({
				committeeId: input.committeeId,
				divisionId: input.divisionId,
				name: " Konsumsi ",
			});
			expect(
				(await caller().committee.detail({ committeeId: input.committeeId }))
					.divisions[0]?.name,
			).toBe("Konsumsi");
			expect((await fixture()).divisionId).not.toBe(input.divisionId);
		});
		test("members may join multiple committees but duplicate membership and cross-committee division fail", async () => {
			const a = await fixture();
			const b = await fixture();
			await caller().committee.addMember(a);
			await caller().committee.addMember(b);
			await expectFailure(caller().committee.addMember(a), {
				code: "CONFLICT",
			});
			await expectFailure(
				caller().committee.addMember({
					...a,
					userId: ids.kadep ?? "",
					divisionId: b.divisionId,
				}),
				{
					code: "BAD_REQUEST",
					message: "COMMITTEE_DIVISION_NOT_FOUND",
				},
			);
			await expectFailure(
				caller().committee.addMember({
					...a,
					positionCode: "SUPERADMIN" as never,
				}),
				{ code: "BAD_REQUEST" },
			);
			expect(
				(await caller().committee.detail({ committeeId: a.committeeId }))
					.members,
			).toHaveLength(1);
		});
		test("inactive, expired, future, unassigned and invalid structural targets cannot be assigned", async () => {
			const input = await fixture();
			for (const key of [
				"inactive",
				"expired",
				"future",
				"unassigned",
				"invalid",
			])
				await expectFailure(
					caller().committee.addMember({ ...input, userId: ids[key] ?? "" }),
					{
						code: "BAD_REQUEST",
						message: "COMMITTEE_MEMBER_INELIGIBLE",
					},
				);
			expect(
				(await caller().committee.detail({ committeeId: input.committeeId }))
					.members,
			).toHaveLength(0);
		});
		test("eligible assignment update works; now-ineligible members remain identifiable and removable", async () => {
			const input = await fixture();
			await caller().committee.addMember(input);
			const division = await caller().committee.createDivision({
				committeeId: input.committeeId,
				name: "Publikasi",
			});
			await caller().committee.updateMember({
				...input,
				divisionId: division?.id ?? "",
				positionCode: "PIC1",
			});
			expect(
				(await caller().committee.detail({ committeeId: input.committeeId }))
					.members[0],
			).toMatchObject({
				name: "Synthetic sr",
				positionCode: "PIC1",
				divisionId: division?.id,
				eligible: true,
			});
			await db.$client.query(
				"DELETE FROM sr_period_memberships WHERE user_id=$1",
				[ids.sr],
			);
			try {
				const detail = await caller().committee.detail({
					committeeId: input.committeeId,
				});
				expect(detail.members[0]).toMatchObject({
					name: "Synthetic sr",
					eligible: false,
				});
				await expectFailure(caller().committee.updateMember(input), {
					code: "BAD_REQUEST",
				});
				await caller().committee.removeMember({
					committeeId: input.committeeId,
					userId: input.userId,
				});
				expect(
					(await caller().committee.detail({ committeeId: input.committeeId }))
						.members,
				).toHaveLength(0);
			} finally {
				await db.$client.query(
					"INSERT INTO sr_period_memberships(user_id,period_id) VALUES ($1,$2)",
					[ids.sr, periodId],
				);
			}
		});
		test("nonempty division/committee deletion fails; explicit removal permits empty deletion", async () => {
			const input = await fixture();
			await caller().committee.addMember(input);
			await expectFailure(
				caller().committee.deleteDivision({
					committeeId: input.committeeId,
					divisionId: input.divisionId,
				}),
				{ code: "CONFLICT" },
			);
			await expectFailure(
				caller().committee.delete({ committeeId: input.committeeId }),
				{ code: "CONFLICT" },
			);
			await caller().committee.removeMember({
				committeeId: input.committeeId,
				userId: input.userId,
			});
			await caller().committee.deleteDivision({
				committeeId: input.committeeId,
				divisionId: input.divisionId,
			});
			await caller().committee.delete({ committeeId: input.committeeId });
			await expectFailure(
				caller().committee.detail({ committeeId: input.committeeId }),
				{ code: "NOT_FOUND" },
			);
		});
		test("safe list counts/search/pagination and bounded candidate DTOs do not expose auth fields", async () => {
			const input = await fixture("Synthetic unique search target");
			await caller().committee.addMember(input);
			const result = await caller().committee.list({
				search: "unique search target",
				limit: 1,
			});
			expect(result.total).toBe(1);
			expect(result.committees[0]).toMatchObject({
				id: input.committeeId,
				divisionCount: 1,
				memberCount: 1,
			});
			expect(
				(
					await caller().committee.list({
						search: "unique search target",
						offset: 1,
					})
				).committees,
			).toHaveLength(0);
			expect((await caller().committee.list({ search: "%" })).total).toBe(0);
			const candidates = await caller().committee.candidates({
				committeeId: input.committeeId,
				search: "Synthetic",
			});
			expect(candidates.length).toBeLessThanOrEqual(20);
			expect(
				candidates.some(
					(row) =>
						row.userId === ids.sr ||
						row.userId === ids.inactive ||
						row.userId === ids.admin,
				),
			).toBe(false);
			for (const row of candidates)
				expect(Object.keys(row).sort()).toEqual(["name", "nim", "userId"]);
		});
		test("failed later write rolls back division creation and committee timestamp", async () => {
			const input = await fixture();
			const before = await caller().committee.detail({
				committeeId: input.committeeId,
			});
			await db.$client.query(
				`CREATE FUNCTION committee_api_test_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic write failure'; END $$; CREATE TRIGGER committee_api_test_fail BEFORE UPDATE ON committees FOR EACH ROW EXECUTE FUNCTION committee_api_test_fail()`,
			);
			try {
				await expectFailure(
					caller().committee.createDivision({
						committeeId: input.committeeId,
						name: "Rollback division",
					}),
					{ code: "INTERNAL_SERVER_ERROR" },
				);
			} finally {
				await db.$client.query(
					"DROP TRIGGER committee_api_test_fail ON committees; DROP FUNCTION committee_api_test_fail()",
				);
			}
			const after = await caller().committee.detail({
				committeeId: input.committeeId,
			});
			expect(after.divisions).toEqual(before.divisions);
			expect(after.updatedAt).toEqual(before.updatedAt);
		});
		test("session capability is backend-derived without expanding event permissions", async () => {
			for (const key of ["admin", "kadep", "hco", "sekdep"])
				expect((await caller(key).identity.session())?.canManageCommittee).toBe(
					true,
				);
			for (const key of ["rnd", "sr"])
				expect((await caller(key).identity.session())?.canManageCommittee).toBe(
					false,
				);
			expect(
				(await caller("hco").identity.session())?.canManageInternalEvents,
			).toBe(true);
			for (const key of ["hco", "sekdep"])
				expect(await caller(key).identity.session()).toMatchObject({
					canManageCommittee: true,
					canManageInternalEvents: true,
					canManageInternalAttendanceManually: false,
					canManageBroadcast: false,
					canOperateGeneralActivity: false,
					isSuperadmin: false,
				});
		});

		const eventInput = (committeeId?: string) => ({
			title: "Synthetic committee event",
			startsAt: new Date(Date.now() - 60_000).toISOString(),
			endsAt: new Date(Date.now() + 3600000).toISOString(),
			organizationContext: committeeId
				? ("COMMITTEE" as const)
				: ("SR" as const),
			committeeId: committeeId ?? null,
			rosterCriteria: { include: [] as string[], exclude: [] as string[] },
			session: { centerLat: 0, centerLng: 0, qrTtlMinutes: 60 },
		});
		test("additive event migration preserves legacy SR events and enforces context, FK and snapshot constraints", async () => {
			const legacy = await caller().attendance.detail({
				eventId: legacyEventId,
			});
			expect(legacy.event).toMatchObject({
				organizationContext: "SR",
				committeeId: null,
				snapshotCommitteeName: null,
			});
			const f = await fixture();
			for (const statement of [
				sql`UPDATE events SET committee_id=${f.committeeId} WHERE id=${legacyEventId}`,
				sql`UPDATE events SET organization_context='COMMITTEE' WHERE id=${legacyEventId}`,
				sql`UPDATE events SET organization_context='UNKNOWN' WHERE id=${legacyEventId}`,
				sql`UPDATE events SET organization_context='COMMITTEE',committee_id=${randomUUID()} WHERE id=${legacyEventId}`,
			]) {
				let rejected = false;
				try {
					await db.execute(statement);
				} catch {
					rejected = true;
				}
				expect(rejected).toBe(true);
			}
			const fk = await db.$client.query(
				"SELECT confdeltype FROM pg_constraint WHERE conname='events_committee_id_committees_id_fkey'",
			);
			expect(fk.rows[0].confdeltype).toBe("a");
			const created = await caller("hco").attendance.create(
				eventInput(f.committeeId),
			);
			await expectFailure(
				caller()
					.committee.deleteDivision({
						committeeId: f.committeeId,
						divisionId: f.divisionId,
					})
					.then(() =>
						caller().committee.delete({ committeeId: f.committeeId }),
					),
				{ code: "CONFLICT" },
			);
			expect(
				(await caller("hco").attendance.detail(created)).event.committeeId,
			).toBe(f.committeeId);
		});
		test("DRAFT context switching, committee selection, eligibility, extra invitations and exclusion work through the API", async () => {
			const f = await fixture();
			await caller().committee.addMember(f);
			await caller().committee.addMember({
				...f,
				userId: ids.rnd ?? "",
				positionCode: "SEKRE",
			});
			await db.$client.query(
				"UPDATE user_profiles SET is_active=false WHERE user_id=$1",
				[ids.rnd],
			);
			try {
				const event = await caller("hco").attendance.create(eventInput());
				const draft = {
					...eventInput(f.committeeId),
					rosterCriteria: {
						include: [f.userId, ids.kadep ?? "", ids.kadep ?? ""],
						exclude: [f.userId],
					},
				};
				await caller("hco").attendance.editDraft({ ...event, draft });
				const preview = await caller("hco").attendance.preview(event);
				expect(preview.participants.map((row) => row.userId)).toEqual([
					ids.kadep ?? "",
				]);
				expect(preview.participants[0]).toMatchObject({
					committeeDivision: null,
					committeePosition: null,
				});
				await caller("hco").attendance.editDraft({
					...event,
					draft: eventInput(f.committeeId),
				});
				expect(
					(await caller("hco").attendance.preview(event)).participants,
				).toHaveLength(1);
				await caller("hco").attendance.publish(event);
				const detail = await caller("hco").attendance.detail(event);
				expect(detail.participants[0]).toMatchObject({
					userId: f.userId,
					committeeDivision: "Acara",
					committeePosition: "ANGGOTA",
				});
				expect(
					(await caller("sr").attendance.detail(event)).participants,
				).toEqual([]);
				await expectFailure(caller("sr").attendance.preview(event), {
					code: "FORBIDDEN",
				});
				await expectFailure(
					caller("sr").attendance.create(eventInput(f.committeeId)),
					{ code: "FORBIDDEN" },
				);
				await expectFailure(
					caller("hco").attendance.create(eventInput(randomUUID())),
					{ code: "BAD_REQUEST" },
				);
				await expectFailure(
					caller("hco").attendance.create({
						...eventInput(f.committeeId),
						rosterCriteria: { allSr: true },
					}),
					{ code: "BAD_REQUEST" },
				);
			} finally {
				await db.$client.query(
					"UPDATE user_profiles SET is_active=true WHERE user_id=$1",
					[ids.rnd],
				);
			}
		});
		test("published committee snapshots survive rename/reassignment/removal and FULL edit only applies explicit deltas", async () => {
			const f = await fixture();
			await caller().committee.addMember({ ...f, positionCode: "PIC1" });
			const first = await caller("hco").attendance.create(
				eventInput(f.committeeId),
			);
			await caller("hco").attendance.publish(first);
			const original = await caller().attendance.detail(first);
			const nextDivision = await caller().committee.createDivision({
				committeeId: f.committeeId,
				name: "Divisi terbaru",
			});
			if (!nextDivision) throw Error("Missing division");
			await caller().committee.updateMember({
				...f,
				divisionId: nextDivision.id,
				positionCode: "PJ",
			});
			await caller().committee.updateDivision({
				committeeId: f.committeeId,
				divisionId: f.divisionId,
				name: "Divisi lama diubah",
			});
			f.divisionId = nextDivision.id;
			await caller().committee.update({
				committeeId: f.committeeId,
				name: "Kepanitiaan terbaru",
			});
			const second = await caller("hco").attendance.create(
				eventInput(f.committeeId),
			);
			await caller("hco").attendance.publish(second);
			expect(
				(await caller().attendance.detail(second)).participants[0],
			).toMatchObject({
				committeePosition: "PJ",
				committeeDivision: "Divisi terbaru",
			});
			expect((await caller().attendance.detail(second)).committeeName).toBe(
				"Kepanitiaan terbaru",
			);
			await caller().committee.removeMember({
				committeeId: f.committeeId,
				userId: f.userId,
			});
			await caller().committee.addMember({
				...f,
				userId: ids.kadep ?? "",
				positionCode: "SEKRE",
			});
			const full = {
				...first,
				mode: "FULL" as const,
				reason: "Synthetic explicit correction",
				draft: eventInput(f.committeeId),
			};
			await caller().attendance.advancedEdit(full);
			expect((await caller().attendance.detail(first)).participants).toEqual(
				original.participants,
			);
			full.draft.rosterCriteria.include = [ids.kadep ?? "", ids.hco ?? ""];
			await caller().attendance.advancedEdit(full);
			const changed = await caller().attendance.detail(first);
			expect(
				changed.participants.find((row) => row.userId === f.userId),
			).toEqual(original.participants[0]);
			expect(
				changed.participants.find((row) => row.userId === ids.kadep),
			).toMatchObject({
				committeeDivision: "Divisi terbaru",
				committeePosition: "SEKRE",
			});
			expect(
				changed.participants.find((row) => row.userId === ids.hco),
			).toMatchObject({ committeeDivision: null, committeePosition: null });
			expect(changed.committeeName).toBe(original.committeeName);
			full.draft.rosterCriteria.exclude = [f.userId];
			await caller().attendance.advancedEdit(full);
			expect(
				(await caller().attendance.detail(first)).participants,
			).toHaveLength(2);
			await expectFailure(
				caller().attendance.advancedEdit({ ...full, draft: eventInput() }),
				{ code: "BAD_REQUEST" },
			);
			const other = await fixture();
			await expectFailure(
				caller().attendance.advancedEdit({
					...full,
					draft: eventInput(other.committeeId),
				}),
				{ code: "BAD_REQUEST" },
			);
			await expectFailure(caller("hco").attendance.advancedEdit(full), {
				code: "FORBIDDEN",
			});
			const history = await caller().attendance.eventAuditHistory(first);
			expect(
				history.items.some((row) => row.participants?.addedCount === 2),
			).toBe(true);
			const third = await caller("hco").attendance.create(
				eventInput(f.committeeId),
			);
			await caller("hco").attendance.publish(third);
			expect(
				(await caller().attendance.detail(third)).participants.map(
					(row) => row.userId,
				),
			).toEqual([ids.kadep ?? ""]);
		});
		test("snapshot or audit write failures roll back publication and explicit invitation changes", async () => {
			const f = await fixture();
			await caller().committee.addMember(f);
			const event = await caller().attendance.create(eventInput(f.committeeId));
			await db.$client.query(
				`CREATE FUNCTION committee_event_test_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic failure'; END $$; CREATE TRIGGER committee_event_test_fail BEFORE INSERT ON event_participants FOR EACH ROW EXECUTE FUNCTION committee_event_test_fail()`,
			);
			try {
				await expectFailure(caller().attendance.publish(event), {
					code: "INTERNAL_SERVER_ERROR",
				});
			} finally {
				await db.$client.query(
					"DROP TRIGGER committee_event_test_fail ON event_participants; DROP FUNCTION committee_event_test_fail()",
				);
			}
			const draft = await caller().attendance.detail(event);
			expect(draft.event.status).toBe("DRAFT");
			expect(draft.event.snapshotCommitteeName).toBeNull();
			expect(draft.participants).toEqual([]);
			await caller().attendance.publish(event);
			const before = await caller().attendance.detail(event);
			await db.$client.query(
				`CREATE FUNCTION committee_event_test_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic failure'; END $$; CREATE TRIGGER committee_event_test_fail BEFORE INSERT ON event_audit_logs FOR EACH ROW EXECUTE FUNCTION committee_event_test_fail()`,
			);
			try {
				await expectFailure(
					caller().attendance.advancedEdit({
						...event,
						mode: "FULL",
						reason: "Synthetic rollback",
						draft: {
							...eventInput(f.committeeId),
							rosterCriteria: { include: [ids.hco ?? ""] },
						},
					}),
					{ code: "INTERNAL_SERVER_ERROR" },
				);
			} finally {
				await db.$client.query(
					"DROP TRIGGER committee_event_test_fail ON event_audit_logs; DROP FUNCTION committee_event_test_fail()",
				);
			}
			const after = await caller().attendance.detail(event);
			expect(after.participants).toEqual(before.participants);
			expect(after.event).toEqual(before.event);
			expect(after.session).toEqual(before.session);
		});
		test("publication waits for committee mutation and snapshots its committed assignment without deadlock", async () => {
			const f = await fixture();
			await caller().committee.addMember(f);
			const event = await caller().attendance.create(eventInput(f.committeeId));
			let ready = () => {};
			let release = () => {};
			let blockerPid = 0;
			const readyPromise = new Promise<void>((resolve) => {
				ready = resolve;
			});
			const releasePromise = new Promise<void>((resolve) => {
				release = resolve;
			});
			const editing = db.transaction(async (tx) => {
				await tx.execute(sql`SET LOCAL statement_timeout = '3s'`);
				blockerPid = Number(
					(await tx.execute<{ pid: number }>(sql`SELECT pg_backend_pid() pid`))
						.rows[0]?.pid,
				);
				await appRouter
					.createCaller({
						db: tx as unknown as Database,
						session: { user: { id: ids.sekdep } } as never,
					})
					.committee.updateMember({ ...f, positionCode: "PJ" });
				ready();
				await releasePromise;
			});
			await Promise.race([
				readyPromise,
				editing.then(() => {
					throw Error("Missing lock barrier");
				}),
			]);
			const publishing = caller().attendance.publish(event);
			try {
				await waitBlocked(blockerPid);
			} finally {
				release();
				await editing;
				await publishing;
			}
			expect(
				(await caller().attendance.detail(event)).participants[0]
					?.committeePosition,
			).toBe("PJ");
		});
		test("committee invitations preserve manual attendance, QR duplicate/lifecycle gates and historical reporting", async () => {
			const f = await fixture();
			await caller().committee.addMember(f);
			await caller().committee.addMember({
				...f,
				userId: ids.rnd ?? "",
				positionCode: "PIC2",
			});
			const event = await caller("hco").attendance.create(
				eventInput(f.committeeId),
			);
			await caller("hco").attendance.publish(event);
			await caller().attendance.manualInsert({
				...event,
				userId: f.userId,
				reason: "Synthetic manual attendance",
			});
			expect((await caller().attendance.detail(event)).advancedEditMode).toBe(
				"LIMITED",
			);
			await expectFailure(
				caller().attendance.advancedEdit({
					...event,
					mode: "FULL",
					reason: "Disallowed full edit",
					draft: eventInput(f.committeeId),
				}),
				{ code: "CONFLICT" },
			);
			await caller("hco").attendance.activate(event);
			const challenge = (
				await db.$client.query(
					"SELECT q.id,q.session_id FROM qr_challenges q JOIN attendance_sessions s ON s.id=q.session_id WHERE s.internal_event_id=$1 AND q.is_current",
					[event.eventId],
				)
			).rows[0];
			const secret = randomBytes(32).toString("hex");
			const checkIn = {
				qrToken: signChallenge(secret, challenge.session_id, challenge.id),
				location: { latitude: 0, longitude: 0, accuracyMeters: 5 },
			};
			expect(
				(await caller("rnd", secret).attendance.checkIn(checkIn)).status,
			).toBe("CHECKED_IN");
			expect(
				(await caller("rnd", secret).attendance.checkIn(checkIn)).status,
			).toBe("ALREADY_CHECKED_IN");
			expect(
				(await caller("hco").attendance.recap(event)).counts,
			).toMatchObject({ invited: 2, present: 2 });
			await caller("hco").attendance.close(event);
			await expectFailure(caller("rnd", secret).attendance.checkIn(checkIn), {
				code: "FORBIDDEN",
				message: "SESSION_CLOSED",
			});
			expect(
				(await caller("hco").attendance.exportCsv(event)).content,
			).toContain("Synthetic rnd");
			expect(
				(await caller("rnd").attendance.ownHistory({})).items.some(
					(row) => row.event.id === event.eventId,
				),
			).toBe(true);
		});
		test("Phase 4 recap retains committee history across later membership changes and independent events", async () => {
			const f = await fixture("Synthetic original committee");
			await caller().committee.addMember({ ...f, positionCode: "PIC1" });
			const first = await caller("hco").attendance.create({
				...eventInput(f.committeeId),
				rosterCriteria: { include: [ids.hco ?? ""] },
			});
			await caller("hco").attendance.publish(first);
			await caller().attendance.manualInsert({
				...first,
				userId: f.userId,
				reason: "Synthetic recap attendance",
			});
			await caller().committee.update({
				committeeId: f.committeeId,
				name: "Synthetic renamed committee",
			});
			await caller().committee.updateDivision({
				committeeId: f.committeeId,
				divisionId: f.divisionId,
				name: "Divisi terbaru",
			});
			await caller().committee.updateMember({ ...f, positionCode: "PJ" });
			const second = await caller("hco").attendance.create(
				eventInput(f.committeeId),
			);
			await caller("hco").attendance.publish(second);
			const historical = await caller("hco").attendance.recap(first);
			expect(historical.event).toMatchObject({
				organizationContext: "COMMITTEE",
				committeeName: "Synthetic original committee",
			});
			const oldMember = historical.participants.find(
				(row) => row.userId === f.userId,
			);
			if (!oldMember) throw Error("Missing snapshot participant");
			expect(oldMember).toMatchObject({
				committeeDivision: "Acara",
				committeePosition: "PIC1",
				presence: "PRESENT",
				source: "MANUAL",
			});
			const guest = historical.participants.find(
				(row) => row.userId === ids.hco,
			);
			if (!guest) throw Error("Missing invited guest");
			expect(eventAssignment(historical.event, guest)).toMatchObject({
				isCommitteeMember: false,
				divisionLabel: "Non-Panitia / Undangan",
				positionLabel: "Non-Panitia / Undangan",
			});
			expect(
				filterRecapParticipants(historical.event, historical.participants, {
					division: "Acara",
					position: "PIC1",
				}),
			).toEqual([oldMember]);
			expect(historical.counts).toEqual({
				invited: 2,
				present: 1,
				pending: 1,
				absent: 0,
			});
			const latest = await caller("hco").attendance.recap(second);
			expect(latest.event.committeeName).toBe("Synthetic renamed committee");
			expect(latest.participants[0]).toMatchObject({
				committeeDivision: "Divisi terbaru",
				committeePosition: "PJ",
			});
			await caller("hco").attendance.close(first);
			expect((await caller("hco").attendance.recap(first)).counts).toEqual({
				invited: 2,
				present: 1,
				pending: 0,
				absent: 1,
			});
			await expectFailure(caller("sr").attendance.recap(first), {
				code: "FORBIDDEN",
			});
		});

		// Seed only the 30 synthetic candidates needed by the maximum-size batch case.
		let bulkUserIds: string[] = [];
		async function bulkFixture() {
			if (!bulkUserIds.length) {
				bulkUserIds = Array.from({ length: 30 }, () => randomUUID());
				await db.transaction(async (tx) => {
					const selected = sql.join(
						bulkUserIds.map((id) => sql`${id}`),
						sql`, `,
					);
					await tx.execute(
						sql`INSERT INTO "user"(id,name,email,username) VALUES ${sql.join(
							bulkUserIds.map(
								(id, index) =>
									sql`(${id},${`Synthetic bulk ${index}`},${`bulk.${index}@committee-api.invalid`},${`bulk.${index}`})`,
							),
							sql`, `,
						)}`,
					);
					await tx.execute(
						sql`INSERT INTO user_profiles(user_id,actor,must_change_password,is_active) SELECT id,'SR',false,true FROM "user" WHERE id IN (${selected})`,
					);
					await tx.execute(
						sql`INSERT INTO sr_profiles(user_id,department_code,position_code,building_id) SELECT u.id,'RND','ANGGOTA',b.id FROM "user" u CROSS JOIN buildings b WHERE u.id IN (${selected}) AND b.code='A'`,
					);
					await tx.execute(
						sql`INSERT INTO sr_period_memberships(user_id,period_id) SELECT id,${periodId} FROM "user" WHERE id IN (${selected})`,
					);
				});
			}
			const f = await fixture();
			return {
				committeeId: f.committeeId,
				divisionId: f.divisionId,
				positionCode: "PIC1" as const,
				userIds: [...bulkUserIds],
			};
		}
		async function waitBlocked(blockerPid: number) {
			// A fixed query count can finish before a contending request is scheduled.
			const deadline = Date.now() + 3000;
			while (Date.now() < deadline) {
				const { rows } = await db.$client.query(
					"SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE $1::int = ANY(pg_blocking_pids(pid))) blocked",
					[blockerPid],
				);
				if (rows[0].blocked) return;
			}
			throw Error("Expected transaction lock barrier");
		}
		function bulkDetail({ committeeId }: { committeeId: string }) {
			return caller().committee.detail({ committeeId });
		}
		test("bulk adds 1, several and 30 members with one assignment for every eligible HCO role and SUPERADMIN", async () => {
			const other = await bulkFixture();
			await caller().committee.addMember({
				committeeId: other.committeeId,
				divisionId: other.divisionId,
				userId: other.userIds[0] ?? "",
				positionCode: "PJ",
			});
			const untouched = await bulkDetail(other);
			for (const [operator, count] of [
				["admin", 30],
				["kadep", 1],
				["sekdep", 3],
				["hco", 2],
			] as const) {
				const full = await bulkFixture();
				const input = { ...full, userIds: full.userIds.slice(0, count) };
				const before = await bulkDetail(input);
				expect(await caller(operator).committee.addMembers(input)).toEqual({
					success: true,
					addedCount: count,
				});
				const detail = await bulkDetail(input);
				expect(detail.members).toHaveLength(count);
				expect(
					detail.members.every(
						(row) =>
							row.divisionId === input.divisionId &&
							row.positionCode === input.positionCode,
					),
				).toBe(true);
				expect(new Set(detail.members.map((row) => row.userId))).toEqual(
					new Set(input.userIds),
				);
				expect(detail.updatedAt.getTime()).toBeGreaterThanOrEqual(
					before.updatedAt.getTime(),
				);
			}
			expect(await bulkDetail(other)).toEqual(untouched);
		});
		test("bulk validation and existing membership failures leave all rows and committee metadata unchanged", async () => {
			const full = await bulkFixture();
			const input = { ...full, userIds: full.userIds.slice(0, 2) };
			const other = await fixture();
			const before = await bulkDetail(input);
			for (const invalid of [
				ids.inactive,
				ids.expired,
				ids.future,
				ids.unassigned,
				ids.invalid,
				randomUUID(),
			]) {
				await expectFailure(
					caller().committee.addMembers({
						...input,
						userIds: [input.userIds[0] ?? "", invalid ?? ""],
					}),
					{ code: "BAD_REQUEST", message: "COMMITTEE_MEMBER_INELIGIBLE" },
				);
				expect(await bulkDetail(input)).toEqual(before);
			}
			for (const divisionId of [randomUUID(), other.divisionId]) {
				await expectFailure(
					caller().committee.addMembers({ ...input, divisionId }),
					{ code: "BAD_REQUEST", message: "COMMITTEE_DIVISION_NOT_FOUND" },
				);
				expect(await bulkDetail(input)).toEqual(before);
			}
			for (const userIds of [[], [input.userIds[0], input.userIds[0]]])
				await expectFailure(
					caller().committee.addMembers({
						...input,
						userIds: userIds as string[],
					}),
					{ code: "BAD_REQUEST" },
				);
			await expectFailure(
				caller().committee.addMembers({ ...input, committeeId: randomUUID() }),
				{ code: "NOT_FOUND", message: "COMMITTEE_NOT_FOUND" },
			);
			await caller().committee.addMember({
				committeeId: input.committeeId,
				divisionId: input.divisionId,
				positionCode: input.positionCode,
				userId: input.userIds[1] ?? "",
			});
			const registered = await bulkDetail(input);
			await expectFailure(caller().committee.addMembers(input), {
				code: "CONFLICT",
				message: "COMMITTEE_DUPLICATE",
			});
			expect(await bulkDetail(input)).toEqual(registered);
		});
		test("bulk insert and later metadata failures roll back the entire batch with safe errors", async () => {
			const full = await bulkFixture();
			const input = { ...full, userIds: full.userIds.slice(0, 3) };
			const before = await bulkDetail(input);
			await db.$client.query(
				"CREATE FUNCTION reject_bulk_member() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.user_id=TG_ARGV[0] THEN RAISE EXCEPTION 'synthetic bulk failure'; END IF; RETURN NEW; END $$",
			);
			await db.$client.query(
				`CREATE TRIGGER reject_bulk_member BEFORE INSERT ON committee_members FOR EACH ROW EXECUTE FUNCTION reject_bulk_member('${input.userIds[1]}')`,
			);
			try {
				await expectFailure(caller().committee.addMembers(input), {
					code: "INTERNAL_SERVER_ERROR",
					message: "COMMITTEE_REQUEST_FAILED",
				});
			} finally {
				await db.$client.query(
					"DROP TRIGGER reject_bulk_member ON committee_members; DROP FUNCTION reject_bulk_member()",
				);
			}
			expect(await bulkDetail(input)).toEqual(before);
			await db.$client.query(
				"CREATE FUNCTION reject_bulk_metadata() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic metadata failure'; END $$; CREATE TRIGGER reject_bulk_metadata BEFORE UPDATE ON committees FOR EACH ROW EXECUTE FUNCTION reject_bulk_metadata()",
			);
			try {
				await expectFailure(caller().committee.addMembers(input), {
					code: "INTERNAL_SERVER_ERROR",
					message: "COMMITTEE_REQUEST_FAILED",
				});
			} finally {
				await db.$client.query(
					"DROP TRIGGER reject_bulk_metadata ON committees; DROP FUNCTION reject_bulk_metadata()",
				);
			}
			expect(await bulkDetail(input)).toEqual(before);
		});
		test("bulk endpoint rejects unauthorized, inactive and expired operators and rechecks stale Identity in its transaction", async () => {
			const input = {
				...(await bulkFixture()),
				userIds: bulkUserIds.slice(0, 2),
			};
			const before = await bulkDetail(input);
			for (const operator of ["rnd", "sr", "invalid"])
				await expectFailure(caller(operator).committee.addMembers(input), {
					code: "FORBIDDEN",
				});
			for (const operator of ["inactive", "expired", "future", "unassigned"])
				await expectFailure(caller(operator).committee.addMembers(input), {
					code: "UNAUTHORIZED",
				});
			const identity = await getActiveIdentity(db, ids.hco ?? "");
			if (!identity) throw Error("Missing HCO identity");
			await db.$client.query(
				"UPDATE user_profiles SET is_active=false WHERE user_id=$1",
				[ids.hco],
			);
			try {
				await expectFailure(addMembers(db, identity, input), {
					code: "FORBIDDEN",
					message: "COMMITTEE_ACCESS_DENIED",
				});
			} finally {
				await db.$client.query(
					"UPDATE user_profiles SET is_active=true WHERE user_id=$1",
					[ids.hco],
				);
			}
			expect(await bulkDetail(input)).toEqual(before);
		});
		test("overlapping bulk/bulk and single/bulk requests preserve uniqueness and never partially insert the losing batch", async () => {
			for (const single of [false, true]) {
				const full = await bulkFixture();
				const first = { ...full, userIds: full.userIds.slice(0, 2) };
				const second = { ...full, userIds: full.userIds.slice(1, 3) };
				const sharedUserId = first.userIds[1];
				if (!sharedUserId) throw Error("Missing shared synthetic user");
				const result = await Promise.allSettled([
					caller("hco").committee.addMembers(first),
					single
						? caller("sekdep").committee.addMember({
								committeeId: full.committeeId,
								divisionId: full.divisionId,
								positionCode: full.positionCode,
								userId: sharedUserId,
							})
						: caller("sekdep").committee.addMembers(second),
				]);
				expect(result.filter((row) => row.status === "fulfilled")).toHaveLength(
					1,
				);
				const rejected = result.find((row) => row.status === "rejected");
				if (rejected?.status !== "rejected")
					throw Error("Expected concurrent duplicate");
				expect(rejected.reason).toMatchObject({
					code: "CONFLICT",
					message: "COMMITTEE_DUPLICATE",
				});
				const expected =
					result[0]?.status === "fulfilled"
						? first.userIds
						: single
							? [sharedUserId]
							: second.userIds;
				expect(
					new Set((await bulkDetail(full)).members.map((row) => row.userId)),
				).toEqual(new Set(expected));
			}
		});
		test("a member deactivated while eligibility SHARE locking waits invalidates the whole batch", async () => {
			const full = await bulkFixture();
			const input = { ...full, userIds: full.userIds.slice(0, 2).sort() };
			const before = await bulkDetail(input);
			const blocker = await db.$client.connect();
			let request: Promise<unknown> | undefined;
			try {
				await blocker.query("BEGIN");
				const { rows } = await blocker.query("SELECT pg_backend_pid() pid");
				await blocker.query(
					"UPDATE user_profiles SET is_active=false WHERE user_id=$1",
					[input.userIds[1]],
				);
				request = caller().committee.addMembers(input);
				const outcome = Promise.allSettled([request]);
				try {
					await waitBlocked(rows[0].pid);
				} finally {
					await blocker.query("COMMIT");
				}
				await outcome;
				await expectFailure(request, {
					code: "BAD_REQUEST",
					message: "COMMITTEE_MEMBER_INELIGIBLE",
				});
			} finally {
				await blocker.query("ROLLBACK");
				blocker.release();
				await Promise.allSettled(request ? [request] : []);
				await db.$client.query(
					"UPDATE user_profiles SET is_active=true WHERE user_id=$1",
					[input.userIds[1]],
				);
			}
			expect(await bulkDetail(input)).toEqual(before);
		});
		test("division deletion and bulk insertion respect both committee-lock orders without partial writes", async () => {
			for (const bulkFirst of [false, true]) {
				const full = await bulkFixture();
				const input = { ...full, userIds: full.userIds.slice(0, 2) };
				let ready = () => {};
				let release = () => {};
				let blockerPid = 0;
				const readyPromise = new Promise<void>((resolve) => {
					ready = resolve;
				});
				const releasePromise = new Promise<void>((resolve) => {
					release = resolve;
				});
				const first = db.transaction(async (tx) => {
					blockerPid = Number(
						(
							await tx.execute<{ pid: number }>(
								sql`SELECT pg_backend_pid() pid`,
							)
						).rows[0]?.pid,
					);
					const api = appRouter.createCaller({
						db: tx as unknown as Database,
						session: { user: { id: ids.admin } } as never,
					}).committee;
					if (bulkFirst) await api.addMembers(input);
					else
						await api.deleteDivision({
							committeeId: input.committeeId,
							divisionId: input.divisionId,
						});
					ready();
					await releasePromise;
				});
				await Promise.race([
					readyPromise,
					first.then(() => {
						throw Error("Missing lock barrier");
					}),
				]);
				const second = bulkFirst
					? caller("hco").committee.deleteDivision({
							committeeId: input.committeeId,
							divisionId: input.divisionId,
						})
					: caller("hco").committee.addMembers(input);
				const outcomes = Promise.allSettled([first, second]);
				try {
					await waitBlocked(blockerPid);
				} finally {
					release();
					await outcomes;
				}
				await expectFailure(
					second,
					bulkFirst
						? { code: "CONFLICT", message: "COMMITTEE_REFERENCE_IN_USE" }
						: { code: "BAD_REQUEST", message: "COMMITTEE_DIVISION_NOT_FOUND" },
				);
				const detail = await bulkDetail(input);
				expect(detail.members).toHaveLength(bulkFirst ? 2 : 0);
				expect(detail.divisions).toHaveLength(bulkFirst ? 1 : 0);
			}
		});
		test("bulk insertion leaves published participants frozen while a new draft resolves the expanded committee", async () => {
			const full = await bulkFixture();
			await caller().committee.addMember({
				committeeId: full.committeeId,
				divisionId: full.divisionId,
				positionCode: full.positionCode,
				userId: full.userIds[0] ?? "",
			});
			const published = await caller("hco").attendance.create(
				eventInput(full.committeeId),
			);
			await caller("hco").attendance.publish(published);
			const before = await caller().attendance.detail(published);
			await caller("sekdep").committee.addMembers({
				...full,
				userIds: full.userIds.slice(1, 3),
			});
			const after = await caller().attendance.detail(published);
			expect(after.participants).toEqual(before.participants);
			expect(after.event).toEqual(before.event);
			expect(after.session).toEqual(before.session);
			const draft = await caller("hco").attendance.create(
				eventInput(full.committeeId),
			);
			expect(
				new Set(
					(await caller("hco").attendance.preview(draft)).participants.map(
						(row) => row.userId,
					),
				),
			).toEqual(new Set(full.userIds.slice(0, 3)));
		});
	},
);
