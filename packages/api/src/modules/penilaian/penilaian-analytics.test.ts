import { afterEach, beforeEach, expect, spyOn, test } from "bun:test";
import type { ActiveIdentity } from "@resora/auth/sr-access";
import type { Database } from "@resora/db";
import * as identityPublic from "../identity/identity.public";
import {
	exportEvaluationRecapCsv,
	getEvaluationAnalytics,
	getEvaluationDashboardSummary,
	getEvaluationMemberDetail,
	getEvaluationRecapList,
	getOwnEvaluationRecap,
} from "./penilaian-analytics.service";

const periodId = "11111111-1111-4111-8111-111111111111";

const hcoMember: ActiveIdentity = {
	userId: "hco-1",
	actor: "SR",
	nim: "1000000001",
	isActive: true,
	mustChangePassword: false,
	isSuperadmin: false,
	departmentCode: "HCO",
	positionCode: "ANGGOTA",
	buildingId: "b-1",
};
const rndKadep: ActiveIdentity = {
	...hcoMember,
	userId: "rnd-kadep",
	nim: "1000000002",
	departmentCode: "RND",
	positionCode: "KADEP",
};
const sr1: ActiveIdentity = {
	...hcoMember,
	userId: "sr-1",
	nim: "0001001",
	departmentCode: "RND",
	positionCode: "ANGGOTA",
};

const finalPeriod = {
	id: periodId,
	srPeriodId: "sr-p1",
	name: "Evaluasi Triwulan 1",
	status: "FINAL" as const,
	version: 1,
	isActive: true,
	performanceThreshold: null,
	finalizedAt: new Date("2026-11-27T10:00:00Z"),
};

const snapshots = [
	{
		id: "snap-1",
		evaluationPeriodId: periodId,
		version: 1,
		targetUserId: "sr-1",
		snapshotNim: "0001001",
		snapshotName: "=CMD|calc",
		snapshotDepartmentCode: "RND",
		snapshotPositionCode: "ANGGOTA",
		snapshotBuildingCode: "A",
		snapshotBuildingName: "Gedung A",
		annualWeighted: 47.5,
		monthlyWeighted: 29,
		weeklyWeighted: 17,
		departmentWeighted: 22.5,
		gformWeighted: 42.5,
		totalWeightedScore: 158.5,
		attendancePointsTotal: 32.2,
		netAdjustmentPoints: 15,
		externalScoreAverage: 42,
		componentBreakdown: { eventBreakdowns: [] },
	},
	{
		id: "snap-2",
		evaluationPeriodId: periodId,
		version: 1,
		targetUserId: "sr-2",
		snapshotNim: "0001002",
		snapshotName: "SR Dua",
		snapshotDepartmentCode: "ADAPTIF",
		snapshotPositionCode: "ANGGOTA",
		snapshotBuildingCode: "B",
		snapshotBuildingName: "Gedung B",
		annualWeighted: 20,
		monthlyWeighted: 10,
		weeklyWeighted: 10,
		departmentWeighted: 20,
		gformWeighted: 40,
		totalWeightedScore: 100,
		attendancePointsTotal: 20,
		netAdjustmentPoints: 0,
		externalScoreAverage: null,
		componentBreakdown: { eventBreakdowns: [] },
	},
];

let liveIdentity: ActiveIdentity = sr1;
let readSpy: ReturnType<typeof spyOn>;

beforeEach(() => {
	liveIdentity = sr1;
	readSpy = spyOn(identityPublic, "readOperationalIdentity").mockImplementation(
		async () => liveIdentity,
	);
});

afterEach(() => {
	readSpy.mockRestore();
});

function makeFinalDb(periodRow: Record<string, unknown> = finalPeriod) {
	let call = 0;
	const tx = {
		select: () => ({
			from: () => ({
				where: () => {
					call++;
					if (call === 1) return Promise.resolve([periodRow]);
					return Promise.resolve(snapshots);
				},
				orderBy: () => ({
					limit: async () => [periodRow],
				}),
			}),
		}),
	};
	return {
		transaction: async (run: (t: typeof tx) => unknown) => run(tx),
	} as unknown as Database;
}

test("pre-final results are blocked for regular SR and KADEP, and ownRecap hides pre-final scores", async () => {
	const openPeriod = {
		...finalPeriod,
		status: "OPEN" as const,
		finalizedAt: null,
	};
	await expect(
		getEvaluationRecapList(makeFinalDb(openPeriod), sr1, {
			evaluationPeriodId: periodId,
		}),
	).rejects.toMatchObject({
		code: "FORBIDDEN",
		message: "EVALUATION_PREFINAL_ACCESS_DENIED",
	});

	liveIdentity = rndKadep;
	await expect(
		getEvaluationAnalytics(makeFinalDb(openPeriod), rndKadep, {
			evaluationPeriodId: periodId,
		}),
	).rejects.toMatchObject({
		code: "FORBIDDEN",
		message: "EVALUATION_PREFINAL_ACCESS_DENIED",
	});

	liveIdentity = sr1;
	const ownPreFinal = await getOwnEvaluationRecap(
		makeFinalDb(openPeriod),
		sr1,
		{ evaluationPeriodId: periodId },
	);
	expect(ownPreFinal.status).toBe("BELUM_FINAL");
	expect(ownPreFinal.recap).toBeNull();
});

test("finalized recap, detail, and CSV export enforce per-role scope and CSV formula neutralization", async () => {
	liveIdentity = sr1;
	const ownList = await getEvaluationRecapList(makeFinalDb(), sr1, {
		evaluationPeriodId: periodId,
	});
	// Regular SR only sees their own row, never sr-2.
	expect(ownList.rows).toHaveLength(1);
	expect(ownList.rows[0]?.userId).toBe("sr-1");
	expect(ownList.rows[0]?.totalWeightedScore).toBe(158.5);

	await expect(
		getEvaluationMemberDetail(makeFinalDb(), sr1, {
			evaluationPeriodId: periodId,
			targetUserId: "sr-2",
		}),
	).rejects.toMatchObject({
		code: "FORBIDDEN",
		message: "EVALUATION_TARGET_ACCESS_DENIED",
	});

	// Export CSV preserves leading zero in NIM and neutralizes formula injection in name.
	const csv = await exportEvaluationRecapCsv(makeFinalDb(), sr1, {
		evaluationPeriodId: periodId,
	});
	expect(csv.content).toContain(`"'0001001"`);
	expect(csv.content).toContain(`"'=CMD|calc"`);
	expect(csv.content).not.toContain("0001002");

	// KADEP sees final analytics across all SR.
	liveIdentity = rndKadep;
	const analytics = await getEvaluationAnalytics(makeFinalDb(), rndKadep, {
		evaluationPeriodId: periodId,
	});
	expect(analytics.summary.totalSr).toBe(2);
	expect(analytics.summary.averageTotalScore).toBe(129.25);
});

test("dashboardSummary returns personal final score and management summary without client calculation", async () => {
	const makeDashDb = (periodRow: Record<string, unknown> = finalPeriod) => {
		let call = 0;
		const tx = {
			select: () => ({
				from: () => ({
					where: () => {
						call++;
						if (call === 1) {
							return { limit: async () => [periodRow] };
						}
						return Promise.resolve(snapshots);
					},
				}),
			}),
		};
		return {
			transaction: async (run: (t: typeof tx) => unknown) => run(tx),
		} as unknown as Database;
	};

	liveIdentity = sr1;
	const personal = await getEvaluationDashboardSummary(makeDashDb(), sr1, {
		mode: "personal",
	});
	expect(personal).toMatchObject({
		mode: "personal",
		state: "ready",
		finalScore: 158.5,
		completionPercentage: 100,
	});

	liveIdentity = hcoMember;
	const mgmt = await getEvaluationDashboardSummary(makeDashDb(), hcoMember, {
		mode: "management",
	});
	expect(mgmt).toMatchObject({
		mode: "management",
		state: "ready_summary",
		averageScore: 129.25,
		completionPercentage: 100,
		assessedCount: 2,
		unassessedCount: 0,
	});
});
