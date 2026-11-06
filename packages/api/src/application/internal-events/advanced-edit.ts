import type { ActiveIdentity } from "@resora/auth/sr-access";
import type { Database } from "@resora/db";
import { TRPCError } from "@trpc/server";

import {
	type AdvancedEventEdit,
	advancedEventEditSchema,
} from "../../contracts/attendance";

import * as attendanceOperations from "../../modules/attendance/attendance.public";

import type { EventEditAuditState } from "../../modules/events/events.public";
import * as eventOperations from "../../modules/events/events.public";
import {
	resolveCommitteeRoster,
	resolveRoster,
	sameRoster,
} from "../../modules/events/events.public";
import {
	getActiveSrDirectory,
	hasSuperadminPrivilege,
} from "../../modules/identity/identity.public";
import {
	advancedEditMode,
	lockedEvent,
	lockedRosterEvent,
	sessionConfiguration,
} from "./context";

export async function advancedEditEvent(
	db: Database,
	identity: ActiveIdentity,
	input: AdvancedEventEdit,
) {
	if (!hasSuperadminPrivilege(identity))
		throw new TRPCError({ code: "FORBIDDEN" });
	const parsed = advancedEventEditSchema.safeParse(input);
	if (!parsed.success)
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Invalid advanced event edit",
		});
	const data = parsed.data;
	return db.transaction(async (tx) => {
		const locked =
			data.mode === "FULL"
				? await lockedRosterEvent(
						tx,
						data.eventId,
						identity,
						data.draft.committeeId,
						true,
					)
				: {
						...(await lockedEvent(tx, data.eventId, identity, true)),
						committee: undefined,
					};
		const { event, session, committee } = locked;
		const mode = await advancedEditMode(tx, event, session);
		if (!mode || (data.mode === "FULL" && mode !== "FULL"))
			throw new TRPCError({
				code: "CONFLICT",
				message: "ADVANCED_EDIT_STATE_CHANGED",
			});
		const before: EventEditAuditState = {
			title: event.title,
			description: event.description,
			startsAt: event.startsAt.toISOString(),
			endsAt: event.endsAt.toISOString(),
		};
		const after: EventEditAuditState = { ...before };
		if (data.mode === "FULL") {
			const draft = data.draft;
			if (
				(draft.organizationContext ?? "SR") !==
					(event.organizationContext ?? "SR") ||
				(draft.committeeId ?? null) !== (event.committeeId ?? null)
			)
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "EVENT_ORGANIZATION_FROZEN",
				});
			const rosterChanged = !sameRoster(
				event.rosterCriteria,
				draft.rosterCriteria,
			);
			before.rosterCriteria = event.rosterCriteria;
			before.session = sessionConfiguration(session);
			Object.assign(after, {
				title: draft.title,
				description: draft.description,
				startsAt: draft.startsAt,
				endsAt: draft.endsAt,
				rosterCriteria: rosterChanged
					? draft.rosterCriteria
					: event.rosterCriteria,
				session: draft.session,
			});
			// A changed criterion uses the same locked live directory as publication.
			// Retained invitees keep their original personal/organization snapshot.
			if (rosterChanged) {
				const directory = await getActiveSrDirectory(tx, true);
				const roster = committee
					? resolveCommitteeRoster(
							directory.candidates,
							draft.rosterCriteria,
							committee.members,
							new Set(),
						)
					: resolveRoster(directory.candidates, draft.rosterCriteria);
				const existing = await eventOperations.invitationIds(tx, event.id);
				const oldIds = new Set(existing.map((sr) => sr.userId));
				// Published committee membership is a frozen base, never the current committee roster.
				const newIds = new Set(
					committee
						? [...oldIds, ...roster.map((sr) => sr.userId)].filter(
								(id) => !draft.rosterCriteria.exclude.includes(id),
							)
						: roster.map((sr) => sr.userId),
				);
				if (
					committee &&
					[
						...draft.rosterCriteria.individuals,
						...draft.rosterCriteria.include,
					].some(
						(id) =>
							!oldIds.has(id) &&
							!draft.rosterCriteria.exclude.includes(id) &&
							!roster.some((sr) => sr.userId === id),
					)
				)
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: "EVENT_INVITEE_INELIGIBLE",
					});
				const added = roster.filter((sr) => !oldIds.has(sr.userId));
				const removed = existing
					.filter((sr) => !newIds.has(sr.userId))
					.map((sr) => sr.userId);
				before.participants = { count: existing.length };
				after.participants = {
					count: newIds.size,
					addedUserIds: added.map((sr) => sr.userId),
					removedUserIds: removed,
				};
				if (removed.length)
					await eventOperations.removeInvitationsBeforeAttendance(
						tx,
						event.id,
						removed,
					);
				if (added.length)
					await eventOperations.addInvitationSnapshots(tx, event.id, added);
			}
			await eventOperations.amendPublishedConfiguration(
				tx,
				event.id,
				draft,
				rosterChanged,
			);
			await attendanceOperations.configureSession(
				tx,
				session.id,
				draft.session,
			);
		} else {
			if (data.endsAt !== undefined) {
				const end = new Date(data.endsAt);
				if (mode === "METADATA" || end <= event.startsAt || end < new Date())
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: "ADVANCED_EDIT_END_INVALID",
					});
				after.endsAt = end.toISOString();
			}
			after.title = data.title;
			after.description = data.description;
			await eventOperations.amendPublishedDetails(tx, event.id, data);
		}
		await eventOperations.appendEventAudit(tx, {
			eventId: event.id,
			actorUserId: identity.userId,
			reason: data.reason,
			action:
				data.mode === "FULL"
					? "PUBLISHED_CONFIGURATION_EDITED"
					: mode === "METADATA"
						? "CLOSED_METADATA_EDITED"
						: "PUBLISHED_DETAILS_EDITED",
			beforeState: before,
			afterState: after,
		});
	});
}
