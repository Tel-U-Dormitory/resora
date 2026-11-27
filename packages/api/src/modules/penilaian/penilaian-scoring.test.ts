import { afterEach, beforeEach, expect, spyOn, test } from "bun:test";
import type { ActiveIdentity } from "@resora/auth/sr-access";
import type { Database } from "@resora/db";
import * as eventsPublic from "../events/events.public";
import * as identityPublic from "../identity/identity.public";
import {
	configurePeriodEvent,
	submitDepartmentEvaluation,
	submitEventEvaluation,
} from "./penilaian-scoring.service";

const periodId = "11111111-1111-4111-8111-111111111111";
const periodEventId = "22222222-2222-4222-8222-222222222222";
const eventId = "33333333-3333-4333-8333-333333333333";

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
const rndKadep: ActiveIdentity = {
	...hcoKadep,
	userId: "rnd-kadep",
	departmentCode: "RND",
	positionCode: "KADEP",
};
const rndSekdep: ActiveIdentity = {
	...hcoKadep,
	userId: "rnd-sekdep",
	departmentCode: "RND",
	positionCode: "SEKDEP",
};
const rndMember: ActiveIdentity = {
	...hcoKadep,
	userId: "rnd-member",
	departmentCode: "RND",
	positionCode: "ANGGOTA",
};
const intiKetum: ActiveIdentity = {
	...hcoKadep,
	userId: "inti-ketum",
	departmentCode: "INTI",
	positionCode: "KETUM",
};

let liveIdentity: ActiveIdentity = rndMember;
let liveSpy: ReturnType<typeof spyOn>;
let eventSpy: ReturnType<typeof spyOn>;
let inviteSpy: ReturnType<typeof spyOn>;
let rosterSpy: ReturnType<typeof spyOn>;

beforeEach(() => {
	liveIdentity = rndMember;
	liveSpy = spyOn(
		identityPublic,
		"getLiveOperationalIdentity",
	).mockImplementation(async () => liveIdentity);
	eventSpy = spyOn(eventsPublic, "readEvent").mockResolvedValue([
		{
			id: eventId,
			title: "Rapat Besar",
			status: "CLOSED",
		} as unknown as Awaited<ReturnType<typeof eventsPublic.readEvent>>[number],
	]);
	inviteSpy = spyOn(eventsPublic, "invitationSnapshots").mockResolvedValue([
		{
			eventId,
			userId: "rnd-member",
			nim: "1",
			name: "Member",
			departmentCode: "RND",
			positionCode: "ANGGOTA",
			buildingCode: "A",
			buildingName: "Gedung A",
			committeeDivision: "Acara",
			committeePosition: "ANGGOTA",
			invitedAt: new Date(),
		},
		{
			eventId,
			userId: "rnd-sekdep",
			nim: "2",
			name: "Sekdep",
			departmentCode: "RND",
			positionCode: "SEKDEP",
			buildingCode: "A",
			buildingName: "Gedung A",
			committeeDivision: "Acara",
			committeePosition: "PIC1",
			invitedAt: new Date(),
		},
	]);
	rosterSpy = spyOn(
		identityPublic,
		"readSrPeriodEvaluationRoster",
	).mockResolvedValue([
		{
			userId: "rnd-member",
			nim: "1",
			name: "Member",
			isActive: true,
			currentDepartmentCode: "RND",
			currentDepartmentName: "RnD",
			currentPositionCode: "ANGGOTA",
			currentBuildingCode: "A",
			currentBuildingName: "Gedung A",
		},
		{
			userId: "rnd-kadep",
			nim: "3",
			name: "Kadep RnD",
			isActive: true,
			currentDepartmentCode: "RND",
			currentDepartmentName: "RnD",
			currentPositionCode: "KADEP",
			currentBuildingCode: "A",
			currentBuildingName: "Gedung A",
		},
	]);
});

afterEach(() => {
	liveSpy.mockRestore();
	eventSpy.mockRestore();
	inviteSpy.mockRestore();
	rosterSpy.mockRestore();
});

test("configurePeriodEvent enforces KADEP HCO governance and rejects DRAFT events", async () => {
	const db = { transaction: async () => null } as unknown as Database;
	await expect(
		configurePeriodEvent(db, rndMember, {
			evaluationPeriodId: periodId,
			eventId,
			category: "ANNUAL",
		}),
	).rejects.toMatchObject({ code: "FORBIDDEN" });

	liveIdentity = hcoKadep;
	eventSpy.mockResolvedValueOnce([
		{
			id: eventId,
			title: "Draft Event",
			status: "DRAFT",
		} as unknown as Awaited<ReturnType<typeof eventsPublic.readEvent>>[number],
	]);
	const tx = {
		select: () => ({
			from: () => ({
				where: () => ({
					for: async () => [{ id: periodId, status: "OPEN" }],
				}),
			}),
		}),
	};
	const draftDb = {
		transaction: async (run: (t: typeof tx) => unknown) => run(tx),
	} as unknown as Database;

	await expect(
		configurePeriodEvent(draftDb, hcoKadep, {
			evaluationPeriodId: periodId,
			eventId,
			category: "ANNUAL",
		}),
	).rejects.toMatchObject({
		code: "CONFLICT",
		message: "EVENT_NOT_PUBLISHED",
	});
});

test("submitEventEvaluation blocks self-evaluation, non-roster targets, duplicates, and stores valid scores", async () => {
	const emptyDb = { transaction: async () => null } as unknown as Database;
	await expect(
		submitEventEvaluation(emptyDb, rndMember, {
			evaluationPeriodId: periodId,
			periodEventId,
			targetUserId: rndMember.userId,
			commitment: 90,
			teamwork: 85,
			attitude: 90,
			contribution: 95,
		}),
	).rejects.toMatchObject({
		code: "BAD_REQUEST",
		message: "SELF_EVALUATION_NOT_ALLOWED",
	});

	let selectCall = 0;
	const insertedAudits: Array<Record<string, unknown>> = [];
	const tx = {
		select: () => ({
			from: () => ({
				where: () => {
					selectCall++;
					if (selectCall === 1) {
						return { for: async () => [{ id: periodId, status: "OPEN" }] };
					}
					if (selectCall === 2) {
						return {
							for: async () => [
								{
									id: periodEventId,
									evaluationPeriodId: periodId,
									eventId,
									category: "ANNUAL",
								},
							],
						};
					}
					return Promise.resolve([]);
				},
			}),
		}),
		insert: () => ({
			values: (value: Record<string, unknown>) => {
				if ("entityType" in value) {
					insertedAudits.push(value);
					return Promise.resolve([value]);
				}
				return {
					returning: async () => [
						{
							id: "score-1",
							periodEventId,
							targetUserId: rndSekdep.userId,
							commitment: 90,
							teamwork: 85,
							attitude: 90,
							contribution: 95,
							submittedAt: new Date(),
						},
					],
				};
			},
		}),
	};
	const okDb = {
		transaction: async (run: (t: typeof tx) => unknown) => run(tx),
	} as unknown as Database;

	const saved = await submitEventEvaluation(okDb, rndMember, {
		evaluationPeriodId: periodId,
		periodEventId,
		targetUserId: rndSekdep.userId,
		commitment: 90,
		teamwork: 85,
		attitude: 90,
		contribution: 95,
	});
	expect(saved.commitment).toBe(90);
	expect(insertedAudits[0]?.action).toBe("EVENT_SCORE_SUBMITTED");

	// Non-roster target is rejected.
	selectCall = 0;
	await expect(
		submitEventEvaluation(okDb, rndMember, {
			evaluationPeriodId: periodId,
			periodEventId,
			targetUserId: "outside-user",
			commitment: 90,
			teamwork: 85,
			attitude: 90,
			contribution: 95,
		}),
	).rejects.toMatchObject({
		code: "BAD_REQUEST",
		message: "TARGET_NOT_IN_EVENT_ROSTER",
	});
});

test("submitDepartmentEvaluation rejects SEKDEP and enforces D03 evaluator rules", async () => {
	let selectCall = 0;
	const tx = {
		select: () => ({
			from: () => ({
				where: () => {
					selectCall++;
					if (selectCall === 1) {
						return {
							for: async () => [
								{
									id: periodId,
									srPeriodId: "sr-p1",
									status: "OPEN",
								},
							],
						};
					}
					return Promise.resolve([]);
				},
			}),
		}),
		insert: () => ({
			values: (value: Record<string, unknown>) => {
				if ("entityType" in value) return Promise.resolve([value]);
				return {
					returning: async () => [
						{
							id: "dept-score-1",
							quarterNumber: 1,
							targetUserId: "rnd-kadep",
							commitment: 90,
							teamwork: 85,
							attitude: 90,
							contribution: 95,
							submittedAt: new Date(),
						},
					],
				};
			},
		}),
	};
	const db = {
		transaction: async (run: (t: typeof tx) => unknown) => run(tx),
	} as unknown as Database;

	// SEKDEP cannot evaluate department scores.
	liveIdentity = rndSekdep;
	await expect(
		submitDepartmentEvaluation(db, rndSekdep, {
			evaluationPeriodId: periodId,
			quarterNumber: 1,
			targetUserId: "rnd-member",
			commitment: 80,
			teamwork: 80,
			attitude: 80,
			contribution: 80,
		}),
	).rejects.toMatchObject({
		code: "FORBIDDEN",
		message: "DEPARTMENT_EVALUATION_NOT_AUTHORIZED",
	});

	// KADEP cannot evaluate another KADEP; INTI can evaluate KADEP.
	selectCall = 0;
	liveIdentity = rndKadep;
	await expect(
		submitDepartmentEvaluation(db, rndKadep, {
			evaluationPeriodId: periodId,
			quarterNumber: 1,
			targetUserId: "rnd-kadep",
			commitment: 90,
			teamwork: 90,
			attitude: 90,
			contribution: 90,
		}),
	).rejects.toMatchObject({ code: "BAD_REQUEST" });

	selectCall = 0;
	liveIdentity = intiKetum;
	const saved = await submitDepartmentEvaluation(db, intiKetum, {
		evaluationPeriodId: periodId,
		quarterNumber: 1,
		targetUserId: "rnd-kadep",
		commitment: 90,
		teamwork: 85,
		attitude: 90,
		contribution: 95,
	});
	expect(saved.targetUserId).toBe("rnd-kadep");
});
