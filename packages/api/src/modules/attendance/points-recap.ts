import type { ActiveIdentity } from "@resora/auth/sr-access";
import type { Database } from "@resora/db";
import {
	attendanceRecords,
	attendanceSessions,
} from "@resora/db/schema/attendance";
import { TRPCError } from "@trpc/server";
import { and, eq, inArray } from "drizzle-orm";
import type { z } from "zod";
import { pointsRecapSchema } from "../../contracts/attendance";
import {
	closedEventsForScoring,
	scoringInvitationSnapshots,
} from "../events/events.public";
import {
	canReadAttendancePoints,
	readOperationalIdentity,
	readScoringPeriods,
	readSrPeriod,
	readSrPeriodRoster,
} from "../identity/identity.public";
import { pointsCsv } from "./points-csv";
import {
	attendancePoints,
	eventMaximumPoints,
	type PointsRecord,
	type PointsSession,
} from "./points-policy";

type ScoringEvent = Awaited<ReturnType<typeof closedEventsForScoring>>[number];
type Snapshot = Awaited<ReturnType<typeof scoringInvitationSnapshots>>[number];
type SessionAttendance = {
	eventId: string;
	session: PointsSession;
	record: (PointsRecord & { userId: string }) | null;
};
type Cell = {
	eventId: string;
	snapshot: Omit<Snapshot, "eventId" | "userId"> | null;
	attendanceStatus:
		| "EARLY"
		| "ON_TIME"
		| "LATE"
		| "ABSENT"
		| "NOT_INVITED"
		| "UNKNOWN";
	scoringStatus: "SCORED" | "UNCLASSIFIED" | "UNSCORABLE" | "NOT_INVITED";
	points: number | null;
	maximumPoints: number | null;
};

// Pure matrix construction; indexes avoid per-cell searches or database queries.
export function aggregateAttendancePoints(
	sourceEvents: ScoringEvent[],
	roster: Awaited<ReturnType<typeof readSrPeriodRoster>>,
	invitations: Snapshot[],
	attendance: SessionAttendance[],
) {
	const events = sourceEvents.filter(
		(event) => event.scoringMode === "INCLUDED" || event.scoringMode === null,
	);
	const sessions = new Map(attendance.map((row) => [row.eventId, row.session]));
	const records = new Map<string, Map<string, PointsRecord>>();
	for (const row of attendance) {
		if (!row.record) continue;
		if (!records.has(row.eventId)) records.set(row.eventId, new Map());
		records.get(row.eventId)?.set(row.record.userId, row.record);
	}
	const snapshots = new Map<string, Map<string, Snapshot>>();
	for (const invitation of invitations) {
		if (!snapshots.has(invitation.eventId))
			snapshots.set(invitation.eventId, new Map());
		snapshots.get(invitation.eventId)?.set(invitation.userId, invitation);
	}
	const metadata = events.map((event) => {
		const { rosterCriteria: _criteria, closedAt: _closed, ...metadata } = event;
		return {
			...metadata,
			maximumPoints:
				event.scoringMode === "INCLUDED" ? eventMaximumPoints(event) : null,
		};
	});
	return {
		events: metadata,
		participants: roster.map((person) => {
			let attendedCount = 0;
			let absentCount = 0;
			let eventCount = 0;
			let totalTenths = 0;
			let maximumPossiblePoints = 0;
			let unclassifiedCount = 0;
			let scoringStatus: "COMPLETE" | "PARTIAL" = "COMPLETE";
			const cells: Cell[] = events.map((event) => {
				const invitation = snapshots.get(event.eventId)?.get(person.userId);
				if (!invitation)
					return {
						eventId: event.eventId,
						snapshot: null,
						attendanceStatus: "NOT_INVITED",
						scoringStatus: "NOT_INVITED",
						points: null,
						maximumPoints: null,
					};
				const { eventId, userId: _user, ...snapshot } = invitation;
				const result = attendancePoints(
					eventMaximumPoints(event),
					event,
					sessions.get(eventId) ?? null,
					records.get(eventId)?.get(person.userId) ?? null,
				);
				if (event.scoringMode === null) {
					unclassifiedCount++;
					scoringStatus = "PARTIAL";
					return {
						eventId,
						snapshot,
						attendanceStatus: result.attendanceStatus,
						scoringStatus: "UNCLASSIFIED",
						points: null,
						maximumPoints: null,
					};
				}
				eventCount++;
				const maximumPoints = eventMaximumPoints(event);
				maximumPossiblePoints += maximumPoints;
				if (result.points === null) scoringStatus = "PARTIAL";
				else {
					totalTenths += Math.round(result.points * 10);
					if (result.attendanceStatus === "ABSENT") absentCount++;
					else attendedCount++;
				}
				return {
					eventId,
					snapshot,
					...result,
					maximumPoints,
					scoringStatus: result.points === null ? "UNSCORABLE" : "SCORED",
				};
			});
			return {
				...person,
				events: cells,
				attendedCount,
				absentCount,
				eventCount,
				totalPoints: totalTenths / 10,
				maximumPossiblePoints,
				unclassifiedCount,
				// Callback assignments are not reflected in TypeScript's outer control-flow narrowing.
				scoringStatus: scoringStatus as "COMPLETE" | "PARTIAL",
			};
		}),
	};
}

export async function pointsRecap(
	db: Database,
	identity: ActiveIdentity,
	input: z.input<typeof pointsRecapSchema>,
) {
	if (!canReadAttendancePoints(identity))
		throw new TRPCError({ code: "FORBIDDEN" });
	const { periodId } = pointsRecapSchema.parse(input);
	return db.transaction(
		async (tx) => {
			if (
				!canReadAttendancePoints(
					await readOperationalIdentity(tx, identity.userId),
				)
			)
				throw new TRPCError({ code: "FORBIDDEN" });
			const period = await readSrPeriod(tx, periodId);
			if (!period)
				throw new TRPCError({ code: "NOT_FOUND", message: "PERIOD_NOT_FOUND" });
			const roster = await readSrPeriodRoster(tx, periodId);
			const events = await closedEventsForScoring(
				tx,
				period.startsOn,
				period.endsOn,
			);
			const eventIds = events.map((row) => row.eventId);
			const userIds = roster.map((row) => row.userId);
			const invitations = await scoringInvitationSnapshots(
				tx,
				eventIds,
				userIds,
			);
			const attendance =
				eventIds.length && userIds.length
					? await tx
							.select({
								eventId: attendanceSessions.internalEventId,
								session: {
									status: attendanceSessions.status,
									lateGraceMinutes: attendanceSessions.lateGraceMinutes,
								},
								record: {
									userId: attendanceRecords.userId,
									attendanceAt: attendanceRecords.attendanceAt,
									timingClass: attendanceRecords.timingClass,
								},
							})
							.from(attendanceSessions)
							.leftJoin(
								attendanceRecords,
								and(
									eq(attendanceRecords.sessionId, attendanceSessions.id),
									inArray(attendanceRecords.userId, userIds),
								),
							)
							.where(inArray(attendanceSessions.internalEventId, eventIds))
					: [];
			return {
				period: { ...period, timeZone: "Asia/Jakarta" as const },
				...aggregateAttendancePoints(events, roster, invitations, attendance),
			};
		},
		{ isolationLevel: "repeatable read", accessMode: "read only" },
	);
}

export async function pointsPeriods(db: Database, identity: ActiveIdentity) {
	if (!canReadAttendancePoints(identity))
		throw new TRPCError({ code: "FORBIDDEN" });
	return db.transaction(
		async (tx) => {
			if (
				!canReadAttendancePoints(
					await readOperationalIdentity(tx, identity.userId),
				)
			)
				throw new TRPCError({ code: "FORBIDDEN" });
			return readScoringPeriods(tx);
		},
		{ isolationLevel: "repeatable read", accessMode: "read only" },
	);
}

export async function exportPointsCsv(
	db: Database,
	identity: ActiveIdentity,
	input: z.input<typeof pointsRecapSchema>,
) {
	const report = await pointsRecap(db, identity, input);
	return {
		filename: `attendance-points-${report.period.id}-${report.period.startsOn}-${report.period.endsOn}.csv`,
		content: pointsCsv(report),
	};
}
