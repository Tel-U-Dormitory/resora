import type { ActiveIdentity } from "@resora/auth/sr-access";
import type { Database } from "@resora/db";
import { TRPCError } from "@trpc/server";
import {
	type SetScoringModeInput,
	setScoringModeSchema,
} from "../../contracts/attendance";
import {
	appendEventAudit,
	changeAttendanceScoringMode,
} from "../../modules/events/events.public";
import { canManageEventScoring } from "../../modules/identity/identity.public";
import { lockedEvent } from "./context";

export async function setScoringMode(
	db: Database,
	identity: ActiveIdentity,
	input: SetScoringModeInput,
) {
	if (!canManageEventScoring(identity))
		throw new TRPCError({ code: "FORBIDDEN" });
	const parsed = setScoringModeSchema.safeParse(input);
	if (!parsed.success)
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "SCORING_MODE_INPUT_INVALID",
		});
	const data = parsed.data;
	return db.transaction(async (tx) => {
		const { event, identity: live } = await lockedEvent(
			tx,
			data.eventId,
			identity,
		);
		if (!canManageEventScoring(live))
			throw new TRPCError({ code: "FORBIDDEN" });
		if (event.status !== "PUBLISHED" && event.status !== "CLOSED")
			throw new TRPCError({
				code: "CONFLICT",
				message: "SCORING_MODE_REQUIRES_PUBLISHED_EVENT",
			});
		if (event.attendanceScoringMode === data.scoringMode)
			return { scoringMode: data.scoringMode, changed: false };
		const previousMode = event.attendanceScoringMode;
		await changeAttendanceScoringMode(tx, event.id, data.scoringMode);
		await appendEventAudit(tx, {
			eventId: event.id,
			actorUserId: identity.userId,
			action: "ATTENDANCE_SCORING_MODE_CHANGED",
			reason: `Klasifikasi penilaian kehadiran diubah dari ${previousMode ?? "Belum diklasifikasikan"} menjadi ${data.scoringMode}.`,
			beforeState: { attendanceScoringMode: previousMode },
			afterState: { attendanceScoringMode: data.scoringMode },
		});
		return { scoringMode: data.scoringMode, changed: true };
	});
}
