import { classifyTiming, type TimingClass } from "./check-in/check-in-policy";

export function eventMaximumPoints(event: {
	organizationContext: string;
	rosterCriteria: { allSr?: boolean; exclude?: string[] } | null;
}) {
	// Historical counts cannot prove coverage. Only the persisted SR all-SR rule can.
	return event.organizationContext === "SR" &&
		event.rosterCriteria?.allSr === true &&
		Array.isArray(event.rosterCriteria.exclude) &&
		event.rosterCriteria.exclude.length === 0
		? 10
		: 6;
}

export type PointsSession = { status: string; lateGraceMinutes: number };
export type PointsRecord = { attendanceAt: Date; timingClass: TimingClass };
type AttendanceStatus = TimingClass | "ABSENT" | "UNKNOWN";

export function attendancePoints(
	maximum: 10 | 6,
	event: { startsAt: Date; closedAt: Date | null },
	session: PointsSession | null,
	record: PointsRecord | null,
): { attendanceStatus: AttendanceStatus; points: number | null } {
	const unknown = { attendanceStatus: "UNKNOWN", points: null } as const;
	if (
		session?.status !== "CLOSED" ||
		!Number.isInteger(session.lateGraceMinutes) ||
		session.lateGraceMinutes < 0 ||
		!Number.isFinite(event.startsAt.getTime()) ||
		!event.closedAt ||
		!Number.isFinite(event.closedAt.getTime())
	)
		return unknown;
	if (!record) return { attendanceStatus: "ABSENT", points: 0 };
	if (
		!Number.isFinite(record.attendanceAt.getTime()) ||
		record.attendanceAt > event.closedAt ||
		record.timingClass !==
			classifyTiming(
				record.attendanceAt,
				event.startsAt,
				session.lateGraceMinutes,
			)
	)
		return unknown;
	if (record.timingClass !== "LATE")
		return { attendanceStatus: record.timingClass, points: maximum };
	const lateMilliseconds =
		record.attendanceAt.getTime() -
		event.startsAt.getTime() -
		session.lateGraceMinutes * 60_000;
	return {
		attendanceStatus: "LATE",
		points:
			lateMilliseconds <= 15 * 60_000
				? maximum === 10
					? 7
					: 4.2
				: maximum / 2,
	};
}
