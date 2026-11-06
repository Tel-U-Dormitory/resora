import type { ActiveIdentity } from "@resora/auth/sr-access";
import type { Database } from "@resora/db";
import { TRPCError } from "@trpc/server";

import {
	type DeleteDraftInput,
	deleteDraftSchema,
	type EventVisibilityInput,
	eventVisibilitySchema,
} from "../../contracts/attendance";

import * as attendanceOperations from "../../modules/attendance/attendance.public";

import * as eventOperations from "../../modules/events/events.public";
import { visibilityActions } from "../../modules/events/events.public";
import { hasSuperadminPrivilege } from "../../modules/identity/identity.public";
import { draftDeletionBlocker, lockedEvent } from "./context";

export async function setEventVisibility(
	db: Database,
	identity: ActiveIdentity,
	input: EventVisibilityInput,
) {
	if (!hasSuperadminPrivilege(identity))
		throw new TRPCError({ code: "FORBIDDEN" });
	const parsed = eventVisibilitySchema.safeParse(input);
	if (!parsed.success)
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Invalid visibility request",
		});
	const data = parsed.data;
	return db.transaction(async (tx) => {
		const { event, session } = await lockedEvent(
			tx,
			data.eventId,
			identity,
			true,
		);
		if (!visibilityActions(event, session).includes(data.action))
			throw new TRPCError({
				code: "CONFLICT",
				message: "EVENT_VISIBILITY_CONFLICT",
			});
		const changes = {
			HIDE: { visibility: "HIDDEN", action: "EVENT_HIDDEN" },
			UNHIDE: { visibility: "VISIBLE", action: "EVENT_UNHIDDEN" },
			ARCHIVE: { visibility: "ARCHIVED", action: "EVENT_ARCHIVED" },
			RESTORE: { visibility: "VISIBLE", action: "EVENT_RESTORED" },
		} as const;
		const change = changes[data.action];
		const previousVisibility = event.visibility;
		await eventOperations.changeVisibility(tx, event.id, change.visibility);
		await eventOperations.appendEventAudit(tx, {
			eventId: event.id,
			actorUserId: identity.userId,
			action: change.action,
			reason: data.reason,
			beforeState: { visibility: previousVisibility },
			afterState: { visibility: change.visibility },
		});
		return { visibility: change.visibility };
	});
}

export async function deleteEventDraft(
	db: Database,
	identity: ActiveIdentity,
	input: DeleteDraftInput,
) {
	if (!hasSuperadminPrivilege(identity))
		throw new TRPCError({ code: "FORBIDDEN" });
	const parsed = deleteDraftSchema.safeParse(input);
	if (!parsed.success)
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Invalid deletion request",
		});
	const data = parsed.data;
	try {
		return await db.transaction(async (tx) => {
			const { event, session } = await lockedEvent(
				tx,
				data.eventId,
				identity,
				true,
			);
			if (await draftDeletionBlocker(tx, event, session))
				throw new TRPCError({
					code: "CONFLICT",
					message: "DRAFT_DELETE_NOT_ALLOWED",
				});
			// The inverse session constraint is deferred: once BOTH rows are gone,
			// it finds no parent at commit. No cascade or trigger bypass is needed.
			const [deletedSession] = await attendanceOperations.deleteUnusedSession(
				tx,
				session.id,
			);
			const [deletedEvent] = await eventOperations.deleteUnusedDraft(
				tx,
				event.id,
			);
			if (!deletedSession || !deletedEvent)
				throw new TRPCError({
					code: "CONFLICT",
					message: "DRAFT_DELETE_NOT_ALLOWED",
				});
			await eventOperations.recordDraftDeletion(
				tx,
				event,
				identity.userId,
				data.reason,
			);
			return { eventId: event.id };
		});
	} catch (error) {
		const cause =
			error instanceof Error && "cause" in error ? error.cause : error;
		if (
			cause &&
			typeof cause === "object" &&
			"code" in cause &&
			["23503", "23514", "23505"].includes(String(cause.code))
		)
			throw new TRPCError({
				code: "CONFLICT",
				message: "DRAFT_DELETE_NOT_ALLOWED",
			});
		throw error;
	}
}
