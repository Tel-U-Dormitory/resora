import { expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ActiveSrIdentity } from "@resora/auth/sr-access";
import type { Database } from "@resora/db";
import { attendanceRecords } from "@resora/db/schema/attendance";
import { getTableName } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import { appRouter } from "../../routers";
import { getActiveSrDirectory } from "../identity/identity.public";
import { checkInSchema } from "./attendance.schema";
import { checkIn } from "./check-in";
import {
	classifyTiming,
	haversineMeters,
	locationFailure,
	MAX_GPS_ACCURACY_M,
	validLocation,
} from "./check-in-policy";
import { signChallenge, verifySessionChallenge } from "./qr";

const center = { latitude: 0, longitude: 0 };
const location = { ...center, accuracyMeters: 20 };
test("Haversine handles identity, known distance, antipodes and longitude wrap", () => {
	expect(haversineMeters(center, center)).toBe(0);
	expect(haversineMeters(center, { latitude: 0, longitude: 1 })).toBeCloseTo(
		111194.9266,
		3,
	);
	expect(haversineMeters(center, { latitude: 0, longitude: 180 })).toBeCloseTo(
		Math.PI * 6371000,
		3,
	);
	expect(
		haversineMeters(
			{ latitude: 0, longitude: 179.999 },
			{ latitude: 0, longitude: -179.999 },
		),
	).toBeCloseTo(222.38985, 3);
});
test("location finite/range/positive accuracy checks and inclusive radius/accuracy boundary", () => {
	expect(MAX_GPS_ACCURACY_M).toBe(40);
	expect(locationFailure(location, center, 20)).toBeNull();
	expect(
		locationFailure({ ...location, accuracyMeters: 20.001 }, center, 20),
	).toBeNull();
	expect(
		locationFailure({ ...location, accuracyMeters: 40 }, center, 20),
	).toBeNull();
	expect(
		locationFailure({ ...location, accuracyMeters: 40.001 }, center, 20),
	).toBe("GPS_INACCURATE");
	for (const value of [
		Number.NaN,
		Number.POSITIVE_INFINITY,
		Number.NEGATIVE_INFINITY,
	]) {
		expect(validLocation({ ...location, latitude: value })).toBe(false);
		expect(validLocation({ ...location, longitude: value })).toBe(false);
		expect(validLocation({ ...location, accuracyMeters: value })).toBe(false);
	}
	for (const data of [
		{ ...location, latitude: 90.1 },
		{ ...location, longitude: -180.1 },
		{ ...location, accuracyMeters: 0 },
		{ ...location, accuracyMeters: -1 },
	])
		expect(locationFailure(data, center, 20)).toBe("INVALID_LOCATION");
	const edge = { ...location, longitude: ((20 / 6371000) * 180) / Math.PI };
	const exactRadius = haversineMeters(center, edge);
	expect(locationFailure(edge, center, exactRadius)).toBeNull();
	expect(locationFailure(edge, center, exactRadius - 0.001)).toBe(
		"OUTSIDE_GEOFENCE",
	);
});
test("timing has inclusive start/grace, supports zero grace and after-end scans", () => {
	const start = new Date("2026-10-12T06:00:00Z");
	for (const [delta, expected] of [
		[-1, "EARLY"],
		[0, "ON_TIME"],
		[900000, "ON_TIME"],
		[900001, "LATE"],
		[7200000, "LATE"],
	] as const)
		expect(classifyTiming(new Date(start.getTime() + delta), start, 15)).toBe(
			expected,
		);
	expect(classifyTiming(start, start, 0)).toBe("ON_TIME");
	expect(classifyTiming(new Date(start.getTime() + 1), start, 0)).toBe("LATE");
});
test("payload accepts only token and location, never identity/role/time or invalid numbers", () => {
	const input = { qrToken: "resora:v1:test", location };
	expect(checkInSchema.safeParse(input).success).toBe(true);
	for (const key of ["userId", "nim", "role", "attendanceAt", "sessionId"])
		expect(checkInSchema.safeParse({ ...input, [key]: "forged" }).success).toBe(
			false,
		);
	expect(
		checkInSchema.safeParse({
			...input,
			location: { ...location, timestamp: 1 },
		}).success,
	).toBe(false);
	expect(
		checkInSchema.safeParse({
			...input,
			location: { ...location, latitude: Number.POSITIVE_INFINITY },
		}).success,
	).toBe(false);
});

// Small query double exercises service branches and actual QR verification, not PostgreSQL semantics.
// Database UNIQUE/FK/trigger enforcement and concurrent transactions remain an explicit review/UAT gate.
function fixture() {
	const sessionId = randomUUID();
	const eventId = randomUUID();
	const challengeId = randomUUID();
	const secret = "synthetic-phase5-signing-secret-only-0000000000";
	const now = Date.now();
	const state = {
		event: {
			id: eventId,
			title: "Synthetic event",
			status: "PUBLISHED",
			startsAt: new Date(now - 7200000),
			endsAt: new Date(now - 1000),
		},
		session: {
			id: sessionId,
			internalEventId: eventId,
			status: "ACTIVE",
			centerLat: 0,
			centerLng: 0,
			geofenceRadiusM: 20,
			lateGraceMinutes: 15,
		},
		challenge: {
			id: challengeId,
			sessionId,
			isCurrent: true,
			revokedAt: null as Date | null,
			activatedAt: new Date(now - 1000),
			expiresAt: new Date(now + 3600000),
		},
		eligible: true,
		mustChange: false,
		invited: true,
		invalidAssignment: false,
		record: null as {
			attendanceAt: Date;
			timingClass: "EARLY" | "ON_TIME" | "LATE";
		} | null,
		writes: [] as Record<string, unknown>[],
		locks: [] as string[],
		recordReads: 0,
		conflict: false,
	};
	const identity: ActiveSrIdentity = {
		userId: "synthetic-sr",
		actor: "SR",
		isActive: true,
		mustChangePassword: false,
		nim: "0000000001",
		departmentCode: "HCO",
		positionCode: "ANGGOTA",
		buildingId: randomUUID(),
		isSuperadmin: false,
	};
	const double = {
		transaction: async (run: (tx: unknown) => Promise<unknown>) => run(double),
		select: () => {
			let table = "";
			let joined = false;
			const query = {
				from: (value: Parameters<typeof getTableName>[0]) => {
					table = getTableName(value);
					return query;
				},
				where: () => query,
				innerJoin: () => {
					joined = true;
					return query;
				},
				for: (lock: string) => {
					state.locks.push(`${table}:${lock}`);
					return query;
				},
				// biome-ignore lint/suspicious/noThenProperty: Drizzle query builders are intentionally awaitable; this offline double mirrors that contract.
				then: (resolve: (rows: unknown[]) => unknown) => {
					let rows: unknown[] = [];
					if (table === "attendance_sessions")
						rows = [{ ...state.session, eventId }];
					if (table === "events") rows = [state.event];
					if (table === "user_profiles" && state.eligible)
						rows = [
							{
								...identity,
								name: "Synthetic SR",
								buildingCode: "A",
								buildingName: "Gedung A",
								positionCode: state.invalidAssignment ? "KETUM" : "ANGGOTA",
								mustChangePassword: state.mustChange,
							},
						];
					if (table === "event_participants" && state.invited)
						rows = [{ userId: identity.userId }];
					if (table === "qr_challenges")
						rows = joined
							? state.challenge.sessionId === state.session.id
								? [
										{
											challenge: state.challenge,
											event: state.event,
											session: state.session,
										},
									]
								: []
							: [state.challenge];
					if (table === "attendance_records") {
						state.recordReads++;
						rows = state.record ? [state.record] : [];
					}
					return Promise.resolve(rows).then(resolve);
				},
			};
			return query;
		},
		insert: () => ({
			values: (data: Record<string, unknown>) => ({
				onConflictDoNothing: () => ({
					returning: async () => {
						if (state.conflict) {
							state.record = {
								attendanceAt: new Date(now - 5000),
								timingClass: "EARLY",
							};
							return [];
						}
						state.writes.push(data);
						state.record = {
							attendanceAt: data.attendanceAt as Date,
							timingClass: data.timingClass as "EARLY",
						};
						return [state.record];
					},
				}),
			}),
		}),
	};
	const db = double as unknown as Database;
	const input = {
		qrToken: signChallenge(secret, sessionId, challengeId),
		location: { ...location },
	};
	return { state, identity, db, secret, input };
}
async function failure(operation: Promise<unknown>, message: string) {
	let rejected = false;
	try {
		await operation;
	} catch (error) {
		rejected = true;
		expect(error instanceof Error && error.message).toBe(message);
	}
	expect(rejected).toBe(true);
}
test("actual QR verifier accepts activation boundary but rejects exact expiry boundary", async () => {
	const f = fixture();
	const input = { sessionId: f.state.session.id, token: f.input.qrToken };
	expect(
		await verifySessionChallenge(
			f.db,
			f.secret,
			input,
			f.state.challenge.activatedAt,
		),
	).not.toBeNull();
	expect(
		await verifySessionChallenge(
			f.db,
			f.secret,
			input,
			f.state.challenge.expiresAt,
		),
	).toBeNull();
});
test("Phase 4 directory keeps its original DTO without the internal password gate flag", async () => {
	const f = fixture();
	const directory = await getActiveSrDirectory(f.db);
	expect(directory.candidates).toHaveLength(1);
	expect(directory.candidates[0]).not.toHaveProperty("mustChangePassword");
});
test("valid synthetic QR saves server time/GPS, ignores scheduled end and returns explicit safe DTO", async () => {
	const f = fixture();
	const before = Date.now();
	const result = await checkIn(f.db, f.identity, f.secret, {
		...f.input,
		location: { ...location, accuracyMeters: 40 },
	});
	expect(result.status).toBe("CHECKED_IN");
	expect(Object.keys(result).sort()).toEqual([
		"attendanceAt",
		"eventName",
		"status",
		"timingClass",
	]);
	expect(result.attendanceAt.getTime()).toBeGreaterThanOrEqual(before);
	expect(result.attendanceAt.getTime()).toBeLessThanOrEqual(Date.now());
	expect(f.state.writes[0]).toMatchObject({
		source: "QR",
		recordedByUserId: f.identity.userId,
		scanLat: 0,
		scanLng: 0,
		gpsAccuracyM: 40,
	});
	expect(f.state.locks).toEqual([
		"events:update",
		"attendance_sessions:update",
		"user_profiles:share",
	]);
});
test("valid duplicate and conflict fallback return original result without any update", async () => {
	const f = fixture();
	const first = await checkIn(f.db, f.identity, f.secret, f.input);
	const second = await checkIn(f.db, f.identity, f.secret, {
		...f.input,
		location: { ...location, accuracyMeters: 10 },
	});
	expect(second.status).toBe("ALREADY_CHECKED_IN");
	expect(second.attendanceAt).toEqual(first.attendanceAt);
	expect(f.state.writes).toHaveLength(1);
	expect(f.state.writes[0]?.gpsAccuracyM).toBe(20);
	const conflict = fixture();
	conflict.state.conflict = true;
	expect(
		(
			await checkIn(
				conflict.db,
				conflict.identity,
				conflict.secret,
				conflict.input,
			)
		).status,
	).toBe("ALREADY_CHECKED_IN");
	expect(conflict.state.writes).toHaveLength(0);
});
test("invalid QR never reaches transaction or reveals existing attendance", async () => {
	const f = fixture();
	for (const token of [
		"malformed",
		`${f.input.qrToken.slice(0, -1)}x`,
		f.input.qrToken.replace(f.state.session.id, randomUUID()),
	]) {
		await failure(
			checkIn(f.db, f.identity, f.secret, { ...f.input, qrToken: token }),
			"INVALID_QR",
		);
	}
	expect(f.state.recordReads).toBe(0);
});
test("closed/inactive/revoked/replaced/expired/future QR reject before duplicate lookup", async () => {
	for (const kind of [
		"closed",
		"inactive",
		"revoked",
		"replaced",
		"expired",
		"future",
		"cross-session",
	] as const) {
		const f = fixture();
		f.state.record = { attendanceAt: new Date(), timingClass: "EARLY" };
		const expected =
			kind === "closed"
				? "SESSION_CLOSED"
				: kind === "inactive"
					? "SESSION_INACTIVE"
					: kind === "expired"
						? "QR_EXPIRED"
						: kind === "revoked" || kind === "replaced"
							? "QR_REVOKED"
							: "INVALID_QR";
		if (kind === "closed") f.state.session.status = "CLOSED";
		if (kind === "inactive") f.state.session.status = "INACTIVE";
		if (kind === "revoked") f.state.challenge.revokedAt = new Date();
		if (kind === "replaced") f.state.challenge.isCurrent = false;
		if (kind === "expired")
			f.state.challenge.expiresAt = new Date(Date.now() - 1);
		if (kind === "future")
			f.state.challenge.activatedAt = new Date(Date.now() + 10000);
		if (kind === "cross-session") f.state.challenge.sessionId = randomUUID();
		await failure(checkIn(f.db, f.identity, f.secret, f.input), expected);
		expect(f.state.recordReads).toBe(0);
		expect(f.state.writes).toHaveLength(0);
	}
});
test("live inactive/invalid assignment/first-change/not-invited identities are denied", async () => {
	for (const kind of [
		"inactive",
		"assignment",
		"password",
		"invitation",
	] as const) {
		const f = fixture();
		if (kind === "inactive") f.state.eligible = false;
		if (kind === "assignment") f.state.invalidAssignment = true;
		if (kind === "password") f.state.mustChange = true;
		if (kind === "invitation") f.state.invited = false;
		await failure(
			checkIn(f.db, f.identity, f.secret, f.input),
			kind === "invitation" ? "NOT_INVITED" : "NOT_ELIGIBLE",
		);
		expect(f.state.recordReads).toBe(0);
		expect(f.state.writes).toHaveLength(0);
	}
	const f = fixture();
	await failure(
		checkIn(f.db, { ...f.identity, isActive: false }, f.secret, f.input),
		"NOT_ELIGIBLE",
	);
});
test("geofence/accuracy failure never writes or exposes an existing record", async () => {
	for (const [data, expected] of [
		[{ ...location, accuracyMeters: 40.001 }, "GPS_INACCURATE"],
		[{ ...location, longitude: 1 }, "OUTSIDE_GEOFENCE"],
	] as const) {
		const f = fixture();
		await failure(
			checkIn(f.db, f.identity, f.secret, { ...f.input, location: data }),
			expected,
		);
		expect(f.state.recordReads).toBe(0);
		expect(f.state.writes).toHaveLength(0);
	}
});
test("actual protected tRPC mutation rejects unauthenticated sessions before data access", async () => {
	const f = fixture();
	const caller = appRouter.createCaller({
		db: f.db,
		session: null,
		qrSigningSecret: f.secret,
	});
	await failure(caller.attendance.checkIn(f.input), "Authentication required");
	expect(f.state.locks).toHaveLength(0);
});
test("record schema/migration is additive, unique, numeric and immutable-origin aware", () => {
	const config = getTableConfig(attendanceRecords);
	expect(config.uniqueConstraints[0]?.columns.map((c) => c.name)).toEqual([
		"session_id",
		"user_id",
	]);
	expect(config.foreignKeys).toHaveLength(3);
	for (const c of [
		attendanceRecords.scanLat,
		attendanceRecords.scanLng,
		attendanceRecords.gpsAccuracyM,
	]) {
		expect(c.getSQLType()).toBe("double precision");
		expect(c.notNull).toBe(false);
	}
	const root = join(import.meta.dir, "../../../../db/src/migrations");
	const directory = readdirSync(root).find((name) =>
		name.endsWith("_phase5_checkin"),
	);
	if (!directory) throw new Error("Missing Phase 5 migration");
	const sql = readFileSync(join(root, directory, "migration.sql"), "utf8");
	expect([...sql.matchAll(/CREATE TABLE "([^"]+)"/g)].map((m) => m[1])).toEqual(
		["attendance_records"],
	);
	expect(sql).not.toMatch(/\b(DROP|TRUNCATE|DELETE)\b/);
	expect(sql).toContain("'Infinity'::double precision");
	expect(sql).toContain("NEW.recorded_at IS DISTINCT FROM OLD.recorded_at");
	expect(sql).toContain("NEW.source IS DISTINCT FROM OLD.source");
});
