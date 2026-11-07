import { expect } from "bun:test";
import { randomUUID } from "node:crypto";

import type { ActiveIdentity } from "@resora/auth/sr-access";
import type { Database } from "@resora/db";
import type { EventEditAuditState, events } from "@resora/db/schema/attendance";
import { getTableName, type SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

import { eventDraftSchema } from "../../../../contracts/attendance";

// Actual services/public Identity queries with a rollback-capable offline DB double.
// This does not simulate PostgreSQL lock scheduling or enforce SQL triggers.
export function fixture() {
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
					if (
						table === "events" &&
						selection?.visibility &&
						!selection?.rosterCriteria
					) {
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
