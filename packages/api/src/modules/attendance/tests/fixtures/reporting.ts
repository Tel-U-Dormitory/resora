import { randomUUID } from "node:crypto";

import type { ActiveSrIdentity } from "@resora/auth/sr-access";
import type { Database } from "@resora/db";

import { getTableName, type SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { rosterSchema } from "../../../../contracts/attendance";

const start = new Date("2026-10-12T06:00:00Z");
// Offline query double exercises actual services, Identity public reads and transaction rollback.
// It does not prove PostgreSQL lock/trigger behavior; real Phase 6 integration needs separate approval.
export function fixture() {
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
		organizationContext: undefined as "SR" | "COMMITTEE" | undefined,
		snapshotCommitteeName: null as string | null,
		id: randomUUID(),
		title: "Synthetic",
		status: "PUBLISHED",
		visibility: "VISIBLE",
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
		transactionOptions: [] as unknown[],
	};
	const double = {
		transaction: async (
			run: (tx: unknown) => Promise<unknown>,
			options?: unknown,
		) => {
			state.transactionOptions.push(options);
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
					const reports = state.reports as {
						participant?: Record<string, unknown>;
						record?: Record<string, unknown> | null;
						event?: typeof event;
					}[];
					if (table === "user")
						rows = [
							...new Set([
								identity.userId,
								...state.audits.map((a) => a.actorUserId),
							]),
						].map((userId) => ({ userId, name: "Synthetic HCO" }));
					if (table === "events")
						rows = selection?.event ? [{ event, session }] : [event];
					if (table === "attendance_sessions")
						rows = selection?.session
							? reports.map((row) => ({ session, record: row.record ?? null }))
							: [session];
					if (table === "qr_challenges") rows = state.qr ? [state.qr] : [];
					if (table === "system_privileges" && state.superadmin)
						rows = [{ userId: identity.userId }];
					if (table === "attendance_records")
						rows = joined
							? [{ eventId: event.id }]
							: state.record
								? [state.record]
								: [];
					if (
						table === "attendance_records" &&
						selection?.userId &&
						selection?.attendanceAt
					)
						rows = reports
							.filter((row) => row.record)
							.map((row) => ({
								...row.record,
								userId: row.participant?.userId ?? row.record?.userId,
							}));
					if (table === "event_participants")
						rows = selection?.nim
							? reports
									.filter((row) => row.participant)
									.map((row) => row.participant)
							: joined || selection?.participant
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
									tenureStatus: "ACTIVE",
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
