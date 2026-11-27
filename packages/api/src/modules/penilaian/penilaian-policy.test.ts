import { expect, test } from "bun:test";
import type { ActiveIdentity } from "@resora/auth/sr-access";
import {
	canApprovePointTransaction,
	canEvaluateDepartmentTarget,
	canManagePeriodGovernance,
	canManageRoutineEvaluation,
	canProposePointTransaction,
	canViewCommentsAndEvaluatorIdentity,
	canViewFinalAllMembers,
	canViewPreFinalResults,
} from "./penilaian-policy";

function makeSr(
	overrides: Partial<Extract<ActiveIdentity, { actor: "SR" }>> = {},
): Extract<ActiveIdentity, { actor: "SR" }> {
	return {
		userId: "sr-1",
		actor: "SR",
		nim: "1000000001",
		isActive: true,
		mustChangePassword: false,
		isSuperadmin: false,
		departmentCode: "RND",
		positionCode: "ANGGOTA",
		buildingId: "b-1",
		...overrides,
	};
}

const hcoKadep = makeSr({
	userId: "hco-kadep",
	departmentCode: "HCO",
	positionCode: "KADEP",
});
const hcoMember = makeSr({
	userId: "hco-member",
	departmentCode: "HCO",
	positionCode: "ANGGOTA",
});
const intiKetum = makeSr({
	userId: "inti-ketum",
	departmentCode: "INTI",
	positionCode: "KETUM",
});
const rndKadep = makeSr({
	userId: "rnd-kadep",
	departmentCode: "RND",
	positionCode: "KADEP",
});
const rndSekdep = makeSr({
	userId: "rnd-sekdep",
	departmentCode: "RND",
	positionCode: "SEKDEP",
});
const rndMember = makeSr({
	userId: "rnd-member",
	departmentCode: "RND",
	positionCode: "ANGGOTA",
});
const systemAdmin: ActiveIdentity = {
	userId: "sysadmin",
	actor: "SYSTEM_ADMIN",
	username: "sysadmin",
	isActive: true,
	mustChangePassword: false,
	isSuperadmin: true,
};

test("governance vs routine HCO capabilities follow D01", () => {
	expect(canManagePeriodGovernance(hcoKadep)).toBe(true);
	expect(canManagePeriodGovernance(systemAdmin)).toBe(true);
	expect(canManagePeriodGovernance(hcoMember)).toBe(false);
	expect(canManagePeriodGovernance(intiKetum)).toBe(false);
	expect(canManagePeriodGovernance(rndKadep)).toBe(false);

	expect(canManageRoutineEvaluation(hcoMember)).toBe(true);
	expect(canManageRoutineEvaluation(hcoKadep)).toBe(true);
	expect(canManageRoutineEvaluation(systemAdmin)).toBe(true);
	expect(canManageRoutineEvaluation(intiKetum)).toBe(false);
	expect(canManageRoutineEvaluation(rndKadep)).toBe(false);
});

test("pre-final, final, and comment visibility enforce privacy & D07", () => {
	expect(canViewPreFinalResults(hcoMember)).toBe(true);
	expect(canViewPreFinalResults(intiKetum)).toBe(true);
	expect(canViewPreFinalResults(systemAdmin)).toBe(true);
	expect(canViewPreFinalResults(rndKadep)).toBe(false);
	expect(canViewPreFinalResults(rndMember)).toBe(false);

	expect(canViewFinalAllMembers(rndKadep)).toBe(true);
	expect(canViewFinalAllMembers(rndSekdep)).toBe(false);
	expect(canViewFinalAllMembers(rndMember)).toBe(false);

	// FR-EVAL-036 / D07 confirmed: active HCO and SUPERADMIN view comments/raw identities; others cannot.
	expect(canViewCommentsAndEvaluatorIdentity(hcoMember)).toBe(true);
	expect(canViewCommentsAndEvaluatorIdentity(hcoKadep)).toBe(true);
	expect(canViewCommentsAndEvaluatorIdentity(systemAdmin)).toBe(true);
	expect(canViewCommentsAndEvaluatorIdentity(intiKetum)).toBe(false);
	expect(canViewCommentsAndEvaluatorIdentity(rndKadep)).toBe(false);
});

test("point transactions follow FR-EVAL-035 proposer and approver roles", () => {
	expect(canProposePointTransaction(rndKadep)).toBe(true);
	expect(canProposePointTransaction(hcoKadep)).toBe(true);
	expect(canProposePointTransaction(systemAdmin)).toBe(true);
	expect(canProposePointTransaction(rndSekdep)).toBe(false);
	expect(canProposePointTransaction(rndMember)).toBe(false);

	expect(canApprovePointTransaction(hcoMember)).toBe(true);
	expect(canApprovePointTransaction(intiKetum)).toBe(true);
	expect(canApprovePointTransaction(systemAdmin)).toBe(true);
	expect(canApprovePointTransaction(rndKadep)).toBe(false);
});

test("department evaluation matrix enforces D03 and FR-EVAL-032", () => {
	const rndTarget = {
		userId: "rnd-member",
		departmentCode: "RND",
		positionCode: "ANGGOTA",
	};
	const rndKadepTarget = {
		userId: "rnd-kadep",
		departmentCode: "RND",
		positionCode: "KADEP",
	};
	const hcoMemberTarget = {
		userId: "hco-member",
		departmentCode: "HCO",
		positionCode: "ANGGOTA",
	};
	const hcoKadepTarget = {
		userId: "hco-kadep",
		departmentCode: "HCO",
		positionCode: "KADEP",
	};
	const intiWaketumTarget = {
		userId: "inti-waketum",
		departmentCode: "INTI",
		positionCode: "WAKETUM",
	};

	// Regular member: own KADEP and KADEP HCO can evaluate; SEKDEP/ANGGOTA/other KADEP cannot.
	expect(canEvaluateDepartmentTarget(rndKadep, rndTarget)).toBe(true);
	expect(canEvaluateDepartmentTarget(hcoKadep, rndTarget)).toBe(true);
	expect(canEvaluateDepartmentTarget(rndSekdep, rndTarget)).toBe(false);
	expect(canEvaluateDepartmentTarget(hcoMember, rndTarget)).toBe(false);
	expect(
		canEvaluateDepartmentTarget(
			makeSr({
				userId: "adaptif-kadep",
				departmentCode: "ADAPTIF",
				positionCode: "KADEP",
			}),
			rndTarget,
		),
	).toBe(false);

	// HCO member: only KADEP HCO (not self, not non-KADEP HCO, not other KADEP).
	expect(canEvaluateDepartmentTarget(hcoKadep, hcoMemberTarget)).toBe(true);
	expect(canEvaluateDepartmentTarget(hcoMember, hcoMemberTarget)).toBe(false);
	expect(canEvaluateDepartmentTarget(rndKadep, hcoMemberTarget)).toBe(false);

	// KADEP (including KADEP HCO): assessed by INTI, never self or other KADEP.
	expect(canEvaluateDepartmentTarget(intiKetum, rndKadepTarget)).toBe(true);
	expect(canEvaluateDepartmentTarget(intiKetum, hcoKadepTarget)).toBe(true);
	expect(canEvaluateDepartmentTarget(rndKadep, rndKadepTarget)).toBe(false);
	expect(canEvaluateDepartmentTarget(hcoKadep, hcoKadepTarget)).toBe(false);

	// INTI: assessed by fellow INTI (non-self).
	expect(canEvaluateDepartmentTarget(intiKetum, intiWaketumTarget)).toBe(true);
	expect(
		canEvaluateDepartmentTarget(intiKetum, {
			userId: "inti-ketum",
			departmentCode: "INTI",
			positionCode: "KETUM",
		}),
	).toBe(false);
	expect(canEvaluateDepartmentTarget(systemAdmin, rndTarget)).toBe(false);
});
