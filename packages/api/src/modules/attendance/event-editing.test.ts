import { expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import type { ActiveIdentity, ActiveSrIdentity } from "@resora/auth/sr-access";
import type { Database } from "@resora/db";
import {
	type EventEditAuditState,
	eventAuditLogs,
	eventDeletionAudits,
	events,
} from "@resora/db/schema/attendance";
import { getTableName, type SQL } from "drizzle-orm";
import { getTableConfig, PgDialect } from "drizzle-orm/pg-core";
import { appRouter } from "../../routers";
import {
	advancedEventEditSchema,
	deleteDraftSchema,
	eventDraftSchema,
	eventVisibilitySchema,
	visibilitySchema,
} from "./attendance.schema";
import {
	activateSession,
	advancedEditEvent,
	closeEvent,
	deleteEventDraft,
	editDraft,
	editMetadata,
	getEvent,
	listEvents,
	setEventVisibility,
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
			organizationContext: "SR",
			committeeId: null,
			snapshotCommitteeName: null,
			id: eventId,
			...draft,
			startsAt: new Date(draft.startsAt),
			endsAt: new Date(draft.endsAt),
			createdByUserId: "original-creator",
			status: "PUBLISHED",
			visibility: "VISIBLE",
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
		eventDeleted: false,
		sessionDeleted: false,
		tombstones: [] as Record<string, unknown>[],
		qrReferences: [] as object[],
		attendanceAudits: [] as object[],
		deleteFailure: false,
		emptyDelete: false,
		filters: [] as { table: string; sql: string; params: unknown[] }[],
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
				eventDeleted: state.eventDeleted,
				sessionDeleted: state.sessionDeleted,
				tombstones: state.tombstones,
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
			let whereSql = "";
			const query = {
				from: (value: Parameters<typeof getTableName>[0]) => {
					table = getTableName(value);
					return query;
				},
				where: (condition: SQL) => {
					const compiled = new PgDialect().sqlToQuery(condition);
					params = compiled.params;
					whereSql = compiled.sql;
					state.filters.push({ table, ...compiled });
					return query;
				},
				innerJoin: () => query,
				leftJoin: () => query,
				limit: () => query,
				orderBy: () => query,
				for: (mode: string) => {
					state.locks.push(`${table}:${mode}`);
					if (table === "events") state.onEventLock();
					return query;
				},
				// biome-ignore lint/suspicious/noThenProperty: Drizzle query builders are awaitable.
				then: (resolve: (value: unknown[]) => unknown) => {
					let rows: unknown[] = [];
					if (table === "events")
						rows = state.eventDeleted
							? []
							: selection?.event
								? [{ event: state.event, session: state.session }]
								: [state.event];
					if (table === "events" && selection?.visibility) {
						const visible = params.includes("PUBLISHED")
							? state.event.status === "PUBLISHED" &&
								state.event.visibility === "VISIBLE" &&
								state.participants.some(
									(row) => row.userId === state.identity.userId,
								)
							: whereSql.includes("<>")
								? state.event.visibility !== "ARCHIVED"
								: state.event.visibility === params[0];
						if (!visible) rows = [];
						// Membership/visibility must actually be in the emitted SQL, not merely filtered by this double.
						expect(whereSql).toContain('"visibility"');
					}
					if (table === "attendance_sessions")
						rows = state.sessionDeleted ? [] : [state.session];
					if (selection?.hasReferences)
						rows = [
							{
								hasReferences: Boolean(
									state.records.length ||
										state.participants.length ||
										state.qrReferences.length ||
										state.audits.length ||
										state.attendanceAudits.length,
								),
							},
						];
					if (table === "attendance_records") rows = state.records;
					if (table === "event_participants")
						rows = params.includes(state.identity.userId)
							? state.participants.filter(
									(row) => row.userId === state.identity.userId,
								)
							: state.participants;
					if (table === "system_privileges" && state.identity.isSuperadmin)
						rows = [{ userId: state.identity.userId }];
					if (table === "user_profiles") {
						const identity = {
							...state.identity,
							tenureStatus: "ACTIVE",
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
									tenureStatus: "ACTIVE",
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
					else if (name === "qr_challenges") {
						/* No current challenge in these fixtures. */
					} else throw new Error("Unexpected update");
				},
			}),
		}),
		delete: (table: Parameters<typeof getTableName>[0]) => ({
			where: (condition: SQL) => {
				const execute = async () => {
					const name = getTableName(table);
					state.writes.push(`delete:${name}`);
					if (name === "attendance_sessions") {
						state.sessionDeleted = true;
						return [{ id: state.session.id }];
					}
					if (name === "events") {
						if (state.deleteFailure)
							throw Object.assign(new Error("synthetic FK conflict"), {
								cause: { code: "23503" },
							});
						if (state.emptyDelete) return [];
						state.eventDeleted = true;
						return [{ id: state.event.id }];
					}
					expect(name).toBe("event_participants");
					const params = new PgDialect().sqlToQuery(condition).params;
					state.participants = state.participants.filter(
						(sr) => !params.includes(sr.userId),
					);
					return [];
				};
				return {
					returning: execute,
					// biome-ignore lint/suspicious/noThenProperty: Drizzle delete builders are awaitable.
					then: (
						resolve: (rows: unknown[]) => unknown,
						reject: (error: unknown) => unknown,
					) => execute().then(resolve, reject),
				};
			},
		}),
		insert: (table: Parameters<typeof getTableName>[0]) => ({
			values: async (data: unknown) => {
				const name = getTableName(table);
				state.writes.push(name);
				if (name === "event_audit_logs") {
					if (state.auditFailure) throw new Error("synthetic audit failure");
					state.audits.push(data as (typeof state.audits)[number]);
				} else if (name === "event_deletion_audits") {
					if (state.auditFailure) throw new Error("synthetic audit failure");
					state.tombstones.push(data as Record<string, unknown>);
				} else if (name === "event_participants")
					state.participants.push(...(data as typeof state.participants));
				else if (name === "qr_challenges")
					state.qrReferences.push(data as object);
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

function unusedDraft() {
	const f = fixture();
	f.state.event.status = "DRAFT";
	f.state.event.publishedAt = null;
	f.state.participants = [];
	return f;
}
const reason = "Synthetic administrative decision";

test("visibility schemas reject unknown values/actions, blank reasons and forged fields", () => {
	const f = fixture();
	for (const value of ["VISIBLE", "HIDDEN", "ARCHIVED"])
		expect(visibilitySchema.safeParse(value).success).toBe(true);
	expect(visibilitySchema.safeParse("DELETED").success).toBe(false);
	for (const input of [
		{ eventId: f.state.event.id, action: "DELETE", reason },
		{ eventId: f.state.event.id, action: "HIDE", reason: " " },
		{ eventId: f.state.event.id, action: "HIDE", reason, isSuperadmin: true },
	])
		expect(eventVisibilitySchema.safeParse(input).success).toBe(false);
	expect(
		deleteDraftSchema.safeParse({ eventId: f.state.event.id, reason: "\n\t" })
			.success,
	).toBe(false);
});

test("hide/unhide preserves manual records, invitations and lifecycle; audits actual previous/new visibility", async () => {
	const f = fixture();
	f.state.records.push({
		id: randomUUID(),
		source: "MANUAL",
		attendanceAt: new Date(),
		timingClass: "LATE",
		scanLat: 0,
	});
	const original = structuredClone({
		records: f.state.records,
		participants: f.state.participants,
		session: f.state.session,
		publishedAt: f.state.event.publishedAt,
	});
	for (const action of ["HIDE", "UNHIDE"] as const)
		await setEventVisibility(f.db, f.state.identity, {
			eventId: f.state.event.id,
			action,
			reason,
		});
	expect(f.state.event.visibility).toBe("VISIBLE");
	expect(f.state.event.status).toBe("PUBLISHED");
	expect(f.state.records).toEqual(original.records);
	expect(f.state.participants).toEqual(original.participants);
	expect(f.state.session).toEqual(original.session);
	expect(f.state.event.publishedAt).toEqual(original.publishedAt);
	expect(f.state.audits).toMatchObject([
		{
			action: "EVENT_HIDDEN",
			actorUserId: f.state.identity.userId,
			reason,
			beforeState: { visibility: "VISIBLE" },
			afterState: { visibility: "HIDDEN" },
		},
		{
			action: "EVENT_UNHIDDEN",
			beforeState: { visibility: "HIDDEN" },
			afterState: { visibility: "VISIBLE" },
		},
	]);
	expect(f.state.writes).toEqual([
		"events",
		"event_audit_logs",
		"events",
		"event_audit_logs",
	]);
	expect(f.state.locks.slice(0, 2)).toEqual([
		"events:update",
		"attendance_sessions:update",
	]);
});

test("CLOSED may hide/archive from visible or hidden and restore without reopening", async () => {
	for (const hidden of [false, true]) {
		const f = fixture();
		f.state.event.status = "CLOSED";
		f.state.event.closedAt = new Date();
		Object.assign(f.state.session, { status: "CLOSED", closedAt: new Date() });
		if (hidden)
			await setEventVisibility(f.db, f.state.identity, {
				eventId: f.state.event.id,
				action: "HIDE",
				reason,
			});
		await setEventVisibility(f.db, f.state.identity, {
			eventId: f.state.event.id,
			action: "ARCHIVE",
			reason,
		});
		expect(f.state.event.visibility).toBe("ARCHIVED");
		await expect(
			setEventVisibility(f.db, f.state.identity, {
				eventId: f.state.event.id,
				action: "HIDE",
				reason,
			}),
		).rejects.toMatchObject({ code: "CONFLICT" });
		await setEventVisibility(f.db, f.state.identity, {
			eventId: f.state.event.id,
			action: "RESTORE",
			reason,
		});
		expect(f.state.event).toMatchObject({
			status: "CLOSED",
			visibility: "VISIBLE",
		});
		expect(f.state.session.status).toBe("CLOSED");
		expect(f.state.audits.slice(-2).map((entry) => entry.action)).toEqual([
			"EVENT_ARCHIVED",
			"EVENT_RESTORED",
		]);
	}
});

test("invalid/repeated visibility operations and stale activation create no additional audit", async () => {
	for (const condition of [
		"draft",
		"active",
		"archive-published",
		"repeat",
		"restore-visible",
	]) {
		const f = fixture();
		if (condition === "draft") f.state.event.status = "DRAFT";
		if (condition === "active") f.state.session.status = "ACTIVE";
		if (condition === "repeat")
			await setEventVisibility(f.db, f.state.identity, {
				eventId: f.state.event.id,
				action: "HIDE",
				reason,
			});
		const count = f.state.audits.length;
		await expect(
			setEventVisibility(f.db, f.state.identity, {
				eventId: f.state.event.id,
				action:
					condition === "archive-published"
						? "ARCHIVE"
						: condition === "restore-visible"
							? "RESTORE"
							: "HIDE",
				reason,
			}),
		).rejects.toMatchObject({ code: "CONFLICT" });
		expect(f.state.audits).toHaveLength(count);
	}
	const f = fixture();
	f.state.onEventLock = () => {
		f.state.session.status = "ACTIVE";
	};
	await expect(
		setEventVisibility(f.db, f.state.identity, {
			eventId: f.state.event.id,
			action: "HIDE",
			reason,
		}),
	).rejects.toMatchObject({ code: "CONFLICT" });
	expect(f.state.audits).toHaveLength(0);
});

test("SR list/detail denies hidden/archived URLs; operators retain permitted management access and archive filtering", async () => {
	for (const visibility of ["VISIBLE", "HIDDEN", "ARCHIVED"] as const) {
		const f = fixture();
		f.state.event.visibility = visibility;
		if (visibility === "ARCHIVED") {
			f.state.event.status = "CLOSED";
			f.state.session.status = "CLOSED";
		}
		f.state.identity = sr("ANGGOTA", "RND");
		const participant = f.state.participants[0];
		if (!participant) throw new Error("Missing synthetic invitation");
		f.state.participants.push({
			...participant,
			userId: f.state.identity.userId,
		});
		const listing = await listEvents(f.db, f.state.identity);
		expect(listing.events).toHaveLength(visibility === "VISIBLE" ? 1 : 0);
		const filter = f.state.filters.find((query) => query.table === "events");
		expect(filter?.params).toContain("VISIBLE");
		expect(filter?.params).toContain(f.state.identity.userId);
		if (visibility !== "VISIBLE")
			await expect(
				getEvent(f.db, f.state.identity, f.state.event.id),
			).rejects.toMatchObject({ code: "NOT_FOUND" });
		else
			expect(
				(await getEvent(f.db, f.state.identity, f.state.event.id))
					.administration,
			).toBeNull();
		await expect(
			listEvents(f.db, f.state.identity, { visibility: "ARCHIVED" }),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
		f.state.identity = sr();
		expect((await listEvents(f.db, f.state.identity)).events).toHaveLength(
			visibility === "ARCHIVED" ? 0 : 1,
		);
		expect(
			(await getEvent(f.db, f.state.identity, f.state.event.id)).canManage,
		).toBe(true);
		f.state.identity = { ...sr("ANGGOTA", "RND"), isSuperadmin: true };
		expect(
			(await listEvents(f.db, f.state.identity, { visibility })).events,
		).toHaveLength(1);
		expect(
			(await getEvent(f.db, f.state.identity, f.state.event.id)).administration,
		).not.toBeNull();
	}
});

test("hidden INACTIVE activation is denied, HCO may still close, and visible HCO activation is unchanged", async () => {
	const f = fixture();
	f.state.identity = sr();
	f.state.event.visibility = "HIDDEN";
	await expect(
		activateSession(f.db, f.state.identity, f.state.event.id),
	).rejects.toMatchObject({
		code: "CONFLICT",
		message: "HIDDEN_EVENT_ACTIVATION_FORBIDDEN",
	});
	expect(f.state.writes).toHaveLength(0);
	await closeEvent(f.db, f.state.identity, f.state.event.id);
	expect(f.state.event).toMatchObject({
		status: "CLOSED",
		visibility: "HIDDEN",
	});
	expect(f.state.session.status).toBe("CLOSED");
	const visible = fixture();
	visible.state.identity = sr();
	await activateSession(
		visible.db,
		visible.state.identity,
		visible.state.event.id,
	);
	expect(visible.state.session.status).toBe("ACTIVE");
	expect(visible.state.qrReferences).toHaveLength(1);
});

test("eligible DRAFT deletes session then event, leaving only the immutable deletion tombstone", async () => {
	const f = unusedDraft();
	expect(
		(await getEvent(f.db, f.state.identity, f.state.event.id)).administration
			?.canDeleteDraft,
	).toBe(true);
	await deleteEventDraft(f.db, f.state.identity, {
		eventId: f.state.event.id,
		reason,
	});
	expect(f.state.eventDeleted).toBe(true);
	expect(f.state.sessionDeleted).toBe(true);
	expect(f.state.audits).toHaveLength(0);
	expect(f.state.writes).toEqual([
		"delete:attendance_sessions",
		"delete:events",
		"event_deletion_audits",
	]);
	expect(f.state.tombstones).toMatchObject([
		{
			eventId: f.state.event.id,
			actorUserId: f.state.identity.userId,
			action: "EVENT_DRAFT_DELETED",
			reason,
			eventSnapshot: { title: f.state.event.title, status: "DRAFT" },
		},
	]);
	await expect(
		deleteEventDraft(f.db, f.state.identity, {
			eventId: f.state.event.id,
			reason,
		}),
	).rejects.toMatchObject({ code: "NOT_FOUND" });
	expect(f.state.tombstones).toHaveLength(1);
});

test("deletion rejects every operational reference, used session, and PUBLISHED/CLOSED lifecycle", async () => {
	for (const condition of [
		"participants",
		"attendance",
		"qr",
		"event-audit",
		"attendance-audit",
		"activated",
		"session-active",
		"published",
		"closed",
	]) {
		const f = unusedDraft();
		if (condition === "participants")
			f.state.participants = fixture().state.participants;
		if (condition === "attendance")
			f.state.records.push({
				id: randomUUID(),
				source: "MANUAL",
				attendanceAt: new Date(),
				timingClass: "LATE",
				scanLat: 0,
			});
		if (condition === "qr") f.state.qrReferences.push({});
		if (condition === "event-audit")
			f.state.audits = fixture().state.audits.concat({
				actorUserId: f.state.identity.userId,
				action: "existing",
				reason,
				beforeState: {} as EventEditAuditState,
				afterState: {} as EventEditAuditState,
			});
		if (condition === "attendance-audit") f.state.attendanceAudits.push({});
		if (condition === "activated")
			Object.assign(f.state.session, { activatedAt: new Date() });
		if (condition === "session-active") f.state.session.status = "ACTIVE";
		if (condition === "published") f.state.event.status = "PUBLISHED";
		if (condition === "closed") {
			f.state.event.status = "CLOSED";
			f.state.session.status = "CLOSED";
		}
		await expect(
			deleteEventDraft(f.db, f.state.identity, {
				eventId: f.state.event.id,
				reason,
			}),
		).rejects.toMatchObject({ code: "CONFLICT" });
		expect(f.state.eventDeleted).toBe(false);
		expect(f.state.sessionDeleted).toBe(false);
		expect(f.state.tombstones).toHaveLength(0);
		expect(f.state.writes).toHaveLength(0);
	}
});

test("audit failures roll back visibility and both deleted rows; unexpected FK conflicts also roll back", async () => {
	const f = fixture();
	f.state.auditFailure = true;
	await expect(
		setEventVisibility(f.db, f.state.identity, {
			eventId: f.state.event.id,
			action: "HIDE",
			reason,
		}),
	).rejects.toThrow("synthetic audit failure");
	expect(f.state.event.visibility).toBe("VISIBLE");
	expect(f.state.audits).toHaveLength(0);
	for (const failure of ["audit", "fk", "missing-row"]) {
		const draft = unusedDraft();
		draft.state.auditFailure = failure === "audit";
		draft.state.deleteFailure = failure === "fk";
		draft.state.emptyDelete = failure === "missing-row";
		await expect(
			deleteEventDraft(draft.db, draft.state.identity, {
				eventId: draft.state.event.id,
				reason,
			}),
		).rejects.toThrow();
		expect(draft.state.eventDeleted).toBe(false);
		expect(draft.state.sessionDeleted).toBe(false);
		expect(draft.state.tombstones).toHaveLength(0);
	}
});

test("new administrative writes reject HCO/KADEP/SR and reload revoked/inactive SUPERADMIN under locks", async () => {
	for (const operation of ["visibility", "delete"] as const) {
		const invoke = (f: ReturnType<typeof fixture>, identity: ActiveIdentity) =>
			operation === "visibility"
				? setEventVisibility(f.db, identity, {
						eventId: f.state.event.id,
						action: "HIDE",
						reason,
					})
				: deleteEventDraft(f.db, identity, {
						eventId: f.state.event.id,
						reason,
					});
		for (const identity of [
			sr(),
			sr("KADEP"),
			sr("ANGGOTA", "RND"),
			{ ...fixture().state.identity, isActive: false },
		]) {
			const f = fixture();
			await expect(invoke(f, identity)).rejects.toMatchObject({
				code: "FORBIDDEN",
			});
			expect(f.state.locks).toHaveLength(0);
		}
		for (const revoked of [false, true]) {
			const f = unusedDraft();
			if (operation === "visibility") f.state.event.status = "PUBLISHED";
			const cached = { ...f.state.identity };
			f.state.onEventLock = () => {
				f.state.identity = revoked
					? sr()
					: { ...f.state.identity, isActive: false };
			};
			await expect(invoke(f, cached)).rejects.toMatchObject({
				code: "FORBIDDEN",
			});
			expect(f.state.writes).toHaveLength(0);
		}
	}
});

test("new protected API operations reject anonymous/forged requests and accept eligible SUPERADMIN", async () => {
	const f = unusedDraft();
	const caller = (session: boolean) =>
		appRouter.createCaller({
			db: f.db,
			session: session
				? ({ user: { id: f.state.identity.userId } } as never)
				: null,
		});
	await expect(
		caller(false).attendance.deleteDraft({ eventId: f.state.event.id, reason }),
	).rejects.toMatchObject({ code: "UNAUTHORIZED" });
	await expect(
		caller(false).attendance.setVisibility({
			eventId: f.state.event.id,
			action: "HIDE",
			reason,
		}),
	).rejects.toMatchObject({ code: "UNAUTHORIZED" });
	f.state.identity = sr();
	await expect(
		caller(true).attendance.deleteDraft({ eventId: f.state.event.id, reason }),
	).rejects.toMatchObject({ code: "FORBIDDEN" });
	f.state.identity = { ...sr("ANGGOTA", "RND"), isSuperadmin: true };
	await caller(true).attendance.deleteDraft({
		eventId: f.state.event.id,
		reason,
	});
	expect(f.state.tombstones).toHaveLength(1);
});

test("Part 2 migration retains Part 1 FK/guards and uses one deletion-safe append-only tombstone table", () => {
	expect(events.visibility.default).toBe("VISIBLE");
	const table = getTableConfig(eventDeletionAudits);
	expect(
		table.foreignKeys.map((key) => getTableName(key.reference().foreignTable)),
	).toEqual(["user"]);
	expect(eventDeletionAudits.eventId.isUnique).toBe(true);
	const sql = readFileSync(
		new URL(
			"../../../../db/src/migrations/20261015083956_event_visibility_deletion/migration.sql",
			import.meta.url,
		),
		"utf8",
	);
	expect(sql).toContain("DEFAULT 'VISIBLE' NOT NULL");
	expect(sql).toContain("BEFORE UPDATE OR DELETE");
	expect(sql).toContain("BEFORE TRUNCATE");
	expect(sql).toContain("public.guard_event_audit_mutation()");
	expect(sql).not.toMatch(
		/DROP (?:TRIGGER|FUNCTION|TABLE)|ON DELETE CASCADE|DROP CONSTRAINT "event_audit_logs_event_id/,
	);
});
