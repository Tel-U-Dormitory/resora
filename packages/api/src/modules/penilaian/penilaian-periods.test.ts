import { afterEach, beforeEach, expect, spyOn, test } from "bun:test";
import type { ActiveIdentity } from "@resora/auth/sr-access";
import type { Database } from "@resora/db";
import * as identity from "../identity/identity.public";
import {
	createEvaluationPeriod,
	listEvaluationPeriods,
	updateEvaluationPeriodConfig,
} from "./penilaian-periods.service";

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
const hcoAnggota: ActiveIdentity = {
	...hcoKadep,
	userId: "hco-anggota",
	positionCode: "ANGGOTA",
};
const regularSr: ActiveIdentity = {
	...hcoKadep,
	userId: "sr-regular",
	departmentCode: "RND",
	positionCode: "ANGGOTA",
};

let liveIdentity: ActiveIdentity = hcoKadep;
let liveSpy: ReturnType<typeof spyOn>;
let readSpy: ReturnType<typeof spyOn>;
let periodSpy: ReturnType<typeof spyOn>;

beforeEach(() => {
	liveIdentity = hcoKadep;
	liveSpy = spyOn(identity, "getLiveOperationalIdentity").mockImplementation(
		async () => liveIdentity,
	);
	readSpy = spyOn(identity, "readOperationalIdentity").mockImplementation(
		async () => liveIdentity,
	);
	periodSpy = spyOn(identity, "readSrPeriod").mockResolvedValue({
		id: "11111111-1111-4111-8111-111111111111",
		name: "SR 14",
		startsOn: "2026-08-01",
		endsOn: "2027-07-31",
	});
});

afterEach(() => {
	liveSpy.mockRestore();
	readSpy.mockRestore();
	periodSpy.mockRestore();
});

test("createEvaluationPeriod rejects non-KADEP HCO and creates audited period for KADEP HCO", async () => {
	const db = { transaction: async () => null } as unknown as Database;
	await expect(
		createEvaluationPeriod(db, hcoAnggota, {
			srPeriodId: "11111111-1111-4111-8111-111111111111",
			name: "Evaluasi Triwulan 1",
		}),
	).rejects.toMatchObject({ code: "FORBIDDEN" });

	const insertedAudits: Array<Record<string, unknown>> = [];
	const createdRow = {
		id: "22222222-2222-4222-8222-222222222222",
		srPeriodId: "11111111-1111-4111-8111-111111111111",
		name: "Evaluasi Triwulan 1",
		status: "OPEN",
		version: 1,
		isActive: true,
		sidakMaxPoints: 10,
		performanceThreshold: null,
	};
	const tx = {
		execute: async () => undefined,
		select: () => ({
			from: () => ({
				where: async () => [],
			}),
		}),
		update: () => ({
			set: () => ({
				where: async () => [],
			}),
		}),
		insert: () => ({
			values: (value: Record<string, unknown>) => {
				if ("entityType" in value) {
					insertedAudits.push(value);
					return Promise.resolve([value]);
				}
				return {
					returning: async () => [createdRow],
				};
			},
		}),
	};
	const okDb = {
		transaction: async (run: (t: typeof tx) => unknown) => run(tx),
	} as unknown as Database;

	const result = await createEvaluationPeriod(okDb, hcoKadep, {
		srPeriodId: "11111111-1111-4111-8111-111111111111",
		name: "Evaluasi Triwulan 1",
	});
	expect(result).toMatchObject({
		name: "Evaluasi Triwulan 1",
		performanceThreshold: null,
	});
	expect(insertedAudits).toHaveLength(1);
	expect(insertedAudits[0]).toMatchObject({
		entityType: "PERIOD",
		action: "PERIOD_CREATED",
		actorUserId: hcoKadep.userId,
	});
});

test("listEvaluationPeriods masks REVISING status for non-HCO/Inti actors", async () => {
	const rows = [
		{
			id: "p1",
			srPeriodId: "sr-1",
			name: "Triwulan 1",
			status: "REVISING",
			version: 2,
			isActive: true,
			schedules: {},
			sidakMaxPoints: 10,
			performanceThreshold: null,
			finalizedAt: null,
			createdAt: new Date(),
		},
	];
	const tx = {
		select: () => ({
			from: () => ({
				orderBy: async () => rows,
			}),
		}),
	};
	const db = {
		transaction: async (run: (t: typeof tx) => unknown) => run(tx),
	} as unknown as Database;

	liveIdentity = regularSr;
	const srView = await listEvaluationPeriods(db, regularSr);
	expect(srView[0]?.visibleStatus).toBe("BELUM_FINAL");
	expect(srView[0]?.isFinalized).toBe(false);

	liveIdentity = hcoKadep;
	const hcoView = await listEvaluationPeriods(db, hcoKadep);
	expect(hcoView[0]?.visibleStatus).toBe("REVISING");
});

test("updateEvaluationPeriodConfig blocks edits on FINAL periods", async () => {
	const tx = {
		execute: async () => undefined,
		select: () => ({
			from: () => ({
				where: () => ({
					for: async () => [
						{
							id: "22222222-2222-4222-8222-222222222222",
							name: "Triwulan 1",
							status: "FINAL",
							sidakMaxPoints: 10,
							performanceThreshold: null,
							schedules: {},
						},
					],
				}),
			}),
		}),
	};
	const db = {
		transaction: async (run: (t: typeof tx) => unknown) => run(tx),
	} as unknown as Database;

	await expect(
		updateEvaluationPeriodConfig(db, hcoKadep, {
			evaluationPeriodId: "22222222-2222-4222-8222-222222222222",
			performanceThreshold: 75,
			reason: "Ubah threshold",
		}),
	).rejects.toMatchObject({
		code: "CONFLICT",
		message: "EVALUATION_PERIOD_FINALIZED",
	});
});
