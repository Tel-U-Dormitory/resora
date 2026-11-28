import {
	type ActiveDtIdentity,
	type ActiveIdentity,
	canAccessPersonalDt,
	canManageDt,
} from "../identity/identity.public";

export function authorizeDtManager(
	identity: ActiveIdentity | null | undefined,
) {
	return canManageDt(identity);
}

export function authorizeDtPersonal(
	identity: ActiveIdentity | null | undefined,
): identity is ActiveDtIdentity {
	return canAccessPersonalDt(identity);
}
