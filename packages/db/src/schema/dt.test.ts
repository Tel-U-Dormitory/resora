import { expect, test } from "bun:test";
import { getTableConfig } from "drizzle-orm/pg-core";
import { dtAssignmentHistories, dtAudits, dtMemberships } from "./dt";

test("DT module owns isolated dt_* tables with RLS and audit/lifecycle constraints", () => {
	const tables = [dtMemberships, dtAssignmentHistories, dtAudits];
	for (const table of tables) {
		const config = getTableConfig(table);
		expect(config.name.startsWith("dt_")).toBe(true);
		expect(config.enableRLS).toBe(true);
	}

	const memberships = getTableConfig(dtMemberships);
	expect(memberships.indexes.map((i) => i.config.name)).toEqual([
		"dt_memberships_single_active_user_idx",
		"dt_memberships_single_candidate_user_idx",
		"dt_memberships_status_idx",
		"dt_memberships_user_created_idx",
		"dt_memberships_dept_status_idx",
		"dt_memberships_building_status_idx",
	]);
	expect(
		memberships.indexes.find(
			(i) => i.config.name === "dt_memberships_single_active_user_idx",
		)?.config.unique,
	).toBe(true);
	expect(
		memberships.indexes.find(
			(i) => i.config.name === "dt_memberships_single_candidate_user_idx",
		)?.config.unique,
	).toBe(true);
});
