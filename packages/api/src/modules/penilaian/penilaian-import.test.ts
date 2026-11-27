import { afterEach, beforeEach, expect, spyOn, test } from "bun:test";
import type { ActiveIdentity } from "@resora/auth/sr-access";
import type { Database } from "@resora/db";
import * as identityPublic from "../identity/identity.public";
import { parseGformCsv } from "./penilaian.contracts";
import {
	confirmGformImport,
	listGformImports,
	previewGformImport,
} from "./penilaian-import.service";

const periodId = "11111111-1111-4111-8111-111111111111";

const hcoMember: ActiveIdentity = {
	userId: "hco-member",
	actor: "SR",
	nim: "1000000001",
	isActive: true,
	mustChangePassword: false,
	isSuperadmin: false,
	departmentCode: "HCO",
	positionCode: "ANGGOTA",
	buildingId: "b-1",
};
const superAdmin: ActiveIdentity = {
	userId: "sysadmin",
	actor: "SYSTEM_ADMIN",
	username: "sysadmin",
	isActive: true,
	mustChangePassword: false,
	isSuperadmin: true,
};
const regularSr: ActiveIdentity = {
	...hcoMember,
	userId: "sr-1",
	nim: "2000000001",
	departmentCode: "RND",
};

const roster = [
	{
		userId: "sr-target-1",
		nim: "2000000001",
		name: "Target SR 1",
		isActive: true,
		currentDepartmentCode: "RND",
		currentDepartmentName: "RnD",
		currentPositionCode: "ANGGOTA",
		currentBuildingCode: "A",
		currentBuildingName: "Gedung A",
	},
	{
		userId: "sr-target-2",
		nim: "2000000002",
		name: "Target SR 2",
		isActive: true,
		currentDepartmentCode: "ADAPTIF",
		currentDepartmentName: "Adaptif",
		currentPositionCode: "ANGGOTA",
		currentBuildingCode: "B",
		currentBuildingName: "Gedung B",
	},
];

let liveIdentity: ActiveIdentity = hcoMember;
let liveSpy: ReturnType<typeof spyOn>;
let readSpy: ReturnType<typeof spyOn>;
let rosterSpy: ReturnType<typeof spyOn>;

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
	).mockResolvedValue(roster);
});

afterEach(() => {
	liveSpy.mockRestore();
	readSpy.mockRestore();
	rosterSpy.mockRestore();
});

test("parseGformCsv parses 20-question SR/Maba and 10-question external CSVs", () => {
	const header20 = `respondent_id,respondent_role,target_nim,building_code,${Array.from({ length: 20 }, (_, i) => `q${i + 1}`).join(",")},comment`;
	const row20 = `maba-01,MABA,2000000001,A,${Array(20).fill("4").join(",")},"Bagus di gedung"`;
	const parsed20 = parseGformCsv(`${header20}\n${row20}`, "SR_MABA");
	expect(parsed20).toHaveLength(1);
	expect(parsed20[0]?.answers).toHaveLength(20);
	expect(parsed20[0]?.comment).toBe("Bagus di gedung");

	const header10 = `respondent_id,respondent_role,target_nim,${Array.from({ length: 10 }, (_, i) => `q${i + 1}`).join(",")}`;
	const row10 = `asus-1,ASUS,2000000001,${Array(10).fill("5").join(",")}`;
	const parsed10 = parseGformCsv(
		`${header10}\n${row10}`,
		"EXTERNAL_ASUS_DITMAWA",
	);
	expect(parsed10).toHaveLength(1);
	expect(parsed10[0]?.answers).toHaveLength(10);
});

test("previewGformImport detects invalid building, self-eval, incomplete answers, and duplicates", async () => {
	const db = {
		transaction: async (run: (tx: unknown) => unknown) =>
			run({
				select: () => ({
					from: () => ({
						where: () => [
							{ id: periodId, srPeriodId: "sr-p1", status: "OPEN" },
						],
					}),
				}),
			}),
	} as unknown as Database;

	// Use one tx select returning period first, then existing responses.
	let call = 0;
	const tx = {
		select: () => ({
			from: () => ({
				where: async () => {
					call++;
					if (call === 1)
						return [{ id: periodId, srPeriodId: "sr-p1", status: "OPEN" }];
					return [
						{ respondentKey: "maba-existing", targetUserId: "sr-target-1" },
					];
				},
			}),
		}),
	};
	const previewDb = {
		transaction: async (run: (t: typeof tx) => unknown) => run(tx),
	} as unknown as Database;
	void db;

	const preview = await previewGformImport(previewDb, hcoMember, {
		evaluationPeriodId: periodId,
		sourceType: "SR_MABA",
		cycleNumber: 1,
		sourceReference: "gform-tw1.csv",
		rows: [
			{
				rowNumber: 2,
				respondentKey: "maba-valid",
				respondentRole: "MABA",
				targetNim: "2000000001",
				buildingCode: "A",
				answers: Array(20).fill(4),
				comment: "Sangat membantu",
			},
			{
				rowNumber: 3,
				respondentKey: "maba-wrong-bldg",
				respondentRole: "MABA",
				targetNim: "2000000001",
				buildingCode: "B",
				answers: Array(20).fill(5),
			},
			{
				rowNumber: 4,
				respondentKey: "2000000001",
				respondentRole: "SR",
				targetNim: "2000000001",
				buildingCode: "A",
				answers: Array(20).fill(5),
			},
			{
				rowNumber: 5,
				respondentKey: "maba-incomplete",
				respondentRole: "MABA",
				targetNim: "2000000001",
				buildingCode: "A",
				answers: Array(19).fill(4),
			},
			{
				rowNumber: 6,
				respondentKey: "maba-existing",
				respondentRole: "MABA",
				targetNim: "2000000001",
				buildingCode: "A",
				answers: Array(20).fill(4),
			},
		],
	});

	expect(preview.validCount).toBe(1);
	expect(preview.invalidCount).toBe(3);
	expect(preview.duplicateCount).toBe(1);
	expect(preview.canCommit).toBe(false);
	expect(preview.rows[0]?.totalScore).toBe(80);
});

test("confirmGformImport blocks non-HCO, rejects partial invalid imports, and saves valid batch atomically", async () => {
	const deniedDb = { transaction: async () => null } as unknown as Database;
	await expect(
		confirmGformImport(deniedDb, regularSr, {
			evaluationPeriodId: periodId,
			sourceType: "EXTERNAL_ASUS_DITMAWA",
			cycleNumber: 1,
			sourceReference: "ext.csv",
			rows: [
				{
					rowNumber: 2,
					respondentKey: "asus-1",
					respondentRole: "ASUS",
					targetNim: "2000000001",
					answers: Array(10).fill(4),
				},
			],
		}),
	).rejects.toMatchObject({ code: "FORBIDDEN" });

	let call = 0;
	const insertedRows: Array<unknown> = [];
	const tx = {
		select: () => ({
			from: () => ({
				where: (/* cond */) => {
					call++;
					if (call === 1) {
						return {
							for: async () => [
								{ id: periodId, srPeriodId: "sr-p1", status: "OPEN" },
							],
						};
					}
					return Promise.resolve([]);
				},
			}),
		}),
		insert: () => ({
			values: async (val: unknown) => {
				insertedRows.push(val);
				return [];
			},
		}),
	};
	const okDb = {
		transaction: async (run: (t: typeof tx) => unknown) => run(tx),
	} as unknown as Database;

	const result = await confirmGformImport(okDb, hcoMember, {
		evaluationPeriodId: periodId,
		sourceType: "EXTERNAL_ASUS_DITMAWA",
		cycleNumber: 1,
		sourceReference: "ext-tw1.csv",
		rows: [
			{
				rowNumber: 2,
				respondentKey: "ditmawa-1",
				respondentRole: "DITMAWA",
				targetNim: "2000000001",
				answers: [4, 4, 4, 4, 4, 4, 5, 5, 4, 4],
			},
		],
	});
	expect(result.insertedCount).toBe(1);
	expect(insertedRows).toHaveLength(2);
});

test("listGformImports redacts respondentKey and comment for SUPERADMIN (D07)", async () => {
	const tx = {
		select: () => ({
			from: () => ({
				where: () => ({
					orderBy: async () => [
						{
							id: "resp-1",
							sourceType: "SR_MABA",
							cycleNumber: 1,
							sourceReference: "gform.csv",
							respondentKey: "maba-secret-nim",
							respondentRole: "MABA",
							targetUserId: "sr-target-1",
							buildingCode: "A",
							totalScore: 85,
							comment: "Komentar privat",
							importedAt: new Date(),
						},
					],
				}),
			}),
		}),
	};
	const db = {
		transaction: async (run: (t: typeof tx) => unknown) => run(tx),
	} as unknown as Database;

	liveIdentity = superAdmin;
	const adminRows = await listGformImports(db, superAdmin, {
		evaluationPeriodId: periodId,
	});
	expect(adminRows[0]?.respondentKey).toBeNull();
	expect(adminRows[0]?.comment).toBeNull();

	liveIdentity = hcoMember;
	const hcoRows = await listGformImports(db, hcoMember, {
		evaluationPeriodId: periodId,
	});
	expect(hcoRows[0]?.respondentKey).toBe("maba-secret-nim");
	expect(hcoRows[0]?.comment).toBe("Komentar privat");
});
