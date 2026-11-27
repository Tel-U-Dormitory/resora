import { afterEach, beforeEach, expect, spyOn, test } from "bun:test";
import type { ActiveIdentity } from "@resora/auth/sr-access";
import type { Database } from "@resora/db";
import * as attendancePublic from "../attendance/attendance.public";
import * as identityPublic from "../identity/identity.public";
import { calculateFallbackAttendancePoints } from "./penilaian.contracts";
import {
	decidePointTransaction,
	listAttendancePointsSummary,
	listPointTransactions,
	proposePointTransaction,
	recordAttendanceFallback,
} from "./penilaian-points.service";

const periodId = "11111111-1111-4111-8111-111111111111";
const txId = "22222222-2222-4222-8222-222222222222";

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
const intiMember: ActiveIdentity = {
	...hcoMember,
	userId: "inti-1",
	departmentCode: "INTI",
	positionCode: "KETUM",
};
const rndKadep: ActiveIdentity = {
	...hcoMember,
	userId: "rnd-kadep",
	departmentCode: "RND",
	positionCode: "KADEP",
};
const rndMember: ActiveIdentity = {
	...hcoMember,
	userId: "rnd-member",
	departmentCode: "RND",
	positionCode: "ANGGOTA",
};

let liveIdentity: ActiveIdentity = hcoMember;
let liveSpy: ReturnType<typeof spyOn>;
let readSpy: ReturnType<typeof spyOn>;
let rosterSpy: ReturnType<typeof spyOn>;
let namesSpy: ReturnType<typeof spyOn>;
let attendanceSpy: ReturnType<typeof spyOn>;

beforeEach(() => {
	liveIdentity = hcoMember;
	liveSpy = spyOn(
		identityPublic,
		"getLiveOperationalIdentity",
	).mockImplementation(async () => liveIdentity);
	readSpy = spyOn(identityPublic, "readOperationalIdentity").mockImplementation(
		async () => liveIdentity,
	);
	rosterSpy = spyOn(
		identityPublic,
		"readSrPeriodEvaluationRoster",
	).mockResolvedValue([
		{
			userId: "rnd-member",
			nim: "2000000001",
			name: "Member RnD",
			isActive: true,
			currentDepartmentCode: "RND",
			currentDepartmentName: "RnD",
			currentPositionCode: "ANGGOTA",
			currentBuildingCode: "A",
			currentBuildingName: "Gedung A",
		},
	]);
	namesSpy = spyOn(identityPublic, "getUserDisplayNames").mockResolvedValue(
		new Map([
			["rnd-member", "Member RnD"],
			["rnd-kadep", "Kadep RnD"],
			["inti-1", "Ketum"],
		]),
	);
	attendanceSpy = spyOn(
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
		participants: [
			{
				userId: "rnd-member",
				nim: "2000000001",
				name: "Member RnD",
				currentDepartmentCode: "RND",
				currentDepartmentName: "RnD",
				currentBuildingCode: "A",
				currentBuildingName: "Gedung A",
				events: [],
				attendedCount: 2,
				absentCount: 0,
				eventCount: 2,
				totalPoints: 20,
				maximumPossiblePoints: 20,
				unclassifiedCount: 0,
				scoringStatus: "COMPLETE",
			},
		],
	});
});

afterEach(() => {
	liveSpy.mockRestore();
	readSpy.mockRestore();
	rosterSpy.mockRestore();
	namesSpy.mockRestore();
	attendanceSpy.mockRestore();
});

test("calculateFallbackAttendancePoints matches Pedoman §7.2-7.3 including 0.6 factor and configurable Sidak", () => {
	expect(
		calculateFallbackAttendancePoints(
			"RAPAT_ALL_PANITIA",
			"HADIR_TEPAT_WAKTU",
			10,
		),
	).toEqual({ maxPoints: 10, earnedPoints: 10 });
	expect(
		calculateFallbackAttendancePoints(
			"EVENT_SEBAGIAN",
			"TERLAMBAT_DENGAN_IZIN",
			10,
		),
	).toEqual({ maxPoints: 6, earnedPoints: 4.8 });
	expect(
		calculateFallbackAttendancePoints(
			"EVENT_SEBAGIAN",
			"TERLAMBAT_TANPA_IZIN_MAX_15",
			10,
		),
	).toEqual({ maxPoints: 6, earnedPoints: 4.2 });
	expect(
		calculateFallbackAttendancePoints("SIDAK", "TERLAMBAT_DENGAN_IZIN", 8),
	).toEqual({ maxPoints: 8, earnedPoints: 6.4 });
	expect(
		calculateFallbackAttendancePoints("EVENT_BESAR", "IZIN_DI_LUAR_5K", 10),
	).toEqual({ maxPoints: 10, earnedPoints: 3 });
});

test("recordAttendanceFallback enforces HCO and combines with Attendance RESORA points", async () => {
	const deniedDb = { transaction: async () => null } as unknown as Database;
	await expect(
		recordAttendanceFallback(deniedDb, rndMember, {
			evaluationPeriodId: periodId,
			targetUserId: "rnd-member",
			activityType: "SIDAK",
			activityTitle: "Sidak Malam",
			activityDate: "2026-10-10",
			attendanceStatus: "HADIR_TEPAT_WAKTU",
			notes: "Sidak asrama",
		}),
	).rejects.toMatchObject({ code: "FORBIDDEN" });

	let call = 0;
	const tx = {
		select: () => ({
			from: () => ({
				where: () => {
					call++;
					if (call === 1) {
						return {
							for: async () => [
								{
									id: periodId,
									srPeriodId: "sr-p1",
									status: "OPEN",
									sidakMaxPoints: 8,
								},
							],
						};
					}
					return Promise.resolve([]);
				},
			}),
		}),
		insert: () => ({
			values: (val: Record<string, unknown>) => {
				if ("entityType" in val) return Promise.resolve([val]);
				return {
					returning: async () => [{ id: "fb-1", ...val }],
				};
			},
		}),
	};
	const db = {
		transaction: async (run: (t: typeof tx) => unknown) => run(tx),
	} as unknown as Database;

	const created = await recordAttendanceFallback(db, hcoMember, {
		evaluationPeriodId: periodId,
		targetUserId: "rnd-member",
		activityType: "SIDAK",
		activityTitle: "Sidak Malam",
		activityDate: "2026-10-10",
		attendanceStatus: "HADIR_TEPAT_WAKTU",
		notes: "Sidak asrama",
	});
	expect(created.maxPoints).toBe(8);
	expect(created.earnedPoints).toBe(8);

	// Combined summary in pre-final mode: HCO sees 20 + 8 = 28, regular SR is blocked.
	let readCall = 0;
	const summaryTx = {
		select: () => ({
			from: () => ({
				where: () => {
					readCall++;
					if (readCall === 1) {
						return Promise.resolve([
							{ id: periodId, srPeriodId: "sr-p1", status: "OPEN" },
						]);
					}
					return {
						orderBy: async () => [
							{
								id: "fb-1",
								targetUserId: "rnd-member",
								earnedPoints: 8,
							},
						],
					};
				},
			}),
		}),
	};
	const summaryDb = {
		transaction: async (run: (t: typeof summaryTx) => unknown) =>
			run(summaryTx),
	} as unknown as Database;

	const hcoSummary = await listAttendancePointsSummary(summaryDb, hcoMember, {
		evaluationPeriodId: periodId,
	});
	expect(hcoSummary[0]?.totalAttendancePoints).toBe(28);

	readCall = 0;
	liveIdentity = rndMember;
	await expect(
		listAttendancePointsSummary(summaryDb, rndMember, {
			evaluationPeriodId: periodId,
		}),
	).rejects.toMatchObject({
		code: "FORBIDDEN",
		message: "EVALUATION_PREFINAL_ACCESS_DENIED",
	});
});

test("point transactions follow KADEP proposal, HCO/Inti approval, and net calculation (FR-EVAL-009/035)", async () => {
	const deniedDb = { transaction: async () => null } as unknown as Database;
	await expect(
		proposePointTransaction(deniedDb, rndMember, {
			evaluationPeriodId: periodId,
			targetUserId: "rnd-member",
			transactionType: "ADDITION",
			points: 10,
			category: "Kontribusi",
			reason: "Panitia tambahan",
			occurredOn: "2026-10-10",
		}),
	).rejects.toMatchObject({ code: "FORBIDDEN" });

	liveIdentity = rndKadep;
	const proposeTx = {
		select: () => ({
			from: () => ({
				where: () => ({
					for: async () => [
						{ id: periodId, srPeriodId: "sr-p1", status: "OPEN" },
					],
				}),
			}),
		}),
		insert: () => ({
			values: (val: Record<string, unknown>) => {
				if ("entityType" in val) return Promise.resolve([val]);
				return {
					returning: async () => [{ id: txId, ...val }],
				};
			},
		}),
	};
	const proposeDb = {
		transaction: async (run: (t: typeof proposeTx) => unknown) =>
			run(proposeTx),
	} as unknown as Database;

	const proposed = await proposePointTransaction(proposeDb, rndKadep, {
		evaluationPeriodId: periodId,
		targetUserId: "rnd-member",
		transactionType: "ADDITION",
		points: 20,
		category: "Kontribusi",
		reason: "Panitia tambahan",
		occurredOn: "2026-10-10",
	});
	expect(proposed.status).toBe("PENDING");

	// Only HCO/Inti/SUPERADMIN can decide; KADEP is denied.
	await expect(
		decidePointTransaction(proposeDb, rndKadep, {
			evaluationPeriodId: periodId,
			transactionId: txId,
			decision: "APPROVED",
		}),
	).rejects.toMatchObject({ code: "FORBIDDEN" });

	liveIdentity = intiMember;
	let decideCall = 0;
	const decideTx = {
		select: () => ({
			from: () => ({
				where: () => ({
					for: async () => {
						decideCall++;
						if (decideCall === 1) return [{ id: periodId, status: "OPEN" }];
						return [
							{
								id: txId,
								evaluationPeriodId: periodId,
								targetUserId: "rnd-member",
								transactionType: "ADDITION",
								points: 20,
								status: "PENDING",
							},
						];
					},
				}),
			}),
		}),
		update: () => ({
			set: (val: Record<string, unknown>) => ({
				where: () => ({
					returning: async () => [{ id: txId, ...val }],
				}),
			}),
		}),
		insert: () => ({ values: async () => [] }),
	};
	const decideDb = {
		transaction: async (run: (t: typeof decideTx) => unknown) => run(decideTx),
	} as unknown as Database;
	const decided = await decidePointTransaction(decideDb, intiMember, {
		evaluationPeriodId: periodId,
		transactionId: txId,
		decision: "APPROVED",
		decisionNote: "Sesuai kontribusi",
	});
	expect(decided?.status).toBe("APPROVED");

	// Net calculation ignores PENDING/REJECTED and sums APPROVED (20 - 5 = 15).
	let listCall = 0;
	const listTx = {
		select: () => ({
			from: () => ({
				where: () => {
					listCall++;
					if (listCall === 1)
						return Promise.resolve([{ id: periodId, status: "OPEN" }]);
					return {
						orderBy: async () => [
							{
								id: "t1",
								targetUserId: "rnd-member",
								transactionType: "ADDITION",
								points: 20,
								status: "APPROVED",
								proposedByUserId: "rnd-kadep",
								decidedByUserId: "inti-1",
							},
							{
								id: "t2",
								targetUserId: "rnd-member",
								transactionType: "DEDUCTION",
								points: 5,
								status: "APPROVED",
								proposedByUserId: "rnd-kadep",
								decidedByUserId: "inti-1",
							},
							{
								id: "t3",
								targetUserId: "rnd-member",
								transactionType: "ADDITION",
								points: 99,
								status: "PENDING",
								proposedByUserId: "rnd-kadep",
								decidedByUserId: null,
							},
						],
					};
				},
			}),
		}),
	};
	const listDb = {
		transaction: async (run: (t: typeof listTx) => unknown) => run(listTx),
	} as unknown as Database;
	const listed = await listPointTransactions(listDb, intiMember, {
		evaluationPeriodId: periodId,
	});
	expect(listed.netTotalsByUser["rnd-member"]?.net).toBe(15);
});
