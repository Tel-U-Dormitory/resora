import type { ActiveIdentity } from "@resora/auth/sr-access";
import type { Database } from "@resora/db";
import { TRPCError } from "@trpc/server";
import type { z } from "zod";
import { readAttendanceRecordsForUsers } from "../../modules/attendance/attendance.public";
import { listCommitteesForUsers } from "../../modules/committee/committee.public";
import type { listDtMembersSchema } from "../../modules/dt/dt.contracts";
import {
	authorizeDtManager,
	authorizeDtPersonal,
	getDtMembershipCore,
	getOwnDtMembershipRecords,
	listDtMembers,
} from "../../modules/dt/dt.public";
import { listInvitedEventsForUsers } from "../../modules/events/events.public";

function summarizeUserParticipation(
	userId: string,
	events: Awaited<ReturnType<typeof listInvitedEventsForUsers>>,
	records: Awaited<ReturnType<typeof readAttendanceRecordsForUsers>>,
	committees: Awaited<ReturnType<typeof listCommitteesForUsers>>,
) {
	const userEvents = events.filter((e) => e.userId === userId);
	const recordByEvent = new Map(
		records.filter((r) => r.userId === userId).map((r) => [r.eventId, r]),
	);
	const userCommittees = committees.filter((c) => c.userId === userId);

	let presentCount = 0;
	let earlyCount = 0;
	let onTimeCount = 0;
	let lateCount = 0;
	let pendingCount = 0;
	let absentCount = 0;

	const eventRows = userEvents.map((event) => {
		const record = recordByEvent.get(event.eventId);
		const presence = record
			? ("PRESENT" as const)
			: event.status === "CLOSED"
				? ("ABSENT" as const)
				: ("PENDING" as const);
		if (presence === "PRESENT" && record) {
			presentCount++;
			if (record.timingClass === "EARLY") earlyCount++;
			else if (record.timingClass === "ON_TIME") onTimeCount++;
			else lateCount++;
		} else if (presence === "PENDING") {
			pendingCount++;
		} else {
			absentCount++;
		}
		return {
			eventId: event.eventId,
			title: event.title,
			status: event.status,
			startsAt: event.startsAt,
			endsAt: event.endsAt,
			organizationContext: event.organizationContext,
			committeeName: event.committeeName,
			presence,
			timingClass: record?.timingClass ?? null,
			attendanceAt: record?.attendanceAt ?? null,
			source: record?.source ?? null,
		};
	});

	return {
		attendanceSummary: {
			invited: userEvents.length,
			present: presentCount,
			early: earlyCount,
			onTime: onTimeCount,
			late: lateCount,
			pending: pendingCount,
			absent: absentCount,
		},
		events: eventRows,
		committees: userCommittees.map((c) => ({
			committeeId: c.committeeId,
			committeeName: c.committeeName,
			divisionName: c.divisionName,
			positionCode: c.positionCode,
		})),
	};
}

export async function getDtMemberDetail(
	db: Database,
	identity: ActiveIdentity,
	membershipId: string,
) {
	if (!authorizeDtManager(identity)) {
		throw new TRPCError({ code: "FORBIDDEN", message: "DT_ACCESS_DENIED" });
	}
	const core = await getDtMembershipCore(db, membershipId);
	const userId = core.membership.userId;
	const [events, committees] = await Promise.all([
		listInvitedEventsForUsers(db, [userId]),
		listCommitteesForUsers(db, [userId]),
	]);
	const records = await readAttendanceRecordsForUsers(
		db,
		[userId],
		events.map((e) => e.eventId),
	);
	const participation = summarizeUserParticipation(
		userId,
		events,
		records,
		committees,
	);
	return {
		...core,
		...participation,
	};
}

export async function getDtParticipationRecap(
	db: Database,
	identity: ActiveIdentity,
	input: z.infer<typeof listDtMembersSchema>,
) {
	if (!authorizeDtManager(identity)) {
		throw new TRPCError({ code: "FORBIDDEN", message: "DT_ACCESS_DENIED" });
	}
	const list = await listDtMembers(db, identity, {
		...input,
		limit: 50,
		offset: 0,
	});
	const userIds = [...new Set(list.items.map((item) => item.userId))];
	if (!userIds.length) {
		return {
			items: [],
			totals: {
				members: 0,
				invited: 0,
				present: 0,
				pending: 0,
				absent: 0,
				committeeAssignments: 0,
			},
		};
	}
	const [events, committees] = await Promise.all([
		listInvitedEventsForUsers(db, userIds),
		listCommitteesForUsers(db, userIds),
	]);
	const records = await readAttendanceRecordsForUsers(
		db,
		userIds,
		events.map((e) => e.eventId),
	);
	const items = list.items.map((member) => {
		const summary = summarizeUserParticipation(
			member.userId,
			events,
			records,
			committees,
		);
		return {
			membershipId: member.id,
			userId: member.userId,
			name: member.name,
			nim: member.nim,
			periodName: member.periodName,
			effectiveStatus: member.effectiveStatus,
			departmentCode: member.departmentCode,
			departmentName: member.departmentName,
			buildingName: member.buildingName,
			workProgram: member.workProgram,
			attendance: summary.attendanceSummary,
			committeeCount: summary.committees.length,
			committees: summary.committees,
		};
	});

	return {
		items,
		totals: {
			members: items.length,
			invited: items.reduce((acc, i) => acc + i.attendance.invited, 0),
			present: items.reduce((acc, i) => acc + i.attendance.present, 0),
			pending: items.reduce((acc, i) => acc + i.attendance.pending, 0),
			absent: items.reduce((acc, i) => acc + i.attendance.absent, 0),
			committeeAssignments: items.reduce((acc, i) => acc + i.committeeCount, 0),
		},
	};
}

export async function getMyDtPortal(db: Database, identity: ActiveIdentity) {
	if (!authorizeDtPersonal(identity)) {
		throw new TRPCError({
			code: "FORBIDDEN",
			message: "DT_PERSONAL_ACCESS_DENIED",
		});
	}
	const [ownRecords, events, committees] = await Promise.all([
		getOwnDtMembershipRecords(db, identity.userId),
		listInvitedEventsForUsers(db, [identity.userId]),
		listCommitteesForUsers(db, [identity.userId]),
	]);
	const records = await readAttendanceRecordsForUsers(
		db,
		[identity.userId],
		events.map((e) => e.eventId),
	);
	const participation = summarizeUserParticipation(
		identity.userId,
		events,
		records,
		committees,
	);
	const activeMembership =
		ownRecords.memberships.find((m) => m.id === identity.membershipId) ??
		ownRecords.memberships[0] ??
		null;
	return {
		activeMembership,
		memberships: ownRecords.memberships,
		assignmentHistory: ownRecords.assignmentHistory,
		...participation,
	};
}
