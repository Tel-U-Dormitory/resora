import { afterEach, beforeEach, expect, spyOn, test } from "bun:test";
import type { ActiveIdentity } from "@resora/auth/sr-access";
import type { Database } from "@resora/db";
import { violationsAudits } from "@resora/db/schema/violations";
import type { ObjectStorage } from "@resora/storage";
import * as identity from "../identity/identity.public";
import { violationDetail, violationHistory } from "./violations.service";

const reporter: ActiveIdentity = {
	userId: "synthetic-reporter",
	actor: "SR",
	nim: "0000000001",
	isActive: true,
	mustChangePassword: false,
	isSuperadmin: false,
	departmentCode: "RND",
	positionCode: "ANGGOTA",
	buildingId: "synthetic-building",
};
const admin: ActiveIdentity = {
	userId: "synthetic-admin",
	actor: "SYSTEM_ADMIN",
	username: "synthetic.admin",
	isActive: true,
	mustChangePassword: false,
	isSuperadmin: true,
};
const report = {
	id: "synthetic-report",
	publicCode: "PLG-0123456789",
	studentName: "Synthetic Resident",
	studentNim: "0000000002",
	incidentDate: "2026-11-20",
	description: "Synthetic incident",
	reporterUserId: reporter.userId,
	recordedBuildingId: "synthetic-building",
	recordedBuildingName: "Synthetic Building",
	ktmObjectKey: "violations/ktm/synthetic",
	version: 4,
	recordedAt: new Date("2026-11-20T10:00:00Z"),
	updatedAt: new Date("2026-11-21T10:00:00Z"),
	deletedAt: null as Date | null,
	deletedByUserId: null,
	deleteReason: null,
};
const audit = {
	id: "synthetic-audit",
	action: "UPDATED",
	reason: "Synthetic correction",
	beforeState: { studentName: "Previous synthetic name" },
	afterState: { studentName: report.studentName },
	actorUserId: reporter.userId,
	createdAt: report.updatedAt,
};
let liveIdentity: ActiveIdentity = reporter;
let liveSpy: ReturnType<typeof spyOn>;
let namesSpy: ReturnType<typeof spyOn>;
beforeEach(() => {
	liveIdentity = reporter;
	liveSpy = spyOn(identity, "getLiveOperationalIdentity").mockImplementation(
		async () => liveIdentity,
	);
	namesSpy = spyOn(identity, "getUserDisplayNames").mockResolvedValue(
		new Map([[reporter.userId, "Synthetic Reporter"]]),
	);
});
afterEach(() => {
	liveSpy.mockRestore();
	namesSpy.mockRestore();
});

// Project only the columns requested by the service, like the database does.
function database(row = report) {
	let auditReads = 0;
	const tx = {
		select: (fields: Record<string, unknown>) => ({
			from: (table: unknown) => ({
				where: () => {
					if (table === violationsAudits) {
						auditReads++;
						return { orderBy: async () => [audit] };
					}
					return Promise.resolve([
						Object.fromEntries(
							Object.keys(fields).map((key) => [
								key,
								row[key as keyof typeof row],
							]),
						),
					]);
				},
			}),
		}),
	};
	return {
		db: {
			transaction: async (run: (transaction: typeof tx) => unknown) => run(tx),
		} as unknown as Database,
		auditReads: () => auditReads,
	};
}

test("detail returns the current persisted version for optimistic edits", async () => {
	const { db } = database();
	const storage = {
		createPrivateDownloadUrl: async () => ({
			url: "https://storage.example/ktm",
		}),
	} as unknown as ObjectStorage;
	const detail = await violationDetail(db, storage, reporter, report.id);
	expect(detail).toMatchObject({ id: report.id, version: 4 });
});

test("reporter can read corrections while their report is active", async () => {
	const { db } = database();
	expect(await violationHistory(db, reporter, { reportId: report.id })).toEqual(
		[{ ...audit, actorName: "Synthetic Reporter" }],
	);
});

test("another SR cannot read full audit for an active report", async () => {
	liveIdentity = { ...reporter, userId: "synthetic-other-sr" };
	const { db, auditReads } = database();
	await expect(
		violationHistory(db, liveIdentity, { reportId: report.id }),
	).rejects.toMatchObject({
		code: "FORBIDDEN",
		message: "VIOLATION_HISTORY_ACCESS_DENIED",
	});
	expect(auditReads()).toBe(0);
});

test("deleted report audit payload is denied even to its SR reporter", async () => {
	const { db, auditReads } = database({ ...report, deletedAt: new Date() });
	await expect(
		violationHistory(db, reporter, { reportId: report.id }),
	).rejects.toMatchObject({
		code: "FORBIDDEN",
		message: "VIOLATION_HISTORY_ACCESS_DENIED",
	});
	expect(auditReads()).toBe(0);
});

test("SUPERADMIN retains full audit access for deleted reports", async () => {
	liveIdentity = admin;
	const { db } = database({ ...report, deletedAt: new Date() });
	expect(await violationHistory(db, admin, { reportId: report.id })).toEqual([
		{ ...audit, actorName: "Synthetic Reporter" },
	]);
});
