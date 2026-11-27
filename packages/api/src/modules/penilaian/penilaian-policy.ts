import type {
	ActiveIdentity,
	ActiveSrIdentity,
} from "../identity/identity.public";
import {
	canAccessPersonalSr,
	hasSuperadminPrivilege,
	isValidSrAssignment,
} from "../identity/identity.public";

type Identity = ActiveIdentity | null | undefined;

function hasValidSr(identity: Identity): identity is ActiveSrIdentity {
	return (
		canAccessPersonalSr(identity) &&
		isValidSrAssignment(identity.departmentCode, identity.positionCode)
	);
}

export function isActiveValidSr(
	identity: Identity,
): identity is ActiveSrIdentity {
	return hasValidSr(identity);
}

export function isActiveHcoMember(
	identity: Identity,
): identity is ActiveSrIdentity {
	return hasValidSr(identity) && identity.departmentCode === "HCO";
}

export function isKadepHco(identity: Identity) {
	return isActiveHcoMember(identity) && identity.positionCode === "KADEP";
}

export function isIntiMember(identity: Identity) {
	return hasValidSr(identity) && identity.departmentCode === "INTI";
}

export function isStructuralKadep(identity: Identity) {
	return hasValidSr(identity) && identity.positionCode === "KADEP";
}

// D01: Period governance, threshold, correction, finalization, and revision opening.
export function canManagePeriodGovernance(identity: Identity) {
	return hasSuperadminPrivilege(identity) || isKadepHco(identity);
}

// D01: Routine HCO operations (view pre-final, GForm imports, attendance fallback).
export function canManageRoutineEvaluation(identity: Identity) {
	return hasSuperadminPrivilege(identity) || isActiveHcoMember(identity);
}

// FR-EVAL-002/011/037: Pre-final results are visible only to HCO, Inti, and SUPERADMIN.
export function canViewPreFinalResults(identity: Identity) {
	return (
		hasSuperadminPrivilege(identity) ||
		isActiveHcoMember(identity) ||
		isIntiMember(identity)
	);
}

// FR-EVAL-026/030: All-SR final detail access includes KADEP after FINAL.
export function canViewFinalAllMembers(identity: Identity) {
	return canViewPreFinalResults(identity) || isStructuralKadep(identity);
}

// FR-EVAL-030/033/036 (D07): Raw respondent/evaluator identity and comments are
// restricted to active HCO members and SUPERADMIN (PM decision 2026-11-27).
export function canViewCommentsAndEvaluatorIdentity(identity: Identity) {
	return hasSuperadminPrivilege(identity) || isActiveHcoMember(identity);
}

// FR-EVAL-035: KADEP (including KADEP HCO) and SUPERADMIN propose point transactions.
export function canProposePointTransaction(identity: Identity) {
	return hasSuperadminPrivilege(identity) || isStructuralKadep(identity);
}

// FR-EVAL-035: HCO and Inti verify/approve point transactions (+ SUPERADMIN).
export function canApprovePointTransaction(identity: Identity) {
	return (
		hasSuperadminPrivilege(identity) ||
		isActiveHcoMember(identity) ||
		isIntiMember(identity)
	);
}

// FR-EVAL-021/027: Any active SR or authorized viewer can read/export within their scope.
export function canReadPenilaianModule(identity: Identity) {
	return hasSuperadminPrivilege(identity) || hasValidSr(identity);
}

// D03 + FR-EVAL-032: Department evaluation (25%) authorization.
// - Non-KADEP, non-INTI members (SEKDEP/ANGGOTA): assessed by their department's KADEP
//   (so HCO members are assessed by KADEP HCO), with KADEP HCO also permitted as pengelola
//   for non-HCO members if needed.
// - KADEP (including KADEP HCO): assessed by INTI.
// - INTI members: assessed by fellow INTI (non-self).
// - SEKDEP and ANGGOTA never evaluate department scores.
export function canEvaluateDepartmentTarget(
	evaluator: Identity,
	target: {
		userId: string;
		departmentCode: string;
		positionCode: string;
	},
) {
	if (!hasValidSr(evaluator)) return false;
	if (evaluator.userId === target.userId) return false;

	if (target.departmentCode === "INTI") {
		return isIntiMember(evaluator);
	}
	if (target.positionCode === "KADEP") {
		return isIntiMember(evaluator);
	}
	if (target.departmentCode === "HCO") {
		return isKadepHco(evaluator);
	}
	return (
		(isStructuralKadep(evaluator) &&
			evaluator.departmentCode === target.departmentCode) ||
		isKadepHco(evaluator)
	);
}
