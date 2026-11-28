"use client";

import { DtManagerWorkspace } from "./dt-manager-workspace";
import { DtPortalWorkspace } from "./dt-portal-workspace";

export function DtWorkspace({
	canManageDt,
	isDtMember,
}: {
	canManageDt: boolean;
	isDtMember: boolean;
}) {
	if (canManageDt) {
		return <DtManagerWorkspace />;
	}
	if (isDtMember) {
		return <DtPortalWorkspace />;
	}
	return null;
}
