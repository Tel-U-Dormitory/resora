import { expect, test } from "bun:test";
import { getTableConfig } from "drizzle-orm/pg-core";
import {
	violationsAudits,
	violationsReports,
	violationsUploadIntents,
} from "./violations";

test("Pelanggaran owns two isolated, private tables with stable history fields", () => {
	const reports = getTableConfig(violationsReports);
	const audits = getTableConfig(violationsAudits);
	const uploads = getTableConfig(violationsUploadIntents);

	expect(reports.name).toBe("violations_reports");
	expect(audits.name).toBe("violations_audits");
	expect(reports.enableRLS).toBe(true);
	expect(audits.enableRLS).toBe(true);
	expect(uploads.name).toBe("violations_upload_intents");
	expect(uploads.enableRLS).toBe(true);
	expect(reports.columns.map((column) => column.name)).toEqual([
		"id",
		"public_code",
		"student_name",
		"student_nim",
		"incident_date",
		"description",
		"reporter_user_id",
		"recorded_building_id",
		"recorded_building_name",
		"ktm_object_key",
		"ktm_content_type",
		"ktm_size_bytes",
		"idempotency_key",
		"version",
		"recorded_at",
		"updated_at",
		"deleted_at",
		"deleted_by_user_id",
		"delete_reason",
	]);
	expect(
		reports.columns
			.find((column) => column.name === "incident_date")
			?.getSQLType(),
	).toBe("date");
	expect(
		reports.columns
			.find((column) => column.name === "ktm_size_bytes")
			?.getSQLType(),
	).toBe("bigint");
	expect(reports.indexes.map((index) => index.config.name)).toContain(
		"violations_reports_public_code_idx",
	);
	expect(
		reports.indexes.find(
			(index) =>
				index.config.name === "violations_reports_reporter_idempotency_idx",
		)?.config.unique,
	).toBe(true);
	expect(audits.foreignKeys).toHaveLength(2);
	expect(audits.indexes.map((index) => index.config.name)).toEqual([
		"violations_audits_report_time_idx",
		"violations_audits_actor_time_idx",
	]);
});
