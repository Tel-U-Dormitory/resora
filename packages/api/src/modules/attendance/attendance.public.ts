// Trusted server lifecycle operations. Caller holds Event locks before Session
// locks and revalidates live Identity before writes; reuse the SAME transaction.

export { checkIn } from "./check-in/check-in";
export { signChallenge, verifySessionChallenge } from "./check-in/qr";
export { manualCorrect, manualInsert } from "./manual-attendance";
export { auditHistory, exportCsv, ownHistory, recap } from "./reporting";
export type { SessionFact } from "./session-operations";
export {
	activateInternalSession,
	closeInternalSession,
	configureInternalSession,
	configureSession,
	createInternalSession,
	currentChallenge,
	deleteUnusedSession,
	invalidateSessionChallenges,
	issueSessionChallenge,
	lockInternalSession,
	readInternalSession,
	recordExistsForSession,
	retireSessionChallenge,
	revokeSessionChallenge,
	sessionHasDeletionReferences,
} from "./session-operations";
