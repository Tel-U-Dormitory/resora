import { TRPCError } from "@trpc/server";
import { classifyTiming, type TimingClass } from "./check-in-policy";

export function presence(hasRecord: boolean, eventStatus: string) {
	return hasRecord
		? ("PRESENT" as const)
		: eventStatus === "CLOSED"
			? ("ABSENT" as const)
			: ("PENDING" as const);
}

export function lateMinutes(
	attendanceAt: Date | null,
	startsAt: Date,
	graceMinutes: number,
) {
	if (!attendanceAt) return null;
	return Math.max(
		0,
		Math.ceil(
			(attendanceAt.getTime() - startsAt.getTime() - graceMinutes * 60_000) /
				60_000,
		),
	);
}

export function manualEffectiveTime(
	event: { status: string; closedAt: Date | null },
	sessionStatus: string,
	requested: string | undefined,
	now: Date,
) {
	const permitted =
		(event.status === "PUBLISHED" &&
			["INACTIVE", "ACTIVE"].includes(sessionStatus)) ||
		(event.status === "CLOSED" &&
			sessionStatus === "CLOSED" &&
			event.closedAt !== null);
	if (!permitted)
		throw new TRPCError({
			code: "CONFLICT",
			message: "MANUAL_LIFECYCLE_INVALID",
		});
	if (event.status === "CLOSED" && !requested)
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "CLOSED_EFFECTIVE_TIME_REQUIRED",
		});
	const time = requested ? new Date(requested) : now;
	if (!Number.isFinite(time.getTime()) || time > now)
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "ATTENDANCE_TIME_INVALID",
		});
	if (event.closedAt && time > event.closedAt)
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "ATTENDANCE_AFTER_CLOSURE",
		});
	return time;
}

export function auditState(record: {
	attendanceAt: Date;
	timingClass: TimingClass;
}) {
	return {
		attendanceAt: record.attendanceAt.toISOString(),
		timingClass: record.timingClass,
	};
}

export function reportAttendance(
	record: {
		id: string;
		attendanceAt: Date;
		timingClass: TimingClass;
		source: "QR" | "MANUAL";
	} | null,
	eventStatus: string,
	startsAt: Date,
	grace: number,
) {
	return {
		attendanceId: record?.id ?? null,
		presence: presence(record !== null, eventStatus),
		attendanceAt: record?.attendanceAt ?? null,
		timingClass: record?.timingClass ?? null,
		lateMinutes: lateMinutes(record?.attendanceAt ?? null, startsAt, grace),
		source: record?.source ?? null,
	};
}

// Excel-compatible text marker, never a spreadsheet formula. Preserve all original digits.
function csvCell(value: string | number | null, textIdentifier = false) {
	if (value === null) return "";
	const raw = String(value);
	// Ignore leading whitespace/control bytes when detecting spreadsheet formula prefixes.
	const formulaProbe = Array.from(raw)
		.filter((char) => char.charCodeAt(0) > 31)
		.join("")
		.trimStart();
	const safe =
		textIdentifier || /^[=+\-@]/u.test(formulaProbe) || /^[\t\r\n]/u.test(raw)
			? `'${raw}`
			: raw;
	return `"${safe.replaceAll('"', '""')}"`;
}

export function attendanceCsv(
	rows: {
		nim: string;
		name: string;
		departmentCode: string;
		positionCode: string;
		buildingCode: string;
		presence: string;
		attendanceAt: Date | null;
		timingClass: TimingClass | null;
		lateMinutes: number | null;
		source: "QR" | "MANUAL" | null;
	}[],
) {
	const lines = [
		"NIM,Name,Department,Position,Building,Presence,Attendance At (WIB),Timing Classification,Late Minutes,Source",
	];
	for (const row of rows) {
		const time = row.attendanceAt
			? `${new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).format(row.attendanceAt)} WIB`
			: null;
		lines.push(
			[
				csvCell(row.nim, true),
				...[
					row.name,
					row.departmentCode,
					row.positionCode,
					row.buildingCode,
					row.presence,
					time,
					row.timingClass,
					row.lateMinutes,
					row.source,
				].map((value) => csvCell(value)),
			].join(","),
		);
	}
	return `\uFEFF${lines.join("\r\n")}\r\n`;
}

export { classifyTiming };
