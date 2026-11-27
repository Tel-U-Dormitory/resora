import { afterEach, beforeEach, expect, spyOn, test } from "bun:test";
import type { ActiveIdentity } from "@resora/auth/sr-access";
import type { Database } from "@resora/db";
import * as attendancePublic from "../attendance/attendance.public";
import * as eventsPublic from "../events/events.public";
import * as identityPublic from "../identity/identity.public";
import { calculatePeriodEvaluations } from "./penilaian-calculator";
import {
	correctEvaluationScore,
	finalizeEvaluationPeriod,
	openEvaluationRevision,
} from "./penilaian-recap.service";

const periodId = "11111111-1111-4111-8111-111111111111";
const scoreId = "22222222-2222-4222-8222-222222222222";

const hcoKadep: ActiveIdentity = {
	userId: "hco-kadep",
	actor: "SR",
	nim: "1000000001",
	isActive: true,
	mustChangePassword: false,
	isSuperadmin: false,
	departmentCode: "HCO",
	positionCode: "KADEP",
	buildingId: "b-1",
};

test("calculatePeriodEvaluations matches Pedoman §10.2 exact worked example (158.5 without 100 cap)", () => {
	const roster = [
		{
			userId: "sr-1",
			nim: "1001",
			name: "SR Satu",
			departmentCode: "RND",
			positionCode: "ANGGOTA",
			buildingCode: "A",
			buildingName: "Gedung A",
		},
		{
			userId: "sr-2",
			nim: "1002",
			name: "SR Dua",
			departmentCode: "RND",
			positionCode: "KADEP",
			buildingCode: "A",
			buildingName: "Gedung A",
		},
	];
	const periodEvents = [
		{
			periodEventId: "a1",
			eventId: "e-a1",
			title: "Tahunan 1",
			category: "ANNUAL" as const,
			isMandatory: true,
			rosterUserIds: ["sr-1", "sr-2"],
		},
		{
			periodEventId: "a2",
			eventId: "e-a2",
			title: "Tahunan 2",
			category: "ANNUAL" as const,
			isMandatory: true,
			rosterUserIds: ["sr-1", "sr-2"],
		},
		{
			periodEventId: "b1",
			eventId: "e-b1",
			title: "Bulanan 1",
			category: "MONTHLY" as const,
			isMandatory: true,
			rosterUserIds: ["sr-1", "sr-2"],
		},
		{
			periodEventId: "b2",
			eventId: "e-b2",
			title: "Bulanan 2",
			category: "MONTHLY" as const,
			isMandatory: true,
			rosterUserIds: ["sr-1", "sr-2"],
		},
		{
			periodEventId: "b3",
			eventId: "e-b3",
			title: "Bulanan 3",
			category: "MONTHLY" as const,
			isMandatory: true,
			rosterUserIds: ["sr-1", "sr-2"],
		},
		{
			periodEventId: "m1",
			eventId: "e-m1",
			title: "Mingguan 1",
			category: "WEEKLY" as const,
			isMandatory: true,
			rosterUserIds: ["sr-1", "sr-2"],
		},
		{
			periodEventId: "m2",
			eventId: "e-m2",
			title: "Mingguan 2",
			category: "WEEKLY" as const,
			isMandatory: true,
			rosterUserIds: ["sr-1", "sr-2"],
		},
	];
	const makeScore = (
		peId: string,
		val: number,
		target = "sr-1",
		ev = "sr-2",
	) => ({
		id: `${peId}-${target}`,
		periodEventId: peId,
		evaluatorUserId: ev,
		targetUserId: target,
		commitment: val,
		teamwork: val,
		attitude: val,
		contribution: val,
	});
	const eventScores = [
		makeScore("a1", 90),
		makeScore("a2", 100),
		makeScore("b1", 90),
		makeScore("b2", 100),
		makeScore("b3", 100),
		makeScore("m1", 80),
		makeScore("m2", 90),
		// Complete sr-2 as well to test SIAP_DIFINALISASI.
		makeScore("a1", 80, "sr-2", "sr-1"),
		makeScore("a2", 80, "sr-2", "sr-1"),
		makeScore("b1", 80, "sr-2", "sr-1"),
		makeScore("b2", 80, "sr-2", "sr-1"),
		makeScore("b3", 80, "sr-2", "sr-1"),
		makeScore("m1", 80, "sr-2", "sr-1"),
		makeScore("m2", 80, "sr-2", "sr-1"),
	];
	const departmentScores = [
		{
			id: "d1",
			quarterNumber: 1,
			evaluatorUserId: "sr-2",
			targetUserId: "sr-1",
			commitment: 90,
			teamwork: 90,
			attitude: 90,
			contribution: 90,
		},
		{
			id: "d2",
			quarterNumber: 1,
			evaluatorUserId: "inti-1",
			targetUserId: "sr-2",
			commitment: 80,
			teamwork: 80,
			attitude: 80,
			contribution: 80,
		},
	];
	const gformResponses = [
		{
			sourceType: "SR_MABA" as const,
			cycleNumber: 1,
			targetUserId: "sr-1",
			totalScore: 85,
		},
		{
			sourceType: "SR_MABA" as const,
			cycleNumber: 1,
			targetUserId: "sr-2",
			totalScore: 80,
		},
		{
			sourceType: "EXTERNAL_ASUS_DITMAWA" as const,
			cycleNumber: 1,
			targetUserId: "sr-1",
			totalScore: 42,
		},
	];

	const result = calculatePeriodEvaluations({
		periodStatus: "OPEN",
		performanceThreshold: null,
		roster,
		periodEvents,
		eventScores,
		departmentScores,
		gformResponses,
		attendanceByUserId: new Map([
			["sr-1", { resoraPoints: 24.2, fallbackPoints: 8 }],
		]),
		adjustmentsByUserId: new Map([["sr-1", { additions: 20, deductions: 5 }]]),
	});

	expect(result.readinessStatus).toBe("SIAP_DIFINALISASI");
	const sr1 = result.members[0];
	expect(sr1?.annualWeighted).toBe(47.5);
	expect(sr1?.monthlyWeighted).toBe(29);
	expect(sr1?.weeklyWeighted).toBe(17);
	expect(sr1?.departmentWeighted).toBe(22.5);
	expect(sr1?.gformWeighted).toBe(42.5);
	expect(sr1?.totalWeightedScore).toBe(158.5);
	expect(sr1?.attendancePointsTotal).toBe(32.2);
	expect(sr1?.netAdjustmentPoints).toBe(15);
	expect(sr1?.externalScoreAverage).toBe(42);
	expect(sr1?.thresholdStatus).toBeNull();
});

test("calculatePeriodEvaluations marks missing mandatory components BELUM_LENGKAP and never treats missing as zero", () => {
	const result = calculatePeriodEvaluations({
		periodStatus: "OPEN",
		performanceThreshold: 80,
		roster: [
			{
				userId: "sr-1",
				nim: "1001",
				name: "SR Satu",
				departmentCode: "RND",
				positionCode: "ANGGOTA",
				buildingCode: "A",
				buildingName: "Gedung A",
			},
		],
		periodEvents: [],
		eventScores: [],
		departmentScores: [
			{
				id: "d1",
				quarterNumber: 1,
				evaluatorUserId: "kadep-1",
				targetUserId: "sr-1",
				commitment: 100,
				teamwork: 100,
				attitude: 100,
				contribution: 100,
			},
		],
		gformResponses: [], // Missing GForm SR/Maba
		attendanceByUserId: new Map(),
		adjustmentsByUserId: new Map(),
	});

	expect(result.readinessStatus).toBe("BELUM_LENGKAP");
	expect(result.members[0]?.isComplete).toBe(false);
	expect(result.members[0]?.totalWeightedScore).toBeNull();
	expect(result.members[0]?.thresholdStatus).toBeNull();
	expect(result.members[0]?.missingComponents).toContain(
		"Impor GForm SR & Maba (50%)",
	);
});

let liveSpy: ReturnType<typeof spyOn>;
let rosterSpy: ReturnType<typeof spyOn>;
let attSpy: ReturnType<typeof spyOn>;
let eventSpy: ReturnType<typeof spyOn>;
let inviteSpy: ReturnType<typeof spyOn>;

beforeEach(() => {
	liveSpy = spyOn(
		identityPublic,
		"getLiveOperationalIdentity",
	).mockResolvedValue(hcoKadep);
	rosterSpy = spyOn(
		identityPublic,
		"readSrPeriodEvaluationRoster",
	).mockResolvedValue([
		{
			userId: "sr-1",
			nim: "1001",
			name: "SR Satu",
			isActive: true,
			currentDepartmentCode: "RND",
			currentDepartmentName: "RnD",
			currentPositionCode: "ANGGOTA",
			currentBuildingCode: "A",
			currentBuildingName: "Gedung A",
		},
	]);
	attSpy = spyOn(
		attendancePublic,
		"readPeriodAttendancePoints",
	).mockResolvedValue({
		period: {
			id: "sr-p1",
			name: "SR 14",
			startsOn: "2026-08-01",
			endsOn: "2027-07-31",
			timeZone: "Asia/Jakarta",
		},
		availableEvents: [],
		events: [],
		participants: [],
	});
	eventSpy = spyOn(eventsPublic, "readEvent").mockResolvedValue([]);
	inviteSpy = spyOn(eventsPublic, "invitationSnapshots").mockResolvedValue([]);
});

afterEach(() => {
	liveSpy.mockRestore();
	rosterSpy.mockRestore();
	attSpy.mockRestore();
	eventSpy.mockRestore();
	inviteSpy.mockRestore();
});

test("finalizeEvaluationPeriod blocks incomplete periods and openRevision increments version", async () => {
	let selectCount = 0;
	const tx = {
		select: () => ({
			from: () => ({
				where: (/* cond */) => {
					selectCount++;
					if (selectCount === 1) {
						return {
							for: async () => [
								{
									id: periodId,
									srPeriodId: "sr-p1",
									status: "OPEN",
									version: 1,
									performanceThreshold: null,
								},
							],
						};
					}
					if (selectCount === 2) {
						return { orderBy: async () => [] };
					}
					return Promise.resolve([]);
				},
			}),
		}),
	};
	const incompleteDb = {
		transaction: async (run: (t: typeof tx) => unknown) => run(tx),
	} as unknown as Database;

	await expect(
		finalizeEvaluationPeriod(incompleteDb, hcoKadep, {
			evaluationPeriodId: periodId,
		}),
	).rejects.toMatchObject({
		code: "PRECONDITION_FAILED",
		message: "EVALUATION_INCOMPLETE_CANNOT_FINALIZE",
	});

	// Final period rejects direct score correction until revision is opened.
	const finalTx = {
		select: () => ({
			from: () => ({
				where: () => ({
					for: async () => [{ id: periodId, status: "FINAL", version: 1 }],
				}),
			}),
		}),
		update: () => ({
			set: (val: Record<string, unknown>) => ({
				where: () => ({
					returning: async () => [{ id: periodId, ...val }],
				}),
			}),
		}),
		insert: () => ({ values: async () => [] }),
	};
	const finalDb = {
		transaction: async (run: (t: typeof finalTx) => unknown) => run(finalTx),
	} as unknown as Database;

	await expect(
		correctEvaluationScore(finalDb, hcoKadep, {
			evaluationPeriodId: periodId,
			scoreType: "DEPARTMENT_SCORE",
			scoreId,
			commitment: 90,
			teamwork: 90,
			attitude: 90,
			contribution: 90,
			reason: "Koreksi input",
		}),
	).rejects.toMatchObject({
		code: "CONFLICT",
		message: "EVALUATION_FINALIZED_OPEN_REVISION_REQUIRED",
	});

	const reopened = await openEvaluationRevision(finalDb, hcoKadep, {
		evaluationPeriodId: periodId,
		reason: "Ada pembaruan nilai departemen",
	});
	expect(reopened?.status).toBe("REVISING");
	expect(reopened?.version).toBe(2);
});
