import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import {
	localProvisioningTarget,
	verifyLocalProvisioningDatabase,
} from "../../api/src/modules/identity/sr-provisioning";
import { createDb, type Database, type DatabaseTransaction } from "./index";
import {
	OrganizationConflictError,
	officialBuildings,
	officialDepartments,
	officialPositions,
	seedOrganization,
} from "./organization";
import { user } from "./schema/auth";
import {
	buildings,
	departments,
	positions,
	srProfiles,
	userProfiles,
} from "./schema/identity";

test("official seed defines exactly 7/7/18 unique codes and numeric buildings remain text", () => {
	expect(officialDepartments.length).toBe(7);
	expect(officialPositions.length).toBe(7);
	expect(officialBuildings.length).toBe(18);
	expect(new Set(officialBuildings.map((row) => row.code)).size).toBe(18);
	expect(
		officialBuildings
			.filter((row) => ["A", "F", "1", "12"].includes(row.code))
			.map((row) => row.name),
	).toEqual(["Gedung A", "Gedung F", "Gedung 1", "Gedung 12"]);
	expect(officialPositions.some((row) => String(row.code) === "KADIV")).toBe(
		false,
	);
});
const target = process.env.RESORA_IDENTITY_TEST_DB_URL;
(target ? describe : describe.skip)(
	"official organization seed on guarded local PostgreSQL",
	() => {
		let db: Database;
		beforeAll(async () => {
			const url = localProvisioningTarget(target);
			db = createDb({ DATABASE_URL: url });
			await verifyLocalProvisioningDatabase(db, url);
			await seedOrganization(db);
		});
		afterAll(async () => {
			await db?.$client.end();
		});
		test("official references are complete and seed rerun preserves building UUIDs", async () => {
			const before = await db.select().from(buildings);
			expect(await seedOrganization(db)).toEqual({
				departments: 0,
				positions: 0,
				buildings: 0,
			});
			expect(await db.select().from(buildings)).toEqual(before);
			expect((await db.select().from(departments)).length).toBe(7);
			expect((await db.select().from(positions)).length).toBe(7);
			expect(before.length).toBe(18);
		});
		async function rollbackCase(
			operation: (tx: DatabaseTransaction) => Promise<void>,
		) {
			const rollback = new Error("synthetic test rollback");
			try {
				await db.transaction(async (tx) => {
					await operation(tx);
					throw rollback;
				});
			} catch (error) {
				if (error !== rollback) throw error;
			}
		}
		test("preview inserts nothing even when an official reference is missing", async () => {
			await rollbackCase(async (tx) => {
				await tx.delete(buildings).where(eq(buildings.code, "12"));
				expect(await seedOrganization(tx, false)).toEqual({
					departments: 0,
					positions: 0,
					buildings: 1,
				});
				expect(
					(await tx.select().from(buildings).where(eq(buildings.code, "12")))
						.length,
				).toBe(0);
				expect(await seedOrganization(tx)).toEqual({
					departments: 0,
					positions: 0,
					buildings: 1,
				});
			});
		});
		test("conflicting names and legacy KADIV abort seed without silent changes", async () => {
			await rollbackCase(async (tx) => {
				await tx
					.update(departments)
					.set({ name: "Synthetic conflict" })
					.where(eq(departments.code, "HCO"));
				await tx
					.insert(positions)
					.values({ code: "KADIV", name: "Synthetic legacy" });
				await tx.delete(buildings).where(eq(buildings.code, "12"));
				let failure: unknown;
				try {
					await seedOrganization(tx);
				} catch (error) {
					failure = error;
				}
				expect(failure instanceof OrganizationConflictError).toBe(true);
				if (failure instanceof OrganizationConflictError)
					expect(failure.conflicts).toEqual([
						{ table: "departments", code: "HCO", reason: "NAME_MISMATCH" },
						{ table: "positions", code: "KADIV", reason: "LEGACY_CODE" },
					]);
				expect(
					(await tx.select().from(buildings).where(eq(buildings.code, "12")))
						.length,
				).toBe(0);
				expect(
					(
						await tx
							.select()
							.from(departments)
							.where(eq(departments.code, "HCO"))
					)[0]?.name,
				).toBe("Synthetic conflict");
			});
		});
		test("inactive references are reported rather than silently reactivated", async () => {
			await rollbackCase(async (tx) => {
				await tx
					.update(positions)
					.set({ isActive: false })
					.where(eq(positions.code, "KADEP"));
				let failure: unknown;
				try {
					await seedOrganization(tx);
				} catch (error) {
					failure = error;
				}
				expect(
					failure instanceof OrganizationConflictError &&
						failure.conflicts.some(
							(row) => row.reason === "INACTIVE_REFERENCE",
						),
				).toBe(true);
			});
		});
		test("rerun does not change existing SR assignment", async () => {
			await rollbackCase(async (tx) => {
				const id = `synthetic-seed-${randomUUID()}`;
				const building = (
					await tx.select().from(buildings).where(eq(buildings.code, "1"))
				)[0];
				if (!building) throw new Error("Missing official building");
				await tx.insert(user).values({
					id,
					name: "Synthetic seed SR",
					email: `${id}@example.invalid`,
					username: `000${randomUUID().replaceAll("-", "").slice(0, 16)}`,
				});
				await tx.insert(userProfiles).values({ userId: id, actor: "SR" });
				await tx.insert(srProfiles).values({
					userId: id,
					departmentCode: "RND",
					positionCode: "KADEP",
					buildingId: building.id,
				});
				const before = await tx
					.select()
					.from(srProfiles)
					.where(eq(srProfiles.userId, id));
				await seedOrganization(tx);
				expect(
					await tx.select().from(srProfiles).where(eq(srProfiles.userId, id)),
				).toEqual(before);
			});
		});
	},
);
