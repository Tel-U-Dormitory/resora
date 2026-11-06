import type { z } from "zod";
import type {
	rosterSchema,
	sessionConfigSchema,
} from "../../contracts/attendance";
import type { CommitteePosition } from "../committee/committee.contracts";

export type RosterCriteria = z.output<typeof rosterSchema>;
export type EventVisibility = "VISIBLE" | "HIDDEN" | "ARCHIVED";
export type EventFact = {
	id: string;
	title: string;
	description: string;
	createdByUserId: string;
	status: "DRAFT" | "PUBLISHED" | "CLOSED";
	visibility: EventVisibility;
	startsAt: Date;
	endsAt: Date;
	rosterCriteria: RosterCriteria;
	organizationContext: "SR" | "COMMITTEE";
	committeeId: string | null;
	snapshotCommitteeName: string | null;
	publishedAt: Date | null;
	closedAt: Date | null;
	createdAt: Date;
	updatedAt: Date;
};
export type InvitationFact = {
	eventId: string;
	userId: string;
	nim: string;
	name: string;
	departmentCode: string;
	positionCode: string;
	buildingCode: string;
	buildingName: string;
	committeeDivision: string | null;
	committeePosition: CommitteePosition | null;
	invitedAt: Date;
};
export type EventEditAuditState = {
	title: string;
	description: string;
	startsAt: string;
	endsAt: string;
	rosterCriteria?: RosterCriteria;
	session?: z.output<typeof sessionConfigSchema>;
	participants?: {
		count: number;
		addedUserIds?: string[];
		removedUserIds?: string[];
	};
};
export type EventAuditEvidence = {
	eventId: string;
	actorUserId: string;
	reason: string;
	action:
		| "PUBLISHED_CONFIGURATION_EDITED"
		| "PUBLISHED_DETAILS_EDITED"
		| "CLOSED_METADATA_EDITED"
		| "EVENT_HIDDEN"
		| "EVENT_UNHIDDEN"
		| "EVENT_ARCHIVED"
		| "EVENT_RESTORED";
	beforeState: EventEditAuditState | { visibility: EventVisibility };
	afterState: EventEditAuditState | { visibility: EventVisibility };
};
