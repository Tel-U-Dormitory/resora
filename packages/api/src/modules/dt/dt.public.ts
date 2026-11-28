import type { Database, DatabaseTransaction } from "@resora/db";
import { type ActiveDtCandidate, readActiveDtDirectory } from "./dt.service";

export type { ActiveDtCandidate, EnrichedDtMembership } from "./dt.service";
export {
	activateDtMembership,
	archiveDtMembership,
	endDtMembership,
	extendDtPeriod,
	getAllDtUserIds,
	getDtMembershipCore,
	getDtReferences,
	getLatestDtMembershipsByUserIds,
	getOwnDtMembershipRecords,
	listDtMembers,
	registerDtCandidate,
	rejectDtCandidate,
	resetDtPassword,
	syncAdminDtBuildingAssignment,
	updateDtAssignment,
} from "./dt.service";
export { authorizeDtManager, authorizeDtPersonal } from "./dt-policy";

export async function getActiveDtDirectory(
	db: Database | DatabaseTransaction,
	lock = false,
): Promise<ActiveDtCandidate[]> {
	return readActiveDtDirectory(db, lock);
}

export async function getActiveDtCandidate(
	db: Database | DatabaseTransaction,
	userId: string,
): Promise<ActiveDtCandidate | null> {
	const rows = await readActiveDtDirectory(db, true, userId);
	return rows[0] ?? null;
}
