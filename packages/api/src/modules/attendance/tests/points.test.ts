import { expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import type { ActiveIdentity } from "@resora/auth/sr-access";
import type { Database } from "@resora/db";
import { getTableName, type SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { pointsRecapSchema } from "../../../contracts/attendance";
import { appRouter } from "../../../routers";
import { attendancePoints, eventMaximumPoints } from "../points-policy";
import { aggregateAttendancePoints, pointsRecap } from "../points-recap";

type Inputs = Parameters<typeof aggregateAttendancePoints>;
const startsAt = new Date("2026-10-12T02:00:00Z");
function event(overrides: Partial<Inputs[0][number]> = {}): Inputs[0][number] {
	return {
		eventId: randomUUID(),
		title: "Same event title",
		startsAt,
		closedAt: new Date(startsAt.getTime() + 3 * 3600_000),
		organizationContext: "SR",
		committeeName: null,
		scoringMode: "INCLUDED",
		rosterCriteria: {
			allSr: true,
			exclude: [],
			departments: [],
			inti: false,
			kadep: false,
			individuals: [],
			include: [],
		},
		...overrides,
	};
}
const people: Inputs[1] = ["a", "b", "c"].map((userId) => ({
	userId,
	name: "Same name",
	nim: `000${userId}`,
}));
function invitation(eventId: string, userId = "a"): Inputs[2][number] {
	return {
		eventId,
		userId,
		nim: "historical-nim",
		name: "Historical name",
		departmentCode: "HCO",
		positionCode: "ANGGOTA",
		committeeDivision: "Historical division",
		committeePosition: "PIC1",
	};
}
function attendance(
	eventId: string,
	userId = "a",
	delta = 0,
	timingClass: "EARLY" | "ON_TIME" | "LATE" = "ON_TIME",
): Inputs[3][number] {
	return {
		eventId,
		session: { status: "CLOSED", lateGraceMinutes: 15 },
		record: {
			userId,
			timingClass,
			attendanceAt: new Date(startsAt.getTime() + delta),
		},
	};
}

test("maximum points use persisted SR all-SR/exclusion criteria, never counts or committee coverage", () => {
	expect(eventMaximumPoints(event())).toBe(10);
	for (const value of [
		event({ organizationContext: "COMMITTEE" }),
		event({ rosterCriteria: { ...event().rosterCriteria, allSr: false } }),
		event({
			rosterCriteria: {
				...event().rosterCriteria,
				exclude: ["not-a-current-account"],
			},
		}),
		{ organizationContext: "SR", rosterCriteria: null },
		{ organizationContext: "SR", rosterCriteria: { allSr: true } },
	])
		expect(eventMaximumPoints(value)).toBe(6);
});

test("10/6 scoring uses exact timestamp boundaries and non-default grace without rounded minutes", () => {
	for (const maximum of [10, 6] as const)
		for (const grace of [0, 5, 15, 40]) {
			for (const [delta, timingClass, expected] of [
				[-1, "EARLY", maximum],
				[0, "ON_TIME", maximum],
				[grace * 60_000, "ON_TIME", maximum],
				[grace * 60_000 + 1, "LATE", maximum === 10 ? 7 : 4.2],
				[(grace + 15) * 60_000, "LATE", maximum === 10 ? 7 : 4.2],
				[(grace + 15) * 60_000 + 1, "LATE", maximum / 2],
			] as const)
				expect(
					attendancePoints(
						maximum,
						event(),
						{ status: "CLOSED", lateGraceMinutes: grace },
						{ attendanceAt: new Date(startsAt.getTime() + delta), timingClass },
					),
				).toEqual({ attendanceStatus: timingClass, points: expected });
			expect(
				attendancePoints(
					maximum,
					event(),
					{ status: "CLOSED", lateGraceMinutes: grace },
					null,
				),
			).toEqual({ attendanceStatus: "ABSENT", points: 0 });
		}
});

test("missing session or inconsistent timestamps/classification remain unscorable rather than zero", () => {
	const e = event();
	if (!e.closedAt) throw Error("FIXTURE_CLOSED_AT_REQUIRED");
	const session = { status: "CLOSED", lateGraceMinutes: 15 };
	const record = { attendanceAt: startsAt, timingClass: "ON_TIME" as const };
	for (const result of [
		attendancePoints(10, e, null, null),
		attendancePoints(10, e, { ...session, status: "ACTIVE" }, null),
		attendancePoints(10, e, { ...session, lateGraceMinutes: -1 }, record),
		attendancePoints(10, { ...e, closedAt: null }, session, record),
		attendancePoints(10, e, session, {
			...record,
			attendanceAt: new Date(Number.NaN),
		}),
		attendancePoints(10, e, session, { ...record, timingClass: "LATE" }),
		attendancePoints(10, e, session, {
			...record,
			attendanceAt: new Date(e.closedAt.getTime() + 1),
			timingClass: "LATE",
		}),
	])
		expect(result).toEqual({ attendanceStatus: "UNKNOWN", points: null });
});

test("matrix retains period roster, historical snapshots, distinct event IDs and independent known totals", () => {
	const full = event();
	const subset = event({
		rosterCriteria: { ...event().rosterCriteria, allSr: false },
	});
	const excluded = event({ scoringMode: "EXCLUDED" });
	const unclassified = event({ scoringMode: null });
	const report = aggregateAttendancePoints(
		[full, subset, excluded, unclassified],
		people,
		[
			invitation(full.eventId),
			invitation(subset.eventId),
			invitation(subset.eventId, "b"),
			invitation(excluded.eventId),
			invitation(unclassified.eventId),
		],
		[
			attendance(full.eventId),
			attendance(subset.eventId, "a", 16 * 60_000, "LATE"),
			{
				eventId: unclassified.eventId,
				session: { status: "CLOSED", lateGraceMinutes: 15 },
				record: null,
			},
		],
	);
	expect(report.events).toHaveLength(3);
	expect(new Set(report.events.map((row) => row.eventId)).size).toBe(3);
	expect(report.events.map((row) => row.maximumPoints)).toEqual([10, 6, null]);
	expect(report.participants).toHaveLength(3);
	const [a, b, c] = report.participants;
	expect(a).toMatchObject({
		userId: "a",
		attendedCount: 2,
		absentCount: 0,
		eventCount: 2,
		totalPoints: 14.2,
		maximumPossiblePoints: 16,
		unclassifiedCount: 1,
		scoringStatus: "PARTIAL",
	});
	expect(a?.events[0]?.snapshot).toMatchObject({
		name: "Historical name",
		nim: "historical-nim",
		committeePosition: "PIC1",
	});
	expect(a?.events[2]).toMatchObject({
		scoringStatus: "UNCLASSIFIED",
		points: null,
		maximumPoints: null,
	});
	expect(b).toMatchObject({
		attendedCount: 0,
		absentCount: 1,
		eventCount: 1,
		totalPoints: 0,
		maximumPossiblePoints: 6,
		scoringStatus: "COMPLETE",
	});
	expect(b?.events[0]).toMatchObject({
		attendanceStatus: "NOT_INVITED",
		points: null,
		maximumPoints: null,
	});
	expect(c).toMatchObject({
		eventCount: 0,
		totalPoints: 0,
		maximumPossiblePoints: 0,
		scoringStatus: "COMPLETE",
	});
	expect(
		aggregateAttendancePoints([], people, [], []).participants,
	).toHaveLength(3);
});

test("unscorable attendance affects completeness but not valid attendance/absence counts or earned points", () => {
	const e = event();
	const report = aggregateAttendancePoints(
		[e],
		people,
		[invitation(e.eventId)],
		[attendance(e.eventId, "a", 0, "LATE")],
	);
	expect(report.participants[0]).toMatchObject({
		attendedCount: 0,
		absentCount: 0,
		eventCount: 1,
		totalPoints: 0,
		maximumPossiblePoints: 10,
		scoringStatus: "PARTIAL",
	});
	expect(report.participants[0]?.events[0]).toMatchObject({
		scoringStatus: "UNSCORABLE",
		points: null,
	});
});

test("decimal scores accumulate as tenths and corrections use the current record", () => {
	const events = Array.from({ length: 100 }, () =>
		event({ organizationContext: "COMMITTEE" }),
	);
	const records = events.map((e) =>
		attendance(e.eventId, "a", 16 * 60_000, "LATE"),
	);
	const invitations = events.map((e) => invitation(e.eventId));
	expect(
		aggregateAttendancePoints(events, people, invitations, records)
			.participants[0]?.totalPoints,
	).toBe(420);
	const first = events[0];
	if (!first) throw Error("FIXTURE_EVENT_REQUIRED");
	records[0] = attendance(first.eventId);
	expect(
		aggregateAttendancePoints(events, people, invitations, records)
			.participants[0]?.totalPoints,
	).toBe(421.8);
});

function databaseFixture() {
	const e = event();
	const period = {
		id: randomUUID(),
		name: "Historical period",
		startsOn: "2026-10-01",
		endsOn: "2026-10-31",
	};
	const identity: ActiveIdentity = {
		userId: "admin",
		actor: "SYSTEM_ADMIN",
		username: "synthetic.admin",
		isSuperadmin: true,
		isActive: true,
		mustChangePassword: false,
	};
	const state = {
		profile: {
			...identity,
			actor: "SYSTEM_ADMIN" as "SYSTEM_ADMIN" | "SR",
			nim: "synthetic.admin",
			srUserId: null as string | null,
			tenureStatus: "ACTIVE",
			departmentCode: "HCO",
			positionCode: "KADEP",
			buildingId: randomUUID(),
		},
		period: period as typeof period | null,
		options: {} as unknown,
		reads: [] as string[],
		filters: [] as { table: string; sql: string; params: unknown[] }[],
	};
	const double = {
		transaction: async (run: (tx: unknown) => unknown, options: unknown) => {
			state.options = options;
			return run(double);
		},
		select: () => {
			let table = "";
			const q = {
				from: (value: Parameters<typeof getTableName>[0]) => {
					table = getTableName(value);
					state.reads.push(table);
					return q;
				},
				innerJoin: () => q,
				leftJoin: () => q,
				orderBy: () => q,
				where: (condition: SQL) => {
					state.filters.push({
						table,
						...new PgDialect().sqlToQuery(condition),
					});
					return q;
				},
				// biome-ignore lint/suspicious/noThenProperty: Drizzle query builders are awaitable.
				then: (resolve: (rows: unknown[]) => unknown) =>
					Promise.resolve(
						table === "user_profiles"
							? [state.profile]
							: table === "sr_periods"
								? state.period
									? [state.period]
									: []
								: table === "sr_period_memberships"
									? people
									: table === "events"
										? [e]
										: table === "event_participants"
											? [invitation(e.eventId)]
											: table === "attendance_sessions"
												? [attendance(e.eventId)]
												: [],
					).then(resolve),
			};
			return q;
		},
	};
	return { state, db: double as unknown as Database, identity, period };
}

test("points query uses one read-only snapshot and bounded bulk reads with explicit date/status predicates", async () => {
	const f = databaseFixture();
	const report = await pointsRecap(f.db, f.identity, { periodId: f.period.id });
	expect(f.state.options).toEqual({
		isolationLevel: "repeatable read",
		accessMode: "read only",
	});
	expect(f.state.reads).toEqual([
		"user_profiles",
		"sr_periods",
		"sr_period_memberships",
		"events",
		"event_participants",
		"attendance_sessions",
	]);
	const filter = f.state.filters.find((row) => row.table === "events");
	expect(filter?.sql).toContain("Asia/Jakarta");
	expect(filter?.params).toContain("CLOSED");
	expect(filter?.params).toContain("INCLUDED");
	expect(filter?.params).toContain(f.period.startsOn);
	expect(filter?.params).toContain(f.period.endsOn);
	expect(filter?.sql).not.toContain("visibility");
	expect(report.period.timeZone).toBe("Asia/Jakarta");
	const json = JSON.stringify(report);
	for (const field of [
		"scanLat",
		"scanLng",
		"gpsAccuracy",
		"qrToken",
		"password",
		"email",
		"rosterCriteria",
	])
		expect(json).not.toContain(field);
});

test("permission grants never authorize scoring reads; stale live identity is revalidated before report reads", async () => {
	const f = databaseFixture();
	for (const positionCode of ["ANGGOTA", "SEKDEP"]) {
		const member = {
			userId: "member",
			actor: "SR" as const,
			nim: "0001",
			isSuperadmin: false,
			isActive: true,
			mustChangePassword: false,
			departmentCode: "HCO",
			positionCode,
			buildingId: randomUUID(),
		};
		await expect(
			pointsRecap(f.db, member, { periodId: f.period.id }),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	}
	expect(f.state.reads).toEqual([]);
	f.state.profile.isActive = false;
	await expect(
		pointsRecap(f.db, f.identity, { periodId: f.period.id }),
	).rejects.toMatchObject({ code: "FORBIDDEN" });
	expect(f.state.reads).toEqual(["user_profiles"]);
	f.state.profile.isActive = true;
	f.state.period = null;
	await expect(
		pointsRecap(f.db, f.identity, { periodId: f.period.id }),
	).rejects.toMatchObject({ code: "NOT_FOUND" });
});

test("protected read input rejects anonymous requests, invalid IDs and forged fields", async () => {
	expect(pointsRecapSchema.safeParse({ periodId: "bad" }).success).toBe(false);
	expect(
		pointsRecapSchema.safeParse({ periodId: randomUUID(), isSuperadmin: true })
			.success,
	).toBe(false);
	const f = databaseFixture();
	const caller = appRouter.createCaller({ db: f.db, session: null } as never);
	await expect(
		caller.attendance.pointsRecap({ periodId: f.period.id }),
	).rejects.toMatchObject({ code: "UNAUTHORIZED" });
	expect(f.state.reads).toEqual([]);
});

test("read-only operational recheck enforces current tenure, assignment and password gates", async () => {
	for (const overrides of [
		{ tenureStatus: "EXPIRED" },
		{ tenureStatus: "UNASSIGNED" },
		{ tenureStatus: "SCHEDULED" },
		{ departmentCode: "RND" },
		{ positionCode: "PJ" },
		{ isActive: false },
		{ passwordResetRequired: true },
	]) {
		const f = databaseFixture();
		Object.assign(
			f.state.profile,
			{ actor: "SR", srUserId: f.identity.userId, isSuperadmin: false },
			overrides,
		);
		await expect(
			pointsRecap(f.db, f.identity, { periodId: f.period.id }),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
		expect(f.state.reads).not.toContain("events");
		expect(f.state.reads).not.toContain("user_permission_grants");
	}
});
