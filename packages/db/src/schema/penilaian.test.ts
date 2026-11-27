import { expect, test } from "bun:test";
import { getTableConfig } from "drizzle-orm/pg-core";
import {
	evaluationAttendanceFallbacks,
	evaluationAudits,
	evaluationDepartmentScores,
	evaluationEventScores,
	evaluationGformResponses,
	evaluationPeriodEvents,
	evaluationPeriods,
	evaluationPointTransactions,
	evaluationResultSnapshots,
} from "./penilaian";

test("Penilaian owns isolated evaluation_* tables with RLS and constraints", () => {
	const tables = [
		evaluationPeriods,
		evaluationPeriodEvents,
		evaluationEventScores,
		evaluationDepartmentScores,
		evaluationGformResponses,
		evaluationAttendanceFallbacks,
		evaluationPointTransactions,
		evaluationResultSnapshots,
		evaluationAudits,
	];

	for (const table of tables) {
		const config = getTableConfig(table);
		expect(config.name.startsWith("evaluation_")).toBe(true);
		expect(config.enableRLS).toBe(true);
	}

	const periods = getTableConfig(evaluationPeriods);
	expect(periods.columns.map((c) => c.name)).toContain("performance_threshold");
	expect(
		periods.columns.find((c) => c.name === "performance_threshold")?.notNull,
	).toBe(false);
	expect(
		periods.indexes.find(
			(i) => i.config.name === "evaluation_periods_single_active_idx",
		)?.config.unique,
	).toBe(true);

	const audits = getTableConfig(evaluationAudits);
	expect(audits.indexes.map((i) => i.config.name)).toEqual([
		"evaluation_audits_period_time_idx",
		"evaluation_audits_actor_time_idx",
	]);
});
