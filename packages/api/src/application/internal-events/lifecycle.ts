import type { ActiveIdentity } from "@resora/auth/sr-access";
import type { Database } from "@resora/db";
import { TRPCError } from "@trpc/server";

import { type EventDraft, eventDraftSchema } from "../../contracts/attendance";

import * as attendanceOperations from "../../modules/attendance/attendance.public";

import { getCommitteeRoster } from "../../modules/committee/committee.public";

import * as eventOperations from "../../modules/events/events.public";
import {
	resolveCommitteeRoster,
	resolveRoster,
} from "../../modules/events/events.public";
import {
	getActiveSrDirectory,
	getLiveOperationalIdentity,
} from "../../modules/identity/identity.public";
import {
	lockedEvent,
	lockedRosterEvent,
	operator,
	requireState,
} from "./context";

export async function createEvent(
	db: Database,
	identity: ActiveIdentity,
	input: EventDraft,
) {
	operator(identity);
	const draft = eventDraftSchema.parse(input);
	return db.transaction(async (tx) => {
		if (draft.committeeId)
			await getCommitteeRoster(tx, draft.committeeId, true);
		operator(await getLiveOperationalIdentity(tx, identity.userId));
		const [event] = await eventOperations.createInternalDraft(
			tx,
			draft,
			identity.userId,
		);
		if (!event) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
		await attendanceOperations.createInternalSession(
			tx,
			event.id,
			draft.session,
		);
		return { eventId: event.id };
	});
}

export async function editDraft(
	db: Database,
	identity: ActiveIdentity,
	eventId: string,
	input: EventDraft,
) {
	operator(identity);
	const draft = eventDraftSchema.parse(input);
	return db.transaction(async (tx) => {
		const { event, session } = await lockedRosterEvent(
			tx,
			eventId,
			identity,
			draft.committeeId,
		);
		requireState(event.status, "DRAFT");
		requireState(session.status, "INACTIVE");
		await eventOperations.replaceDraftDetails(tx, eventId, draft);
		await attendanceOperations.configureInternalSession(
			tx,
			eventId,
			draft.session,
		);
	});
}

export async function editMetadata(
	db: Database,
	identity: ActiveIdentity,
	eventId: string,
	metadata: { title: string; description: string },
) {
	operator(identity);
	return db.transaction(async (tx) => {
		const { event } = await lockedEvent(tx, eventId, identity);
		requireState(event.status, "PUBLISHED");
		await eventOperations.editPublishedMetadata(tx, eventId, metadata);
	});
}

export async function previewRoster(
	db: Database,
	identity: ActiveIdentity,
	eventId: string,
) {
	operator(identity);
	return db.transaction(async (tx) => {
		const { event, committee } = await lockedRosterEvent(tx, eventId, identity);
		requireState(event.status, "DRAFT");
		const directory = await getActiveSrDirectory(tx);
		return {
			participants: committee
				? resolveCommitteeRoster(
						directory.candidates,
						event.rosterCriteria,
						committee.members,
					)
				: resolveRoster(directory.candidates, event.rosterCriteria).map(
						(sr) => ({
							...sr,
							committeeDivision: null,
							committeePosition: null,
						}),
					),
			invalidAssignmentCount: directory.invalidAssignmentCount,
		};
	});
}

export async function publishEvent(
	db: Database,
	identity: ActiveIdentity,
	eventId: string,
) {
	operator(identity);
	return db.transaction(async (tx) => {
		const { event, session, committee } = await lockedRosterEvent(
			tx,
			eventId,
			identity,
		);
		requireState(event.status, "DRAFT");
		requireState(session.status, "INACTIVE");
		const directory = await getActiveSrDirectory(tx, true);
		const roster = committee
			? resolveCommitteeRoster(
					directory.candidates,
					event.rosterCriteria,
					committee.members,
				)
			: resolveRoster(directory.candidates, event.rosterCriteria);
		if (roster.length)
			await eventOperations.addInvitationSnapshots(tx, eventId, roster);
		await eventOperations.publishInternalDraft(
			tx,
			eventId,
			committee?.name ?? null,
		);
		return {
			participantCount: roster.length,
			invalidAssignmentCount: directory.invalidAssignmentCount,
		};
	});
}

export async function closeEvent(
	db: Database,
	identity: ActiveIdentity,
	eventId: string,
) {
	operator(identity);
	return db.transaction(async (tx) => {
		const { event, session } = await lockedEvent(tx, eventId, identity);
		requireState(event.status, "PUBLISHED");
		const now = new Date();
		await attendanceOperations.invalidateSessionChallenges(tx, session.id, now);
		await attendanceOperations.closeInternalSession(tx, session.id, now);
		await eventOperations.closePublishedEvent(tx, eventId, now);
	});
}
