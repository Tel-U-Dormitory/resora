import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { getActiveIdentity } from "@resora/auth/sr-access";
import { createDb, type Database } from "@resora/db";
import { seedOrganization } from "@resora/db/organization";
import {
	attendanceSessions,
	eventAuditLogs,
	eventDeletionAudits,
	events,
} from "@resora/db/schema/attendance";
import { user } from "@resora/db/schema/auth";
import {
	buildings,
	srProfiles,
	systemPrivileges,
	userProfiles,
} from "@resora/db/schema/identity";
import { assignSyntheticSrTenure } from "@resora/db/sr-tenure.fixture";
import { eq, sql } from "drizzle-orm";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { getTableConfig } from "drizzle-orm/pg-core";
import { appRouter } from "../../routers";
import { getActiveSrDirectory } from "../identity/identity.public";
import {
	localProvisioningTarget,
	verifyLocalProvisioningDatabase,
} from "../identity/sr-provisioning";
import { eventDraftSchema } from "./attendance.schema";
import * as service from "./attendance.service";
import { deletedDraftHistory, eventAuditHistory } from "./event-audit";
import { manualInsert } from "./manual-attendance";
import { exportCsv, ownHistory, recap } from "./reporting";

const target = process.env.RESORA_EVENT_ADMIN_TEST_DB_URL;
// Opt-in, loopback, purpose-specific disposable database only; never any application env fallback.
(target ? describe : describe.skip)(
	"event administration on disposable PostgreSQL",
	() => {
		let db: Database;
		const prefix = `synthetic-event-admin-${randomUUID()}`;
		const adminId = `${prefix}-admin`;
		const srId = `${prefix}-sr`;
		const hcoId = `${prefix}-hco`;
		const reason = "Synthetic Part 3 verification";
		let admin: NonNullable<Awaited<ReturnType<typeof getActiveIdentity>>>;
		let sr: typeof admin;
		let hco: typeof admin;
		beforeAll(async () => {
			if (
				!target ||
				!/^resora_identity_test_events_[a-f0-9]{12}$/.test(
					new URL(localProvisioningTarget(target)).pathname.slice(1),
				)
			)
				throw Error("DISPOSABLE_EVENT_TEST_TARGET_REQUIRED");
			db = createDb({ DATABASE_URL: target, DB_POOL_MAX: 5 });
			db.$client.options.statement_timeout = 10000;
			db.$client.options.lock_timeout = 3000;
			await verifyLocalProvisioningDatabase(db, target);
			// This dedicated test target must contain synthetic fixtures only.
			const existing = await db.execute<{ n: number }>(
				sql`select count(*)::int n from "user" where email not like '%@synthetic.invalid'`,
			);
			expect(existing.rows[0]?.n).toBe(0);
			await seedOrganization(db);
			const [building] = await db
				.select()
				.from(buildings)
				.where(eq(buildings.code, "A"));
			if (!building) throw Error("BUILDING_REQUIRED");
			await db.transaction(async (tx) => {
				await tx.insert(user).values([
					{
						id: adminId,
						name: "Synthetic SUPERADMIN",
						email: `${adminId}@synthetic.invalid`,
						username: `synthetic.${randomUUID()}`,
					},
					{
						id: srId,
						name: "Synthetic SR",
						email: `${srId}@synthetic.invalid`,
						username: `000${randomUUID().replaceAll("-", "")}`,
					},
					{
						id: hcoId,
						name: "Synthetic HCO",
						email: `${hcoId}@synthetic.invalid`,
						username: `000${randomUUID().replaceAll("-", "")}`,
					},
				]);
				await tx.insert(userProfiles).values([
					{ userId: adminId, actor: "SYSTEM_ADMIN", mustChangePassword: false },
					{ userId: srId, actor: "SR", mustChangePassword: false },
					{ userId: hcoId, actor: "SR", mustChangePassword: false },
				]);
				await tx.insert(srProfiles).values([
					{
						userId: srId,
						departmentCode: "RND",
						positionCode: "ANGGOTA",
						buildingId: building.id,
					},
					{
						userId: hcoId,
						departmentCode: "HCO",
						positionCode: "ANGGOTA",
						buildingId: building.id,
					},
				]);
				await tx
					.insert(systemPrivileges)
					.values({ userId: adminId, privilegeCode: "SUPERADMIN" });
			});
			await assignSyntheticSrTenure(db, [srId, hcoId]);
			const identities = await Promise.all([
				getActiveIdentity(db, adminId),
				getActiveIdentity(db, srId),
				getActiveIdentity(db, hcoId),
			]);
			if (!identities[0] || !identities[1] || !identities[2])
				throw Error("FIXTURE_IDENTITY_REQUIRED");
			[admin, sr, hco] = identities as [
				typeof admin,
				typeof admin,
				typeof admin,
			];
		});
		afterAll(async () => {
			if (db) await db.$client.end();
		});
		async function fixture(published = true) {
			const draft = eventDraftSchema.parse({
				title: "Synthetic event",
				startsAt: new Date(Date.now() + 3600000).toISOString(),
				endsAt: new Date(Date.now() + 7200000).toISOString(),
				rosterCriteria: { individuals: [srId] },
				session: { centerLat: 0, centerLng: 0 },
			});
			const event = await service.createEvent(db, admin, draft);
			if (published) await service.publishEvent(db, admin, event.eventId);
			return { id: event.eventId, draft };
		}
		async function failure(operation: PromiseLike<unknown>, expected?: string) {
			let error: unknown;
			try {
				await operation;
			} catch (e) {
				error = e;
			}
			expect(error).toBeTruthy();
			if (expected) expect((error as { code?: string }).code).toBe(expected);
		}
		async function negativeSQL(text: string, params: unknown[] = []) {
			const client = await db.$client.connect();
			try {
				await client.query("BEGIN");
				await client.query("SAVEPOINT negative_case");
				let error: unknown;
				try {
					await client.query(text, params);
				} catch (e) {
					error = e;
				}
				await client.query("ROLLBACK TO SAVEPOINT negative_case");
				expect(error).toBeTruthy();
			} finally {
				await client.query("ROLLBACK");
				client.release();
			}
		}
		async function full(
			id: string,
			draft: ReturnType<typeof eventDraftSchema.parse>,
			source = db,
		) {
			return service.advancedEditEvent(source, admin, {
				eventId: id,
				mode: "FULL",
				reason,
				draft: { ...draft, title: "Synthetic revised event" },
			});
		}
		// Force both real lock orderings without sleeping through transactions or changing application locks.
		async function race(
			id: string,
			first: (source: Database) => Promise<unknown>,
			second: () => Promise<unknown>,
		) {
			const locked = Promise.withResolvers<void>();
			const release = Promise.withResolvers<void>();
			const held = new Proxy(db, {
				get(object, key, receiver) {
					if (key !== "transaction") return Reflect.get(object, key, receiver);
					return (callback: Parameters<Database["transaction"]>[0]) =>
						db.transaction(async (tx) => {
							await tx.execute(
								sql`select id from events where id=${id} for update`,
							);
							locked.resolve();
							await release.promise;
							return callback(tx);
						});
				},
			});
			const one = first(held);
			await Promise.race([
				locked.promise,
				one.then(() => {
					throw Error("Operation completed before lock observation");
				}),
			]);
			const two = second();
			// Observe PostgreSQL's actual waiting connection; bounded by statement/lock timeouts.
			let waiting = false;
			try {
				for (let i = 0; i < 50; i++) {
					const result = await db.execute<{ n: number }>(
						sql`select count(*)::int n from pg_stat_activity where datname=current_database() and wait_event_type='Lock' and pid<>pg_backend_pid()`,
					);
					if ((result.rows[0]?.n ?? 0) > 0) {
						waiting = true;
						break;
					}
					await new Promise((resolve) => setTimeout(resolve, 10));
				}
			} finally {
				release.resolve();
			}
			const outcomes = await Promise.allSettled([one, two]);
			expect(waiting).toBe(true);
			return outcomes;
		}
		test("all eleven versioned hashes, schema FKs/indexes/guards and VISIBLE default match", async () => {
			const history = await db.execute<{ hash: string }>(
				sql`select hash from drizzle.__drizzle_migrations order by created_at`,
			);
			expect(history.rows.map((r) => r.hash)).toEqual(
				readMigrationFiles({
					migrationsFolder: resolve(
						import.meta.dir,
						"../../../../db/src/migrations",
					),
				}).map((m) => m.hash),
			);
			const result = await db.execute<{ table_name: string; conname: string }>(
				sql`select conrelid::regclass::text table_name,conname from pg_constraint where conrelid in ('event_audit_logs'::regclass,'event_deletion_audits'::regclass) and contype='f'`,
			);
			expect(
				result.rows.filter((r) => r.table_name === "event_audit_logs"),
			).toHaveLength(2);
			expect(
				result.rows.filter((r) => r.table_name === "event_deletion_audits"),
			).toHaveLength(1);
			const triggers = await db.execute<{ n: number }>(
				sql`select count(*)::int n from pg_trigger where not tgisinternal and tgrelid in ('event_audit_logs'::regclass,'event_deletion_audits'::regclass) and tgenabled='O'`,
			);
			expect(triggers.rows[0]?.n).toBe(4);
			const defaultEvent = await fixture(false);
			expect(
				(await service.getEvent(db, admin, defaultEvent.id)).event.visibility,
			).toBe("VISIBLE");
			for (const table of [events, eventAuditLogs, eventDeletionAudits]) {
				const config = getTableConfig(table);
				const catalog = await db.execute<{
					name: string;
					type: string;
					not_null: boolean;
				}>(
					sql`select attname name,format_type(atttypid,atttypmod) type,attnotnull as not_null from pg_attribute where attrelid=${config.name}::regclass and attnum>0 and not attisdropped order by attname`,
				);
				expect(catalog.rows).toEqual(
					config.columns
						.map((column) => ({
							name: column.name,
							type: column.getSQLType(),
							not_null: column.notNull,
						}))
						.sort((a, b) => a.name.localeCompare(b.name)),
				);
				const indexes = await db.execute<{ n: number }>(
					sql`select count(*)::int n from pg_index where indrelid=${config.name}::regclass and indisvalid and not indisprimary`,
				);
				expect(indexes.rows[0]?.n).toBe(
					config.indexes.length +
						config.uniqueConstraints.length +
						config.columns.filter((column) => column.isUnique).length,
				);
			}
		});
		test("full edit synchronizes deltas while retaining historical invitation snapshot; safe audit reads", async () => {
			const f = await fixture();
			const before = await service.getEvent(db, admin, f.id);
			await full(f.id, {
				...f.draft,
				rosterCriteria: { ...f.draft.rosterCriteria, include: [hcoId] },
			});
			const after = await service.getEvent(db, admin, f.id);
			expect(after.participants.find((p) => p.userId === srId)).toEqual(
				before.participants[0],
			);
			expect(after.participants).toHaveLength(2);
			expect(after.session.id).toBe(before.session.id);
			expect(after.event.publishedAt).toEqual(before.event.publishedAt);
			const history = await eventAuditHistory(db, admin, { eventId: f.id });
			expect(history.items).toHaveLength(1);
			expect(history.items[0]?.participants).toEqual({
				beforeCount: 1,
				afterCount: 2,
				addedCount: 1,
				removedCount: 0,
			});
			await failure(eventAuditHistory(db, hco, { eventId: f.id }), "FORBIDDEN");
		});
		test("audit tables reject mutation/truncate, bad reason and FK; deferred event/session consistency survives deletion", async () => {
			const f = await fixture(false);
			await service.deleteEventDraft(db, admin, { eventId: f.id, reason });
			const g = await fixture();
			await full(g.id, g.draft);
			for (const table of ["event_audit_logs", "event_deletion_audits"])
				for (const operation of [
					`UPDATE ${table} SET reason='tampered'`,
					`DELETE FROM ${table}`,
					`TRUNCATE ${table}`,
				])
					await negativeSQL(operation);
			await negativeSQL(
				"insert into event_audit_logs(event_id,actor_user_id,action,reason,before_state,after_state) values ($1,$2,'EVENT_HIDDEN','', '{}','{}')",
				[g.id, adminId],
			);
			await negativeSQL(
				"insert into event_audit_logs(event_id,actor_user_id,action,reason,before_state,after_state) values ($1,$2,'EVENT_HIDDEN','valid', '{}','{}')",
				[randomUUID(), adminId],
			);
			await negativeSQL("update events set visibility='ARCHIVED' where id=$1", [
				g.id,
			]);
			await negativeSQL(
				"insert into event_audit_logs(event_id,actor_user_id,action,reason,before_state,after_state) values ($1,$2,'UNAPPROVED','valid', '{}','{}')",
				[g.id, adminId],
			);
			await negativeSQL(
				"insert into event_audit_logs(event_id,actor_user_id,action,reason,before_state,after_state) values ($1,$2,'EVENT_HIDDEN','valid', '[]','{}')",
				[g.id, adminId],
			);
			await negativeSQL(
				"insert into event_deletion_audits(event_id,actor_user_id,action,reason,event_snapshot) values ($1,$2,'EVENT_DRAFT_DELETED',' ','{}')",
				[randomUUID(), adminId],
			);

			const draft = await fixture(false);
			await negativeSQL("update events set visibility='HIDDEN' where id=$1", [
				draft.id,
			]);

			const client = await db.$client.connect();
			try {
				await client.query("BEGIN");
				await client.query(
					"delete from attendance_sessions where internal_event_id=$1",
					[draft.id],
				);
				await failure(client.query("SET CONSTRAINTS ALL IMMEDIATE"), "23514");
			} finally {
				await client.query("ROLLBACK");
				client.release();
			}
			expect(
				(await deletedDraftHistory(db, admin, {})).items.some(
					(item) => item.eventId === f.id,
				),
			).toBe(true);
			expect(
				await db.select().from(events).where(eq(events.id, f.id)),
			).toHaveLength(0);
		});
		test("audit/tombstone insert failure rolls back event, roster, session and both deletion rows", async () => {
			const f = await fixture();
			const before = await service.getEvent(db, admin, f.id);
			await failure(
				db.transaction(async (tx) => {
					await tx.execute(
						sql`create function pg_temp.reject_part3_audit() returns trigger language plpgsql as $$ begin raise exception 'synthetic audit rejection'; end $$`,
					);
					await tx.execute(
						sql`create trigger part3_test_audit_failure before insert on event_audit_logs for each row execute function pg_temp.reject_part3_audit()`,
					);
					await full(
						f.id,
						{
							...f.draft,
							rosterCriteria: { ...f.draft.rosterCriteria, include: [hcoId] },
						},
						tx as unknown as Database,
					);
				}),
			);
			expect(await service.getEvent(db, admin, f.id)).toEqual(before);
			const d = await fixture(false);
			await failure(
				db.transaction(async (tx) => {
					await tx.execute(
						sql`create function pg_temp.reject_part3_tombstone() returns trigger language plpgsql as $$ begin raise exception 'synthetic tombstone rejection'; end $$`,
					);
					await tx.execute(
						sql`create trigger part3_test_tombstone_failure before insert on event_deletion_audits for each row execute function pg_temp.reject_part3_tombstone()`,
					);
					await service.deleteEventDraft(tx as unknown as Database, admin, {
						eventId: d.id,
						reason,
					});
				}),
			);
			expect(
				(await service.getEvent(db, admin, d.id)).administration
					?.canDeleteDraft,
			).toBe(true);
		});
		test("full edit vs manual insertion serializes in both orders; attendance prevents subsequent full edit", async () => {
			for (const manualFirst of [true, false]) {
				const f = await fixture();
				const insert = (source = db) =>
					manualInsert(source, admin, { eventId: f.id, userId: srId, reason });
				const results = manualFirst
					? await race(f.id, insert, () => full(f.id, f.draft))
					: await race(
							f.id,
							(source) => full(f.id, f.draft, source),
							() => insert(),
						);
				expect(results[0]?.status).toBe("fulfilled");
				expect(results[1]?.status).toBe(manualFirst ? "rejected" : "fulfilled");
				expect((await recap(db, admin, f.id)).counts.present).toBe(1);
				await failure(full(f.id, f.draft), "CONFLICT");
			}
		});
		test("full edit vs activation serializes both orders without changing QR binding", async () => {
			for (const activationFirst of [true, false]) {
				const f = await fixture();
				const activate = (source = db) =>
					service.activateSession(source, admin, f.id);
				const results = activationFirst
					? await race(f.id, activate, () => full(f.id, f.draft))
					: await race(
							f.id,
							(source) => full(f.id, f.draft, source),
							() => activate(),
						);
				expect(results[0]?.status).toBe("fulfilled");
				expect(results[1]?.status).toBe(
					activationFirst ? "rejected" : "fulfilled",
				);
				expect((await service.getEvent(db, admin, f.id)).session.status).toBe(
					"ACTIVE",
				);
			}
		});
		test("hide vs activation serializes both orders; exactly one transition succeeds", async () => {
			for (const hideFirst of [true, false]) {
				const f = await fixture();
				const hide = (source = db) =>
					service.setEventVisibility(source, admin, {
						eventId: f.id,
						action: "HIDE",
						reason,
					});
				const activate = (source = db) =>
					service.activateSession(source, admin, f.id);
				const results = hideFirst
					? await race(f.id, hide, () => activate())
					: await race(f.id, activate, () => hide());
				expect(results[0]?.status).toBe("fulfilled");
				expect(results[1]?.status).toBe("rejected");
				const state = await service.getEvent(db, admin, f.id);
				expect(state.event.visibility).toBe(hideFirst ? "HIDDEN" : "VISIBLE");
				expect(state.session.status).toBe(hideFirst ? "INACTIVE" : "ACTIVE");
			}
		});
		test("draft deletion vs publish serializes both orders and leaves no partial/orphan records", async () => {
			for (const deleteFirst of [true, false]) {
				const f = await fixture(false);
				const remove = (source = db) =>
					service.deleteEventDraft(source, admin, { eventId: f.id, reason });
				const publish = (source = db) =>
					service.publishEvent(source, admin, f.id);
				const results = deleteFirst
					? await race(f.id, remove, () => publish())
					: await race(f.id, publish, () => remove());
				expect(results[0]?.status).toBe("fulfilled");
				expect(results[1]?.status).toBe("rejected");
				const session = await db
					.select()
					.from(attendanceSessions)
					.where(eq(attendanceSessions.internalEventId, f.id));
				expect(session).toHaveLength(deleteFirst ? 0 : 1);
			}
		});
		test("operational/audit references deny deletion; HCO archived direct detail/report access and SR history are retained", async () => {
			const d = await fixture(false);
			await db.insert(eventAuditLogs).values({
				eventId: d.id,
				actorUserId: adminId,
				action: "EVENT_HIDDEN",
				reason,
				beforeState: { visibility: "VISIBLE" },
				afterState: { visibility: "HIDDEN" },
			});
			await failure(
				service.deleteEventDraft(db, admin, { eventId: d.id, reason }),
				"CONFLICT",
			);
			const f = await fixture();
			await manualInsert(db, admin, { eventId: f.id, userId: srId, reason });
			await service.closeEvent(db, admin, f.id);
			await service.setEventVisibility(db, admin, {
				eventId: f.id,
				action: "ARCHIVE",
				reason,
			});
			expect(
				(await service.listEvents(db, hco)).events.some((e) => e.id === f.id),
			).toBe(false);
			expect((await service.getEvent(db, hco, f.id)).canManage).toBe(true);
			expect((await service.getEvent(db, hco, f.id)).administration).toBeNull();
			await failure(
				service.setEventVisibility(db, hco, {
					eventId: f.id,
					action: "RESTORE",
					reason,
				}),
				"FORBIDDEN",
			);
			await failure(service.getEvent(db, sr, f.id), "NOT_FOUND");
			expect((await recap(db, hco, f.id)).counts.present).toBe(1);
			expect(await exportCsv(db, hco, f.id)).toBeTruthy();
			expect(
				(await ownHistory(db, sr, { limit: 100, offset: 0 })).items.some(
					(e) => e.event.id === f.id,
				),
			).toBe(true);
			const directory = await getActiveSrDirectory(db);
			expect(directory.candidates.some((c) => c.userId === adminId)).toBe(
				false,
			);
		});
		test("audit API and privileged writes reject revoked/inactive identity on the next request", async () => {
			const f = await fixture();
			const caller = appRouter.createCaller({
				db,
				session: { user: { id: adminId } } as never,
			});
			await caller.attendance.eventAuditHistory({ eventId: f.id });
			await db
				.delete(systemPrivileges)
				.where(eq(systemPrivileges.userId, adminId));
			try {
				await failure(
					caller.attendance.eventAuditHistory({ eventId: f.id }),
					"UNAUTHORIZED",
				);
				await failure(
					caller.attendance.deletedDraftHistory({}),
					"UNAUTHORIZED",
				);
				await failure(full(f.id, f.draft), "FORBIDDEN");
			} finally {
				await db
					.insert(systemPrivileges)
					.values({ userId: adminId, privilegeCode: "SUPERADMIN" });
			}
			await db
				.update(userProfiles)
				.set({ isActive: false })
				.where(eq(userProfiles.userId, adminId));
			try {
				await failure(
					caller.attendance.eventAuditHistory({ eventId: f.id }),
					"UNAUTHORIZED",
				);
				await failure(full(f.id, f.draft), "FORBIDDEN");
			} finally {
				await db
					.update(userProfiles)
					.set({ isActive: true })
					.where(eq(userProfiles.userId, adminId));
			}
			const orphan = await db.execute<{ n: number }>(
				sql`select count(*)::int n from attendance_sessions s left join events e on e.id=s.internal_event_id where e.id is null`,
			);
			expect(orphan.rows[0]?.n).toBe(0);
		});
	},
);
