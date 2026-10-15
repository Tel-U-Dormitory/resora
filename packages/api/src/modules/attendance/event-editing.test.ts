import { expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import type { ActiveIdentity, ActiveSrIdentity } from "@resora/auth/sr-access";
import type { Database } from "@resora/db";
import {
	type EventEditAuditState,
	eventAuditLogs,
	type events,
} from "@resora/db/schema/attendance";
import { getTableName, type SQL } from "drizzle-orm";
import { getTableConfig, PgDialect } from "drizzle-orm/pg-core";
import { appRouter } from "../../routers";
import { advancedEventEditSchema, eventDraftSchema } from "./attendance.schema";
import {
	advancedEditEvent,
	editDraft,
	editMetadata,
	getEvent,
} from "./attendance.service";

// Actual services/public Identity queries with a rollback-capable offline DB double.
// This does not simulate PostgreSQL lock scheduling or enforce SQL triggers.
function fixture() {
	const eventId = randomUUID();
	const draft = eventDraftSchema.parse({
		title: "Original event",
		description: "Original description",
		startsAt: new Date(Date.now() + 3600000).toISOString(),
		endsAt: new Date(Date.now() + 7200000).toISOString(),
		rosterCriteria: { individuals: ["retained", "removed"] },
		session: { centerLat: -6.9, centerLng: 107.6 },
	});
	const state = {
		identity: {
			userId: "synthetic-admin",
			actor: "SYSTEM_ADMIN",
			username: "synthetic.admin",
			isActive: true,
			mustChangePassword: false,
			isSuperadmin: true,
		} as ActiveIdentity,
		event: {
			id: eventId,
			...draft,
			startsAt: new Date(draft.startsAt),
			endsAt: new Date(draft.endsAt),
			createdByUserId: "original-creator",
			status: "PUBLISHED",
			publishedAt: new Date(),
			closedAt: null,
			createdAt: new Date(),
			updatedAt: new Date(),
		} as typeof events.$inferSelect,
		session: {
			id: randomUUID(),
			internalEventId: eventId,
			...draft.session,
			status: "INACTIVE",
			activatedAt: null,
			closedAt: null,
		},
		participants: ["retained", "removed"].map((userId) => ({
			eventId,
			userId,
			nim: `000-${userId}`,
			name: "Historical name",
			departmentCode: "HCO",
			positionCode: "ANGGOTA",
			buildingCode: "A",
			buildingName: "Gedung A",
			invitedAt: new Date(1),
		})),
		directory: ["retained", "added"].map((userId) => ({
			userId,
			nim: `000-${userId}`,
			name: "Current name",
			departmentCode: "RND",
			positionCode: "ANGGOTA",
			buildingId: randomUUID(),
			buildingCode: "B",
			buildingName: "Gedung B",
		})),
		records: [] as {
			id: string;
			source: string;
			attendanceAt: Date;
			timingClass: string;
			scanLat: number;
		}[],
		audits: [] as {
			actorUserId: string;
			action: string;
			reason: string;
			beforeState: EventEditAuditState;
			afterState: EventEditAuditState;
		}[],
		locks: [] as string[],
		writes: [] as string[],
		directoryReads: 0,
		auditFailure: false,
		onEventLock: () => {},
	};
	const double = {
		transaction: async (run: (tx: unknown) => Promise<unknown>) => {
			const saved = structuredClone({
				event: state.event,
				session: state.session,
				participants: state.participants,
				audits: state.audits,
			});
			try {
				return await run(double);
			} catch (error) {
				Object.assign(state, saved);
				throw error;
			}
		},
		select: (selection?: Record<string, unknown>) => {
			let table = "";
			let params: unknown[] = [];
			const query = {
				from: (value: Parameters<typeof getTableName>[0]) => {
					table = getTableName(value);
					return query;
				},
				where: (condition: SQL) => {
					params = new PgDialect().sqlToQuery(condition).params;
					return query;
				},
				innerJoin: () => query,
				leftJoin: () => query,
				limit: () => query,
				for: (mode: string) => {
					state.locks.push(`${table}:${mode}`);
					if (table === "events") state.onEventLock();
					return query;
				},
				// biome-ignore lint/suspicious/noThenProperty: Drizzle query builders are awaitable.
				then: (resolve: (value: unknown[]) => unknown) => {
					let rows: unknown[] = [];
					if (table === "events")
						rows = selection?.event
							? [{ event: state.event, session: state.session }]
							: [state.event];
					if (table === "attendance_sessions") rows = [state.session];
					if (table === "attendance_records") rows = state.records;
					if (table === "event_participants") rows = state.participants;
					if (table === "system_privileges" && state.identity.isSuperadmin)
						rows = [{ userId: state.identity.userId }];
					if (table === "user_profiles") {
						const identity = {
							...state.identity,
							nim:
								state.identity.actor === "SR"
									? state.identity.nim
									: state.identity.username,
							srUserId:
								state.identity.actor === "SR" ? state.identity.userId : null,
						};
						if (selection?.name && !params.includes(state.identity.userId)) {
							state.directoryReads++;
							rows = state.directory;
						} else
							rows = [
								{
									...identity,
									name: "Operator",
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
		update: (table: Parameters<typeof getTableName>[0]) => ({
			set: (data: object) => ({
				where: async () => {
					const name = getTableName(table);
					state.writes.push(name);
					if (name === "events") Object.assign(state.event, data);
					else if (name === "attendance_sessions")
						Object.assign(state.session, data);
					else throw new Error("Unexpected update");
				},
			}),
		}),
		delete: (table: Parameters<typeof getTableName>[0]) => ({
			where: async (condition: SQL) => {
				expect(getTableName(table)).toBe("event_participants");
				const params = new PgDialect().sqlToQuery(condition).params;
				state.participants = state.participants.filter(
					(sr) => !params.includes(sr.userId),
				);
			},
		}),
		insert: (table: Parameters<typeof getTableName>[0]) => ({
			values: async (data: unknown) => {
				const name = getTableName(table);
				state.writes.push(name);
				if (name === "event_audit_logs") {
					if (state.auditFailure) throw new Error("synthetic audit failure");
					state.audits.push(data as (typeof state.audits)[number]);
				} else if (name === "event_participants")
					state.participants.push(...(data as typeof state.participants));
				else throw new Error("Unexpected insert");
			},
		}),
	};
	const full = () => ({
		eventId,
		mode: "FULL" as const,
		reason: "Approved correction",
		draft: structuredClone(draft),
	});
	const limited = () => ({
		eventId,
		mode: "LIMITED" as const,
		reason: "Approved correction",
		title: "Changed title",
		description: "Changed description",
	});
	return { state, db: double as unknown as Database, draft, full, limited };
}
const sr = (
	positionCode = "ANGGOTA",
	departmentCode = "HCO",
): ActiveSrIdentity => ({
	userId: "synthetic-admin",
	actor: "SR",
	nim: "0000000001",
	isActive: true,
	mustChangePassword: false,
	isSuperadmin: false,
	departmentCode,
	positionCode,
	buildingId: randomUUID(),
});

test("full published edit preserves publication/session IDs and retained snapshots; only roster deltas change", async () => {
	const f = fixture();
	const input = f.full();
	input.draft.rosterCriteria = {
		...input.draft.rosterCriteria,
		individuals: ["retained", "added"],
	};
	input.draft.session.geofenceRadiusM = 30;
	const retained = structuredClone(f.state.participants[0]);
	const publishedAt = f.state.event.publishedAt;
	const sessionId = f.state.session.id;
	await advancedEditEvent(f.db, f.state.identity, input);
	expect(f.state.participants.map((row) => row.userId)).toEqual([
		"retained",
		"added",
	]);
	expect(f.state.participants[0]).toEqual(retained);
	expect(f.state.participants[1]?.name).toBe("Current name");
	expect(f.state.event.publishedAt).toEqual(publishedAt);
	expect(f.state.session).toMatchObject({
		id: sessionId,
		status: "INACTIVE",
		geofenceRadiusM: 30,
	});
	expect(f.state.locks.slice(0, 2)).toEqual([
		"events:update",
		"attendance_sessions:update",
	]);
	expect(f.state.audits[0]).toMatchObject({
		actorUserId: "synthetic-admin",
		action: "PUBLISHED_CONFIGURATION_EDITED",
		reason: input.reason,
		afterState: {
			participants: {
				count: 2,
				addedUserIds: ["added"],
				removedUserIds: ["removed"],
			},
		},
	});
	expect(JSON.stringify(f.state.audits)).not.toMatch(
		/snapshot_nim|Historical name|Current name|password|token|cookie|scanLat/,
	);
});

test("unchanged/reordered roster criteria never regenerate historical snapshots or read the directory", async () => {
	const f = fixture();
	const input = f.full();
	input.draft.rosterCriteria.individuals.reverse();
	const before = structuredClone(f.state.participants);
	await advancedEditEvent(f.db, f.state.identity, input);
	expect(f.state.participants).toEqual(before);
	expect(f.state.directoryReads).toBe(0);
});

test("lifecycle capability is backend-derived, including manual attendance before activation", async () => {
	for (const [eventStatus, sessionStatus, recorded, expected] of [
		["DRAFT", "INACTIVE", false, null],
		["PUBLISHED", "INACTIVE", false, "FULL"],
		["PUBLISHED", "INACTIVE", true, "LIMITED"],
		["PUBLISHED", "ACTIVE", false, "LIMITED"],
		["CLOSED", "CLOSED", true, "METADATA"],
		["PUBLISHED", "CLOSED", false, null],
	] as const) {
		const f = fixture();
		f.state.event.status = eventStatus;
		f.state.session.status = sessionStatus;
		if (recorded)
			f.state.records.push({
				id: randomUUID(),
				source: "MANUAL",
				attendanceAt: new Date(),
				timingClass: "ON_TIME",
				scanLat: 0,
			});
		expect(
			(await getEvent(f.db, f.state.identity, f.state.event.id))
				.advancedEditMode,
		).toBe(expected);
		if (expected !== "FULL") {
			await expect(
				advancedEditEvent(f.db, f.state.identity, f.full()),
			).rejects.toMatchObject({ code: "CONFLICT" });
			expect(f.state.audits).toHaveLength(0);
		}
	}
});

test("ACTIVE and attendance-bearing INACTIVE allow only metadata/end time without touching attendance or QR", async () => {
	for (const status of ["ACTIVE", "INACTIVE"]) {
		const f = fixture();
		f.state.session.status = status;
		f.state.records.push({
			id: randomUUID(),
			source: "QR",
			attendanceAt: new Date(),
			timingClass: "LATE",
			scanLat: 1,
		});
		const records = structuredClone(f.state.records);
		const session = structuredClone(f.state.session);
		await advancedEditEvent(f.db, f.state.identity, {
			...f.limited(),
			endsAt: new Date(Date.now() + 10800000).toISOString(),
		});
		expect(f.state.records).toEqual(records);
		expect(f.state.session).toEqual(session);
		expect(f.state.writes).toEqual(["events", "event_audit_logs"]);
		expect(f.state.audits[0]?.action).toBe("PUBLISHED_DETAILS_EDITED");
	}
});

test("limited input rejects every unsupported field; invalid end times/blank reasons leave no updates/audits", async () => {
	for (const field of [
		"startsAt",
		"rosterCriteria",
		"participants",
		"session",
		"centerLat",
		"geofenceRadiusM",
		"lateGraceMinutes",
		"qrTtlMinutes",
		"status",
	]) {
		const f = fixture();
		expect(
			advancedEventEditSchema.safeParse({ ...f.limited(), [field]: "forged" })
				.success,
		).toBe(false);
	}
	for (const change of [
		{ reason: "   " },
		{ endsAt: new Date(0).toISOString() },
		{ endsAt: new Date(Date.now() + 1000).toISOString() },
	]) {
		const f = fixture();
		await expect(
			advancedEditEvent(f.db, f.state.identity, { ...f.limited(), ...change }),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
		expect(f.state.writes).toHaveLength(0);
		expect(f.state.audits).toHaveLength(0);
	}
	const f = fixture();
	f.state.event.startsAt = new Date(0);
	await expect(
		advancedEditEvent(f.db, f.state.identity, {
			...f.limited(),
			endsAt: new Date(Date.now() - 1000).toISOString(),
		}),
	).rejects.toMatchObject({ code: "BAD_REQUEST" });
});

test("CLOSED permits only audited title/description, never schedule or lifecycle changes", async () => {
	const f = fixture();
	f.state.event.status = "CLOSED";
	f.state.session.status = "CLOSED";
	await advancedEditEvent(f.db, f.state.identity, f.limited());
	expect(f.state.audits[0]?.action).toBe("CLOSED_METADATA_EDITED");
	await expect(
		advancedEditEvent(f.db, f.state.identity, {
			...f.limited(),
			endsAt: f.draft.endsAt,
		}),
	).rejects.toMatchObject({ code: "BAD_REQUEST" });
	expect(f.state.event.status).toBe("CLOSED");
	expect(f.state.session.status).toBe("CLOSED");
	expect(f.state.audits).toHaveLength(1);
});

test("ordinary HCO/KADEP/SR denied advanced editing; existing draft and HCO metadata editing unchanged", async () => {
	for (const identity of [sr(), sr("KADEP"), sr("KADEP", "RND")]) {
		const f = fixture();
		await expect(
			advancedEditEvent(f.db, identity, f.full()),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
		expect(f.state.locks).toHaveLength(0);
	}
	for (const identity of [sr(), fixture().state.identity]) {
		const f = fixture();
		f.state.identity = identity;
		f.state.event.status = "DRAFT";
		await editDraft(f.db, identity, f.state.event.id, {
			...f.draft,
			title: "Draft changed",
		});
		expect(f.state.event.title).toBe("Draft changed");
		expect(f.state.audits).toHaveLength(0);
		f.state.event.status = "PUBLISHED";
		await editMetadata(f.db, identity, f.state.event.id, {
			title: "Metadata changed",
			description: "Preserved HCO behavior",
		});
		expect(f.state.event.title).toBe("Metadata changed");
	}
});

test("live privilege revocation, inactive identity and password gate deny advanced writes after lifecycle locks", async () => {
	for (const change of ["grant", "active", "password"]) {
		const f = fixture();
		const cached = { ...f.state.identity };
		f.state.onEventLock = () => {
			f.state.identity = {
				...sr(),
				isSuperadmin: change !== "grant",
				isActive: change !== "active",
				mustChangePassword: change === "password",
			};
		};
		await expect(
			advancedEditEvent(f.db, cached, f.full()),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
		expect(f.state.writes).toHaveLength(0);
	}
});

test("attendance inserted or session activated before the edit obtains its locks prevents stale full editing", async () => {
	for (const transition of ["record", "activate", "close"]) {
		const f = fixture();
		f.state.onEventLock = () => {
			if (transition === "record")
				f.state.records.push({
					id: randomUUID(),
					source: "MANUAL",
					attendanceAt: new Date(),
					timingClass: "ON_TIME",
					scanLat: 0,
				});
			else if (transition === "activate") f.state.session.status = "ACTIVE";
			else {
				f.state.event.status = "CLOSED";
				f.state.session.status = "CLOSED";
			}
		};
		await expect(
			advancedEditEvent(f.db, f.state.identity, f.full()),
		).rejects.toMatchObject({ code: "CONFLICT" });
		expect(f.state.writes).toHaveLength(0);
		expect(f.state.audits).toHaveLength(0);
	}
});

test("audit insertion failure rolls back event, session and invitation deltas", async () => {
	const f = fixture();
	const before = structuredClone({
		event: f.state.event,
		session: f.state.session,
		participants: f.state.participants,
	});
	f.state.auditFailure = true;
	const input = f.full();
	input.draft.rosterCriteria = { ...input.draft.rosterCriteria, allSr: true };
	await expect(
		advancedEditEvent(f.db, f.state.identity, input),
	).rejects.toThrow("synthetic audit failure");
	expect(f.state.event).toEqual(before.event);
	expect(f.state.session).toEqual(before.session);
	expect(f.state.participants).toEqual(before.participants);
	expect(f.state.audits).toHaveLength(0);
});

test("protected API rejects anonymous/non-admin callers; SUPERADMIN uses the same audited service", async () => {
	const f = fixture();
	const caller = (authenticated: boolean) =>
		appRouter.createCaller({
			db: f.db,
			session: authenticated
				? ({ user: { id: f.state.identity.userId } } as never)
				: null,
		});
	await expect(
		caller(false).attendance.advancedEdit(f.full()),
	).rejects.toMatchObject({ code: "UNAUTHORIZED" });
	f.state.identity = sr();
	await expect(
		caller(true).attendance.advancedEdit(f.full()),
	).rejects.toMatchObject({ code: "FORBIDDEN" });
	f.state.identity = { ...sr("ANGGOTA", "RND"), isSuperadmin: true };
	await caller(true).attendance.advancedEdit(f.full());
	expect(f.state.audits).toHaveLength(1);
});

test("event audit schema/migration is additive with mandatory states/reason, FKs and append-only triggers", () => {
	const table = getTableConfig(eventAuditLogs);
	expect(table.foreignKeys).toHaveLength(2);
	expect(table.indexes).toHaveLength(1);
	expect(table.checks).toHaveLength(3);
	const sql = readFileSync(
		new URL(
			"../../../../db/src/migrations/20261015073510_superadmin_event_editing/migration.sql",
			import.meta.url,
		),
		"utf8",
	);
	expect(
		[...sql.matchAll(/CREATE TABLE "([^"]+)"/g)].map((match) => match[1]),
	).toEqual(["event_audit_logs"]);
	expect(sql).toContain("BEFORE UPDATE OR DELETE");
	expect(sql).toContain("BEFORE TRUNCATE");
	expect(sql).toContain("ERRCODE = '23514'");
	expect(sql).not.toMatch(
		/ALTER TABLE "(?:events|attendance_records|qr_challenges)"/,
	);
});
