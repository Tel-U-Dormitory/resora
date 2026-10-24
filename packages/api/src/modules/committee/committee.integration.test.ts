import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { getActiveIdentity } from "@resora/auth/sr-access";
import { createDb, type Database } from "@resora/db";
import { seedOrganization } from "@resora/db/organization";
import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { appRouter } from "../../routers";
import { createCommittee } from "./committee.service";

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
		function caller(key = "admin") {
			return appRouter.createCaller({
				db,
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
			await migrate(db, {
				migrationsFolder: resolve(
					import.meta.dir,
					"../../../../db/src/migrations",
				),
			});
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
							sql`INSERT INTO sr_profiles(user_id,department_code,position_code,building_id) SELECT ${id},${["kadep", "sekdep", "hco", "invalid"].includes(key) ? "HCO" : "RND"},${key === "invalid" ? "KETUM" : ["kadep", "rnd"].includes(key) ? "KADEP" : key === "sekdep" ? "SEKDEP" : "ANGGOTA"},id FROM buildings WHERE code='A'`,
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
		}, 30000);
		afterAll(async () => {
			await db?.$client.end();
		});

		test("SUPERADMIN and structural KADEP HCO create/update with backend creator and trimmed fields", async () => {
			for (const key of ["admin", "kadep"]) {
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
		test("event HCO operators read but cannot write; other roles cannot read/write", async () => {
			const input = await fixture();
			await caller().committee.addMember({ ...input, positionCode: "KADEP" });
			for (const key of ["hco", "sekdep"]) {
				expect(
					(
						await caller(key).committee.detail({
							committeeId: input.committeeId,
						})
					).id,
				).toBe(input.committeeId);
				expect((await caller(key).committee.list({})).total).toBeGreaterThan(0);
				await expectFailure(caller(key).committee.create({ name: "Denied" }), {
					code: "FORBIDDEN",
				});
				await expectFailure(
					caller(key).committee.candidates({
						committeeId: input.committeeId,
						search: "Synthetic",
					}),
					{ code: "FORBIDDEN" },
				);
			}
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
		test("inactive, expired, future and unassigned operators are rejected by protected routes", async () => {
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
			const kadep = await getActiveIdentity(db, ids.kadep ?? "");
			if (!kadep) throw Error("Missing KADEP identity");
			await db.$client.query(
				"UPDATE sr_profiles SET position_code='ANGGOTA' WHERE user_id=$1",
				[ids.kadep],
			);
			try {
				await expectFailure(
					createCommittee(db, kadep, {
						name: "Stale structural permission",
						description: "",
					}),
					{ code: "FORBIDDEN" },
				);
			} finally {
				await db.$client.query(
					"UPDATE sr_profiles SET position_code='KADEP' WHERE user_id=$1",
					[ids.kadep],
				);
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
			for (const key of ["admin", "kadep"])
				expect((await caller(key).identity.session())?.canManageCommittee).toBe(
					true,
				);
			for (const key of ["hco", "sekdep", "rnd", "sr"])
				expect((await caller(key).identity.session())?.canManageCommittee).toBe(
					false,
				);
			expect(
				(await caller("hco").identity.session())?.canManageInternalEvents,
			).toBe(true);
		});
	},
);
