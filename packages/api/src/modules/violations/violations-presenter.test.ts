import { expect, test } from "bun:test";
import { type PublicReportRow, publicReport } from "./violations-presenter";

const deletedReport: PublicReportRow = {
	id: "synthetic-report",
	publicCode: "PLG-0123456789",
	studentName: "Synthetic Resident",
	studentNim: "0000000001",
	incidentDate: "2026-11-20",
	description: "Synthetic report description",
	reporterUserId: "synthetic-reporter",
	recordedBuildingId: "synthetic-building",
	recordedBuildingName: "Synthetic Building",
	ktmObjectKey: "violations/ktm/synthetic-object",
	version: 4,
	recordedAt: new Date("2026-11-20T10:00:00Z"),
	updatedAt: new Date("2026-11-21T10:00:00Z"),
	deletedAt: new Date("2026-11-21T10:00:00Z"),
	deletedByUserId: "synthetic-deleter",
	deleteReason: "Synthetic reason",
};

test("active SR tombstone excludes deleted report details and identities", () => {
	const dto = publicReport(deletedReport, null);
	expect(dto).toMatchObject({
		publicCode: deletedReport.publicCode,
		studentName: null,
		studentNim: null,
		incidentDate: null,
		description: null,
		reporterUserId: null,
		reporterName: null,
		deletedByUserId: null,
		deleteReason: "Synthetic reason",
	});
});

test("SUPERADMIN projection can include deleted report details for audit", () => {
	const dto = publicReport(deletedReport, "Synthetic Reporter", true);
	expect(dto).toMatchObject({
		studentName: deletedReport.studentName,
		studentNim: deletedReport.studentNim,
		incidentDate: deletedReport.incidentDate,
		description: deletedReport.description,
		reporterUserId: deletedReport.reporterUserId,
		deletedByUserId: deletedReport.deletedByUserId,
	});
});
