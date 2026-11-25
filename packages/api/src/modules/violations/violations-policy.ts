import type { ActiveIdentity } from "@resora/auth/sr-access";
import {
	canAccessPersonalSr,
	hasSuperadminPrivilege,
} from "../identity/identity.public";

type Identity = ActiveIdentity | null | undefined;

// Call with Identity's live operational recheck, not a stale request identity.
export function canReadViolations(identity: Identity) {
	return canAccessPersonalSr(identity) || hasSuperadminPrivilege(identity);
}

// Called only after Identity's live operational recheck.
export function canCreateViolation(identity: Identity) {
	return canAccessPersonalSr(identity) || hasSuperadminPrivilege(identity);
}

export function canSelectViolationBuilding(identity: Identity) {
	return hasSuperadminPrivilege(identity);
}

// Only an SR reporter owns a report; non-superadmin SYSTEM_ADMIN cannot mutate it.
export function canMutateViolation(identity: Identity, reporterUserId: string) {
	return (
		hasSuperadminPrivilege(identity) ||
		(canAccessPersonalSr(identity) && identity.userId === reporterUserId)
	);
}
