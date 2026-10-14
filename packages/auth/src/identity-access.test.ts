import { expect, test } from "bun:test";
import type { Database } from "@resora/db";
import { getActiveIdentity, getActiveSr } from "./sr-access";

test("SYSTEM_ADMIN resolver requires active account/username/grant and has no fake SR fields", async () => {
	const row = {
		userId: "synthetic-system",
		actor: "SYSTEM_ADMIN",
		nim: "resora.admin",
		isActive: true,
		mustChangePassword: true,
		isSuperadmin: true,
		srUserId: null,
	};
	const query = {
		innerJoin: () => query,
		leftJoin: () => query,
		where: async () => [row],
	};
	const db = { select: () => ({ from: () => query }) } as unknown as Database;
	const identity = await getActiveIdentity(db, row.userId);
	expect(identity).toMatchObject({
		actor: "SYSTEM_ADMIN",
		username: "resora.admin",
		mustChangePassword: true,
	});
	for (const field of ["nim", "departmentCode", "positionCode", "buildingId"])
		expect(identity).not.toHaveProperty(field);
	expect(await getActiveSr(db, row.userId)).toBeNull();
	for (const field of ["isActive", "isSuperadmin"] as const) {
		row[field] = false;
		expect(await getActiveIdentity(db, row.userId)).toBeNull();
		row[field] = true;
	}
	row.nim = " ";
	expect(await getActiveIdentity(db, row.userId)).toBeNull();
});
