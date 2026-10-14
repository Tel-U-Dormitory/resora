import { expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ActiveSrIdentity } from "@resora/auth/sr-access";
import type { Database } from "@resora/db";
import { attendanceAuditLogs } from "@resora/db/schema/attendance";
import { getTableName, type SQL } from "drizzle-orm";
import { getTableConfig, PgDialect } from "drizzle-orm/pg-core";
import { appRouter } from "../../routers";
import {
	eventDraftSchema,
	manualCorrectSchema,
	manualInsertSchema,
	ownHistorySchema,
	rosterSchema,
} from "./attendance.schema";
import { manualCorrect, manualInsert } from "./manual-attendance";
import { auditHistory, exportCsv, ownHistory, recap } from "./reporting";
import {
	attendanceCsv,
	auditState,
	classifyTiming,
	lateMinutes,
	manualEffectiveTime,
	presence,
	reportAttendance,
} from "./reporting-policy";

const start = new Date("2026-10-12T06:00:00Z");
const now = new Date("2026-10-12T09:00:00Z");
test("presence derives from record and explicit closure, never end/QR expiry", () => {
	for (const state of ["PUBLISHED", "CLOSED"])
		expect(presence(true, state)).toBe("PRESENT");
	expect(presence(false, "PUBLISHED")).toBe("PENDING");
	expect(presence(false, "CLOSED")).toBe("ABSENT");
});
test("timing and lateness use inclusive grace and ceil after grace; missing is null", () => {
	for (const [delta, expected, minutes] of [
		[-1, "EARLY", 0],
		[0, "ON_TIME", 0],
		[900000, "ON_TIME", 0],
		[900001, "LATE", 1],
		[960000, "LATE", 1],
		[960001, "LATE", 2],
	] as const) {
		const date = new Date(start.getTime() + delta);
		expect(classifyTiming(date, start, 15)).toBe(expected);
		expect(lateMinutes(date, start, 15)).toBe(minutes);
	}
	expect(lateMinutes(null, start, 15)).toBeNull();
});
test("manual time accepts published INACTIVE/ACTIVE and closed backdates, not future/after close/draft", () => {
	for (const status of ["INACTIVE", "ACTIVE"])
		expect(
			manualEffectiveTime(
				{ status: "PUBLISHED", closedAt: null },
				status,
				undefined,
				now,
			),
		).toEqual(now);
	const closedAt = new Date(now.getTime() - 1000);
	expect(
		manualEffectiveTime(
			{ status: "CLOSED", closedAt },
			"CLOSED",
			closedAt.toISOString(),
			now,
		),
	).toEqual(closedAt);
	expect(
		manualEffectiveTime(
			{ status: "CLOSED", closedAt },
			"CLOSED",
			new Date(start.getTime() - 86400000).toISOString(),
			now,
		),
	).toBeInstanceOf(Date);
	for (const [event, session, requested, message] of [
		[
			{ status: "DRAFT", closedAt: null },
			"INACTIVE",
			undefined,
			"MANUAL_LIFECYCLE_INVALID",
		],
		[
			{ status: "PUBLISHED", closedAt: null },
			"CLOSED",
			undefined,
			"MANUAL_LIFECYCLE_INVALID",
		],
		[
			{ status: "CLOSED", closedAt },
			"CLOSED",
			undefined,
			"CLOSED_EFFECTIVE_TIME_REQUIRED",
		],
		[
			{ status: "CLOSED", closedAt },
			"CLOSED",
			now.toISOString(),
			"ATTENDANCE_AFTER_CLOSURE",
		],
		[
			{ status: "PUBLISHED", closedAt: null },
			"ACTIVE",
			new Date(now.getTime() + 1).toISOString(),
			"ATTENDANCE_TIME_INVALID",
		],
	] as const)
		expect(() => manualEffectiveTime(event, session, requested, now)).toThrow(
			message,
		);
});
test("strict inputs reject missing/blank reasons, invalid dates and client history authority", () => {
	const base = { eventId: randomUUID(), userId: "synthetic", reason: "valid" };
	for (const reason of [undefined, "", " \t\n"])
		expect(manualInsertSchema.safeParse({ ...base, reason }).success).toBe(
			false,
		);
	expect(
		manualInsertSchema.safeParse({ ...base, attendanceAt: "invalid" }).success,
	).toBe(false);
	expect(
		manualCorrectSchema.safeParse({
			attendanceId: randomUUID(),
			reason: "reason",
		}).success,
	).toBe(false);
	expect(ownHistorySchema.safeParse({ userId: "other" }).success).toBe(false);
	expect(ownHistorySchema.safeParse({ limit: 101 }).success).toBe(false);
});
test("CSV escapes quotes/newlines and formula injection; NIM text preserves leading zeros without formulas", () => {
	const rows = [
		'=HYPERLINK("evil")',
		"+sum",
		"-2",
		"@evil",
		"  =evil",
		"\tevil",
		'Name, "quoted"\nnext',
	].map((name) => ({
		nim: "0000000001",
		name,
		departmentCode: "HCO",
		positionCode: "KADEP",
		buildingCode: "1",
		presence: "PRESENT",
		attendanceAt: start,
		timingClass: "ON_TIME" as const,
		lateMinutes: 0,
		source: "QR" as const,
	}));
	const csv = attendanceCsv(rows);
	expect(csv.startsWith("\uFEFFNIM,")).toBe(true);
	expect(csv).toContain('"\'0000000001"');
	expect(csv).toContain('"\'=HYPERLINK(""evil"")"');
	expect(csv).toContain('"\'  =evil"');
	expect(csv).toContain('"Name, ""quoted""\nnext"');
	expect(csv).toContain("2026-10-12 13:00:00 WIB");
	expect(csv).not.toContain('="0000000001"');
	const first = rows[0];
	if (!first) throw new Error("Missing synthetic CSV row");
	const missing = attendanceCsv([
		{
			...first,
			presence: "ABSENT",
			attendanceAt: null,
			timingClass: null,
			lateMinutes: null,
			source: null,
		},
	]);
	expect(missing).toContain('"ABSENT",,,,\r\n');
});
test("safe report/audit projection excludes origin/GPS even on QR records", () => {
	const record = {
		id: randomUUID(),
		attendanceAt: start,
		timingClass: "ON_TIME" as const,
		source: "QR" as const,
		scanLat: 1,
		recordedByUserId: "private",
	};
	expect(Object.keys(auditState(record)).sort()).toEqual([
		"attendanceAt",
		"timingClass",
	]);
	expect(reportAttendance(record, "CLOSED", start, 15)).not.toHaveProperty(
		"scanLat",
	);
	expect(reportAttendance(null, "CLOSED", start, 15)).toMatchObject({
		presence: "ABSENT",
		attendanceAt: null,
		lateMinutes: null,
		source: null,
	});
});

// Offline query double exercises actual services, Identity public reads and transaction rollback.
// It does not prove PostgreSQL lock/trigger behavior; real Phase 6 integration needs separate approval.
function fixture() {
	const identity: ActiveSrIdentity = {
		userId: "synthetic-operator",
		actor: "SR",
		isActive: true,
		mustChangePassword: false,
		nim: "0000000001",
		departmentCode: "HCO",
		positionCode: "KADEP",
		buildingId: randomUUID(),
		isSuperadmin: false,
	};
	const event = {
		id: randomUUID(),
		title: "Synthetic",
		status: "PUBLISHED",
		startsAt: start,
		closedAt: null as Date | null,
		rosterCriteria: rosterSchema.parse({ allSr: true }),
	};
	const session = {
		id: randomUUID(),
		internalEventId: event.id,
		status: "ACTIVE",
		lateGraceMinutes: 15,
		qrTtlMinutes: 360,
	};
	const original = {
		id: randomUUID(),
		sessionId: session.id,
		userId: "synthetic-target",
		attendanceAt: start,
		timingClass: "ON_TIME" as "EARLY" | "ON_TIME" | "LATE",
		recordedAt: new Date(start.getTime() + 1000),
		recordedByUserId: "synthetic-target",
		source: "QR",
		manualReason: null,
		scanLat: 0,
		scanLng: 0,
		gpsAccuracyM: 10,
		updatedAt: start,
	};
	const state = {
		record: null as Record<string, unknown> | null,
		qr: null as Record<string, unknown> | null,
		audits: [] as Record<string, unknown>[],
		targetActive: true,
		operatorActive: true,
		operatorPosition: "KADEP",
		superadmin: false,
		revokeOnEventLock: false,
		invited: true,
		auditFailure: false,
		conflict: false,
		locks: [] as string[],
		filters: [] as { table: string; params: unknown[] }[],
		writes: [] as { table: string; data: Record<string, unknown> }[],
		reports: [] as unknown[],
	};
	const double = {
		transaction: async (run: (tx: unknown) => Promise<unknown>) => {
			const saved = structuredClone({
				record: state.record,
				audits: state.audits,
			});
			try {
				return await run(double);
			} catch (error) {
				state.record = saved.record;
				state.audits = saved.audits;
				throw error;
			}
		},
		select: (selection?: Record<string, unknown>) => {
			let table = "";
			let joined = false;
			let params: unknown[] = [];
			const query = {
				from: (value: Parameters<typeof getTableName>[0]) => {
					table = getTableName(value);
					return query;
				},
				innerJoin: () => {
					joined = true;
					return query;
				},
				leftJoin: () => query,
				where: (sql: SQL) => {
					params = new PgDialect().sqlToQuery(sql).params;
					state.filters.push({ table, params });
					return query;
				},
				for: (mode: string) => {
					state.locks.push(`${table}:${mode}`);
					if (table === "events" && state.revokeOnEventLock)
						state.superadmin = false;
					return query;
				},
				orderBy: () => query,
				limit: () => query,
				offset: () => query,
				// biome-ignore lint/suspicious/noThenProperty: Drizzle queries are awaitable; this mirrors their test contract.
				then: (resolve: (rows: unknown[]) => unknown) => {
					let rows: unknown[] = [];
					if (table === "events")
						rows = selection?.event ? [{ event, session }] : [event];
					if (table === "attendance_sessions") rows = [session];
					if (table === "qr_challenges") rows = state.qr ? [state.qr] : [];
					if (table === "system_privileges" && state.superadmin)
						rows = [{ userId: identity.userId }];
					if (table === "attendance_records")
						rows = joined
							? [{ eventId: event.id }]
							: state.record
								? [state.record]
								: [];
					if (table === "event_participants")
						rows =
							joined || selection?.participant
								? state.reports
								: state.invited
									? [{ userId: "synthetic-target" }]
									: [];
					if (table === "attendance_audit_logs")
						rows = state.audits.map((audit) => ({
							...audit,
							operator: "Synthetic HCO",
							before: audit.beforeState,
							after: audit.afterState,
						}));
					if (table === "user_profiles") {
						const operator = params.includes(identity.userId);
						if (operator ? state.operatorActive : state.targetActive)
							rows = [
								{
									...identity,
									userId: operator ? identity.userId : "synthetic-target",
									name: "Synthetic",
									positionCode: operator ? state.operatorPosition : "ANGGOTA",
									departmentCode: operator ? identity.departmentCode : "HCO",
									isSuperadmin: operator && state.superadmin,
									buildingCode: "A",
									buildingName: "Gedung A",
								},
							];
					}
					return Promise.resolve(rows).then(resolve);
				},
			};
			return query;
		},
		insert: (table: Parameters<typeof getTableName>[0]) => ({
			values: (data: Record<string, unknown>) => {
				const name = getTableName(table);
				const insert = async () => {
					if (name === "attendance_audit_logs") {
						if (state.auditFailure) throw new Error("synthetic audit failure");
						state.audits.push({ id: randomUUID(), ...data });
					} else if (name !== "attendance_records") {
						if (name === "qr_challenges")
							state.qr = {
								id: randomUUID(),
								isCurrent: true,
								revokedAt: null,
								...data,
							};
						state.writes.push({ table: name, data });
						return name === "events" ? [{ ...event, ...data }] : [];
					} else {
						if (state.conflict) return [];
						state.record = {
							id: randomUUID(),
							...data,
							scanLat: null,
							scanLng: null,
							gpsAccuracyM: null,
						};
					}
					state.writes.push({ table: name, data });
					return state.record ? [state.record] : [];
				};
				return {
					returning: insert,
					onConflictDoNothing: () => ({ returning: insert }),
					// biome-ignore lint/suspicious/noThenProperty: Drizzle insert builders are awaitable in this query double.
					then: (
						resolve: (value: unknown) => unknown,
						reject: (error: unknown) => unknown,
					) => insert().then(resolve, reject),
				};
			},
		}),
		update: (table: Parameters<typeof getTableName>[0]) => ({
			set: (data: Record<string, unknown>) => ({
				where: async () => {
					state.writes.push({ table: getTableName(table), data });
					const name = getTableName(table);
					if (name === "events") Object.assign(event, data);
					else if (name === "attendance_sessions") Object.assign(session, data);
					else if (name === "qr_challenges")
						Object.assign(state.qr ?? {}, data);
					else state.record = { ...state.record, ...data };
				},
			}),
		}),
	};
	return {
		db: double as unknown as Database,
		state,
		identity,
		event,
		session,
		original,
		input: {
			eventId: event.id,
			userId: "synthetic-target",
			reason: "Synthetic reason",
			attendanceAt: start.toISOString(),
		},
		correction: {
			attendanceId: original.id,
			attendanceAt: new Date(start.getTime() + 900001).toISOString(),
			reason: "Synthetic correction",
		},
	};
}
test("KADEP HCO inserts MANUAL and audit atomically without GPS, lock event then session", async () => {
	const f = fixture();
	const result = await manualInsert(f.db, f.identity, f.input);
	expect(result.timingClass).toBe("ON_TIME");
	expect(f.state.locks.slice(0, 2)).toEqual([
		"events:update",
		"attendance_sessions:update",
	]);
	expect(f.state.record).toMatchObject({
		source: "MANUAL",
		recordedByUserId: f.identity.userId,
		manualReason: f.input.reason,
		scanLat: null,
	});
	expect(f.state.audits[0]).toMatchObject({
		action: "MANUAL_CREATED",
		beforeState: null,
		actorUserId: f.identity.userId,
		afterState: { attendanceAt: f.input.attendanceAt, timingClass: "ON_TIME" },
	});
});
test("correction uses snapshot for inactive target, keeps every origin/GPS field and audits before/after", async () => {
	const f = fixture();
	f.state.record = { ...f.original };
	f.state.targetActive = false;
	await manualCorrect(f.db, f.identity, f.correction);
	expect(f.state.writes[0]?.data).toEqual({
		attendanceAt: new Date(f.correction.attendanceAt),
		timingClass: "LATE",
		updatedAt: expect.any(Date),
	});
	for (const field of [
		"source",
		"recordedAt",
		"recordedByUserId",
		"manualReason",
		"scanLat",
		"scanLng",
		"gpsAccuracyM",
	])
		expect(f.state.record?.[field]).toEqual(
			f.original[field as keyof typeof f.original],
		);
	expect(f.state.audits[0]).toMatchObject({
		action: "ATTENDANCE_CORRECTED",
		beforeState: auditState(f.original),
		afterState: {
			attendanceAt: f.correction.attendanceAt,
			timingClass: "LATE",
		},
	});
	expect(f.state.locks.filter((lock) => lock.endsWith(":update"))).toEqual([
		"events:update",
		"attendance_sessions:update",
		"attendance_records:update",
	]);
});
test("audit insert failure rolls back both manual insert and correction", async () => {
	for (const correction of [false, true]) {
		const f = fixture();
		f.state.auditFailure = true;
		if (correction) f.state.record = { ...f.original };
		await expect(
			correction
				? manualCorrect(f.db, f.identity, f.correction)
				: manualInsert(f.db, f.identity, f.input),
		).rejects.toThrow("synthetic audit failure");
		expect(f.state.record).toEqual(correction ? f.original : null);
		expect(f.state.audits).toHaveLength(0);
	}
});
test("manual insert rejects duplicate QR/manual and raced unique conflict instead of overwriting", async () => {
	for (const source of ["QR", "MANUAL"]) {
		const f = fixture();
		f.state.record = { ...f.original, source };
		await expect(manualInsert(f.db, f.identity, f.input)).rejects.toThrow(
			"ATTENDANCE_ALREADY_RECORDED",
		);
		expect(f.state.writes).toHaveLength(0);
	}
	const f = fixture();
	f.state.conflict = true;
	await expect(manualInsert(f.db, f.identity, f.input)).rejects.toThrow(
		"ATTENDANCE_ALREADY_RECORDED",
	);
	expect(f.state.audits).toHaveLength(0);
});
test("manual target inactive or missing snapshot denied; live operator deactivation/reassignment denied", async () => {
	for (const flag of ["targetActive", "invited", "operatorActive"] as const) {
		const f = fixture();
		f.state[flag] = false;
		await expect(manualInsert(f.db, f.identity, f.input)).rejects.toThrow(
			flag === "invited"
				? "NOT_INVITED"
				: flag === "targetActive"
					? "MANUAL_TARGET_INACTIVE_OR_INELIGIBLE"
					: "MANUAL_ACCESS_REQUIRED",
		);
		expect(f.state.record).toBeNull();
	}
	const f = fixture();
	f.state.operatorPosition = "ANGGOTA";
	await expect(manualInsert(f.db, f.identity, f.input)).rejects.toThrow(
		"MANUAL_ACCESS_REQUIRED",
	);
});
test("closed event insertion/correction needs effective time no later than closure and cannot reactivate", async () => {
	const f = fixture();
	f.event.status = "CLOSED";
	f.event.closedAt = new Date(start.getTime() + 1000);
	f.session.status = "CLOSED";
	await expect(
		manualInsert(f.db, f.identity, { ...f.input, attendanceAt: undefined }),
	).rejects.toThrow("CLOSED_EFFECTIVE_TIME_REQUIRED");
	await manualInsert(f.db, f.identity, f.input);
	expect(f.event.status).toBe("CLOSED");
	expect(f.session.status).toBe("CLOSED");
	await expect(manualCorrect(f.db, f.identity, f.correction)).rejects.toThrow(
		"ATTENDANCE_AFTER_CLOSURE",
	);
	expect(f.state.audits).toHaveLength(1);
});
test("unprivileged HCO member can recap/export but never manual/audit; non-HCO stays denied", async () => {
	const f = fixture();
	for (const departmentCode of ["HCO", "ADAPTIF", "RND", "SOSIAL"]) {
		const identity = {
			...f.identity,
			departmentCode,
			positionCode: departmentCode === "HCO" ? "ANGGOTA" : "KADEP",
			isSuperadmin: false,
		};
		await expect(manualInsert(f.db, identity, f.input)).rejects.toThrow(
			"MANUAL_ACCESS_REQUIRED",
		);
		await expect(manualCorrect(f.db, identity, f.correction)).rejects.toThrow(
			"MANUAL_ACCESS_REQUIRED",
		);
		await expect(
			auditHistory(f.db, identity, {
				eventId: f.event.id,
				userId: "synthetic-target",
			}),
		).rejects.toThrow();
		if (departmentCode === "HCO") {
			expect((await recap(f.db, identity, f.event.id)).canManual).toBe(false);
			expect((await exportCsv(f.db, identity, f.event.id)).content).toContain(
				"NIM,Name",
			);
		} else {
			await expect(recap(f.db, identity, f.event.id)).rejects.toThrow();
			await expect(exportCsv(f.db, identity, f.event.id)).rejects.toThrow();
		}
	}
});
test("recap starts at historical snapshots including missing records; origin/GPS omitted", async () => {
	const f = fixture();
	const participant = {
		userId: "synthetic-target",
		nim: "0000000002",
		name: "Historical name",
		departmentCode: "INTI",
		positionCode: "KETUM",
		buildingCode: "B",
		buildingName: "Gedung B",
	};
	f.state.reports = [
		{ participant, record: f.original },
		{
			participant: { ...participant, userId: "absent", nim: "0000000003" },
			record: null,
		},
	];
	let report = await recap(f.db, f.identity, f.event.id);
	expect(report.counts).toEqual({
		invited: 2,
		present: 1,
		pending: 1,
		absent: 0,
	});
	expect(report.participants[0]).toMatchObject(participant);
	f.event.status = "CLOSED";
	report = await recap(f.db, f.identity, f.event.id);
	expect(report.counts.absent).toBe(1);
	expect(report.participants[1]?.lateMinutes).toBeNull();
	expect(report.participants[0]).not.toHaveProperty("scanLat");
});

for (const [departmentCode, positionCode] of [
	["RND", "ANGGOTA"],
	["INTI", "KETUM"],
] as const)
	test(`tRPC SUPERADMIN ${departmentCode}/${positionCode} creates events and performs manual/correction/audit/recap/export`, async () => {
		const f = fixture();
		Object.assign(f.identity, { departmentCode, positionCode });
		f.state.operatorPosition = positionCode;
		f.state.superadmin = true;
		const caller = appRouter.createCaller({
			db: f.db,
			session: { user: { id: f.identity.userId } } as never,
		});
		const draft = eventDraftSchema.parse({
			title: "Synthetic SA-01 draft",
			startsAt: start.toISOString(),
			endsAt: new Date(start.getTime() + 3600000).toISOString(),
			rosterCriteria: { allSr: true },
			session: { centerLat: 0, centerLng: 0 },
		});
		expect(await caller.attendance.create(draft)).toEqual({
			eventId: f.event.id,
		});
		expect(
			f.state.writes.find((write) => write.table === "events")?.data,
		).toMatchObject({ createdByUserId: f.identity.userId });
		await caller.attendance.manualInsert(f.input);
		const recordId = f.state.record?.id;
		if (typeof recordId !== "string")
			throw new Error("Missing synthetic record");
		const origin = { ...f.state.record };
		await caller.attendance.manualCorrect({
			...f.correction,
			attendanceId: recordId,
		});
		expect(f.state.record).toMatchObject({
			source: "MANUAL",
			recordedAt: origin.recordedAt,
			recordedByUserId: f.identity.userId,
			manualReason: f.input.reason,
		});
		expect(f.state.audits.map((audit) => audit.actorUserId)).toEqual([
			f.identity.userId,
			f.identity.userId,
		]);
		expect(
			(
				await caller.attendance.auditHistory({
					eventId: f.event.id,
					userId: f.input.userId,
				})
			).items,
		).toHaveLength(2);
		expect(
			(await caller.attendance.recap({ eventId: f.event.id })).canManual,
		).toBe(true);
		expect(
			(await caller.attendance.exportCsv({ eventId: f.event.id })).content,
		).toContain("NIM,Name");
		expect(f.identity).toMatchObject({ departmentCode, positionCode });
		expect(f.state.locks).toContain("system_privileges:share");
	});

test("same tRPC session loses operational access on the request after DB privilege revocation", async () => {
	const f = fixture();
	Object.assign(f.identity, { departmentCode: "RND", positionCode: "ANGGOTA" });
	f.state.operatorPosition = "ANGGOTA";
	f.state.superadmin = true;
	const caller = appRouter.createCaller({
		db: f.db,
		session: { user: { id: f.identity.userId } } as never,
	});
	expect((await caller.identity.session())?.canManageInternalEvents).toBe(true);
	await caller.attendance.manualInsert(f.input);
	const writes = f.state.writes.length;
	f.state.superadmin = false;
	expect(await caller.identity.session()).toMatchObject({
		isSuperadmin: false,
		canManageInternalEvents: false,
	});
	await expect(caller.attendance.manualInsert(f.input)).rejects.toThrow(
		"MANUAL_ACCESS_REQUIRED",
	);
	await expect(
		caller.attendance.recap({ eventId: f.event.id }),
	).rejects.toThrow();
	await expect(
		caller.attendance.auditHistory({
			eventId: f.event.id,
			userId: f.input.userId,
		}),
	).rejects.toThrow();
	expect(f.state.writes).toHaveLength(writes);
});

test("tRPC SUPERADMIN correction preserves QR origin/GPS and records the actual operator", async () => {
	const f = fixture();
	Object.assign(f.identity, { departmentCode: "RND", positionCode: "ANGGOTA" });
	f.state.operatorPosition = "ANGGOTA";
	f.state.superadmin = true;
	f.state.record = { ...f.original };
	f.state.targetActive = false;
	const caller = appRouter.createCaller({
		db: f.db,
		session: { user: { id: f.identity.userId } } as never,
	});
	await caller.attendance.manualCorrect(f.correction);
	for (const field of [
		"source",
		"recordedAt",
		"recordedByUserId",
		"manualReason",
		"scanLat",
		"scanLng",
		"gpsAccuracyM",
	] as const)
		expect(f.state.record?.[field]).toEqual(f.original[field]);
	expect(f.state.audits[0]).toMatchObject({
		actorUserId: f.identity.userId,
		beforeState: auditState(f.original),
		afterState: {
			attendanceAt: f.correction.attendanceAt,
			timingClass: "LATE",
		},
	});
});

test("tRPC non-HCO SUPERADMIN can publish, manage QR and close while preserving lifecycle restrictions", async () => {
	const f = fixture();
	Object.assign(f.identity, {
		departmentCode: "SOSIAL",
		positionCode: "ANGGOTA",
	});
	f.state.operatorPosition = "ANGGOTA";
	f.state.superadmin = true;
	f.event.status = "DRAFT";
	f.session.status = "INACTIVE";
	const caller = appRouter.createCaller({
		db: f.db,
		session: { user: { id: f.identity.userId } } as never,
		qrSigningSecret: "synthetic-sa01-qr-signing-secret-0000000000",
	});
	await expect(
		caller.attendance.activate({ eventId: f.event.id }),
	).rejects.toThrow("Event/session state");
	await caller.attendance.publish({ eventId: f.event.id });
	expect(f.event.status).toBe("PUBLISHED");
	expect(f.session.status).toBe("INACTIVE");
	await caller.attendance.activate({ eventId: f.event.id });
	expect(f.state.qr?.issuedByUserId).toBe(f.identity.userId);
	expect((await caller.attendance.qr({ eventId: f.event.id })).state).toBe(
		"ACTIVE",
	);
	await caller.attendance.revokeQr({ eventId: f.event.id });
	expect((await caller.attendance.qr({ eventId: f.event.id })).state).toBe(
		"REVOKED",
	);
	await caller.attendance.reissueQr({ eventId: f.event.id });
	expect((await caller.attendance.qr({ eventId: f.event.id })).state).toBe(
		"ACTIVE",
	);
	await caller.attendance.close({ eventId: f.event.id });
	expect(f.event.status).toBe("CLOSED");
	expect(f.session.status).toBe("CLOSED");
	await expect(
		caller.attendance.activate({ eventId: f.event.id }),
	).rejects.toThrow("Event/session state");
});

test("manual insert/correct and event writes re-read revoked SUPERADMIN after lifecycle lock waits", async () => {
	for (const operation of ["manualInsert", "manualCorrect", "close"] as const) {
		const f = fixture();
		Object.assign(f.identity, {
			departmentCode: "RND",
			positionCode: "ANGGOTA",
		});
		f.state.operatorPosition = "ANGGOTA";
		f.state.superadmin = true;
		f.state.revokeOnEventLock = true;
		if (operation === "manualCorrect") f.state.record = { ...f.original };
		const caller = appRouter.createCaller({
			db: f.db,
			session: { user: { id: f.identity.userId } } as never,
		});
		await expect(
			operation === "manualInsert"
				? caller.attendance.manualInsert(f.input)
				: operation === "manualCorrect"
					? caller.attendance.manualCorrect(f.correction)
					: caller.attendance.close({ eventId: f.event.id }),
		).rejects.toThrow(
			operation === "close" ? "HCO access required" : "MANUAL_ACCESS_REQUIRED",
		);
		expect(f.state.writes).toHaveLength(0);
		expect(f.state.audits).toHaveLength(0);
	}
});

test("SUPERADMIN cannot bypass draft lifecycle, target eligibility, invitation or effective time", async () => {
	for (const failure of ["draft", "target", "invitation", "future"] as const) {
		const f = fixture();
		Object.assign(f.identity, {
			departmentCode: "INTI",
			positionCode: "KETUM",
		});
		f.state.operatorPosition = "KETUM";
		f.state.superadmin = true;
		if (failure === "draft") f.event.status = "DRAFT";
		if (failure === "target") f.state.targetActive = false;
		if (failure === "invitation") f.state.invited = false;
		const caller = appRouter.createCaller({
			db: f.db,
			session: { user: { id: f.identity.userId } } as never,
		});
		await expect(
			caller.attendance.manualInsert({
				...f.input,
				attendanceAt:
					failure === "future"
						? new Date(Date.now() + 3600000).toISOString()
						: f.input.attendanceAt,
			}),
		).rejects.toThrow(
			{
				draft: "MANUAL_LIFECYCLE_INVALID",
				target: "MANUAL_TARGET_INACTIVE_OR_INELIGIBLE",
				invitation: "NOT_INVITED",
				future: "ATTENDANCE_TIME_INVALID",
			}[failure],
		);
		expect(f.state.writes).toHaveLength(0);
	}
});
test("own history uses session user filter and bounded pagination, never arbitrary userId", async () => {
	const f = fixture();
	f.state.reports = [
		{ event: f.event, grace: 15, record: null },
		{ event: f.event, grace: 15, record: f.original },
	];
	const result = await ownHistory(f.db, f.identity, { limit: 1, offset: 0 });
	expect(result.items).toHaveLength(1);
	expect(result.nextOffset).toBe(1);
	expect(
		f.state.filters.find((filter) => filter.table === "event_participants")
			?.params,
	).toContain(f.identity.userId);
	await expect(
		ownHistory(f.db, f.identity, { userId: "forged" } as never),
	).rejects.toThrow();
});
test("protected Phase 6 routes reject anonymous, inactive and password-change gated sessions", async () => {
	for (const route of [
		"manualInsert",
		"manualCorrect",
		"recap",
		"exportCsv",
		"ownHistory",
		"auditHistory",
	] as const) {
		const f = fixture();
		const caller = appRouter.createCaller({ db: f.db, session: null });
		const input =
			route === "manualInsert"
				? f.input
				: route === "manualCorrect"
					? f.correction
					: route === "ownHistory"
						? {}
						: route === "auditHistory"
							? { eventId: f.event.id, userId: "synthetic-target" }
							: { eventId: f.event.id };
		await expect(
			(caller.attendance[route] as (input: unknown) => Promise<unknown>)(input),
		).rejects.toThrow("Authentication required");
		expect(f.state.writes).toHaveLength(0);
	}
	for (const gate of ["inactive", "password"] as const) {
		const f = fixture();
		const query = {
			innerJoin: () => query,
			leftJoin: () => query,
			where: async () => [
				{
					...f.identity,
					isSuperadmin: true,
					isActive: gate !== "inactive",
					mustChangePassword: gate === "password",
				},
			],
		};
		const db = { select: () => ({ from: () => query }) } as unknown as Database;
		const caller = appRouter.createCaller({
			db,
			session: { user: { id: f.identity.userId } } as never,
		});
		await expect(caller.attendance.ownHistory({})).rejects.toThrow(
			gate === "inactive"
				? "Authentication required"
				: "PASSWORD_CHANGE_REQUIRED",
		);
	}
});
test("KADEP HCO initial-password flag permits manual writes; a live SUPERADMIN grant still gates", async () => {
	const f = fixture();
	f.identity.mustChangePassword = true;
	await manualInsert(f.db, f.identity, f.input);
	expect(f.state.audits).toHaveLength(1);
	await manualCorrect(f.db, f.identity, {
		...f.correction,
		attendanceId: f.state.record?.id as string,
	});
	expect(f.state.audits).toHaveLength(2);
	expect(f.state.audits[1]?.actorUserId).toBe(f.identity.userId);
	const privileged = fixture();
	privileged.identity.mustChangePassword = true;
	privileged.state.superadmin = true; // Re-read after event/session locks, not a stale request claim.
	await expect(
		manualInsert(privileged.db, privileged.identity, privileged.input),
	).rejects.toThrow();
	expect(privileged.state.record).toBeNull();
	expect(privileged.state.audits).toHaveLength(0);
});

test("audit schema/new migration preserve chain and enforce append-only, origin and binding", () => {
	const config = getTableConfig(attendanceAuditLogs);
	expect(config.foreignKeys).toHaveLength(4);
	expect(config.indexes).toHaveLength(2);
	expect(config.checks).toHaveLength(2);
	const sql = readFileSync(
		join(
			import.meta.dir,
			"../../../../db/src/migrations/20261012071912_phase6_reporting/migration.sql",
		),
		"utf8",
	);
	expect(
		[...sql.matchAll(/CREATE TABLE "([^"]+)"/g)].map((match) => match[1]),
	).toEqual(["attendance_audit_logs"]);
	expect(sql).toContain("BEFORE UPDATE OR DELETE");
	expect(sql).toContain("BEFORE TRUNCATE");
	expect(sql).toContain("original.session_id IS DISTINCT FROM NEW.session_id");
	for (const field of [
		"recorded_at",
		"source",
		"recorded_by_user_id",
		"manual_reason",
		"scan_lat",
		"scan_lng",
		"gps_accuracy_m",
		"session_id",
		"user_id",
	])
		expect(sql).toContain(`NEW.${field} IS DISTINCT FROM OLD.${field}`);
	expect(sql).toContain("state - 'attendanceAt' - 'timingClass'");
});

test("KADEP HCO audit history projects effective fields only, preserving initial MANUAL reason", async () => {
	const f = fixture();
	f.state.record = {
		...f.original,
		source: "MANUAL",
		manualReason: "Original reason",
		scanLat: null,
		scanLng: null,
		gpsAccuracyM: null,
	};
	await manualCorrect(f.db, f.identity, f.correction);
	expect(f.state.record?.manualReason).toBe("Original reason");
	const log = await auditHistory(f.db, f.identity, {
		eventId: f.event.id,
		userId: "synthetic-target",
	});
	expect(log.items).toHaveLength(1);
	expect(log.items[0]).toMatchObject({
		reason: f.correction.reason,
		before: { attendanceAt: f.original.attendanceAt.toISOString() },
		after: { timingClass: "LATE" },
	});
	expect(Object.keys(log.items[0] ?? {}).sort()).toEqual([
		"action",
		"after",
		"before",
		"createdAt",
		"id",
		"operator",
		"reason",
	]);
});

test("Phase 6 snapshot extends exactly the Phase 5 chain without altering existing DDL", () => {
	const root = join(import.meta.dir, "../../../../db/src/migrations");
	const previous = JSON.parse(
		readFileSync(
			join(root, "20261012032606_phase5_checkin/snapshot.json"),
			"utf8",
		),
	);
	const next = JSON.parse(
		readFileSync(
			join(root, "20261012071912_phase6_reporting/snapshot.json"),
			"utf8",
		),
	);
	expect(next.prevIds).toEqual([previous.id]);
	const retained = next.ddl.filter(
		(entry: { table?: string; name?: string }) =>
			entry.table !== "attendance_audit_logs" &&
			entry.name !== "attendance_audit_logs",
	);
	expect(
		retained.map((entry: unknown) => JSON.stringify(entry)).sort(),
	).toEqual(previous.ddl.map((entry: unknown) => JSON.stringify(entry)).sort());
});
