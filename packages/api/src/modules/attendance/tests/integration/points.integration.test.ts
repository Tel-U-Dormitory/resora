import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { getActiveIdentity } from "@resora/auth/sr-access";
import { createDb, type Database } from "@resora/db";
import { seedOrganization } from "@resora/db/organization";
import {
	attendanceRecords,
	attendanceSessions,
	eventParticipants,
	events,
} from "@resora/db/schema/attendance";
import { user } from "@resora/db/schema/auth";
import { committees } from "@resora/db/schema/committee";
import {
	buildings,
	srPeriodMemberships,
	srPeriods,
	srProfiles,
	systemPrivileges,
	userProfiles,
} from "@resora/db/schema/identity";
import { assignSyntheticSrTenure } from "@resora/db/sr-tenure.fixture";
import { eq, sql } from "drizzle-orm";
import { setEventVisibility } from "../../../../application/internal-events";
import { appRouter } from "../../../../routers";
import { setAccountPermission } from "../../../identity/account-permissions";
import {
	localProvisioningTarget,
	verifyLocalProvisioningDatabase,
} from "../../../identity/provisioning/sr-provisioning";
import { manualCorrect } from "../../manual-attendance";
import { pointsCsv } from "../../points-csv";
import {
	exportPointsCsv,
	pointsPeriods,
	pointsRecap,
} from "../../points-recap";

const target = process.env.RESORA_POINTS_TEST_DB_URL;
(target ? describe : describe.skip)(
	"attendance points on guarded disposable PostgreSQL",
	() => {
		let db: Database;
		let admin: NonNullable<Awaited<ReturnType<typeof getActiveIdentity>>>;
		let kadep: typeof admin;
		let member: typeof admin;
		const prefix = `synthetic-points-${randomUUID()}`;
		const ids = Object.fromEntries(
			["admin", "kadep", "member", "former", "zero"].map((key) => [
				key,
				`${prefix}-${key}`,
			]),
		) as Record<"admin" | "kadep" | "member" | "former" | "zero", string>;
		beforeAll(async () => {
			if (
				!target ||
				!/^resora_identity_test_points_[a-f0-9]{12}$/.test(
					new URL(localProvisioningTarget(target)).pathname.slice(1),
				)
			)
				throw Error("DISPOSABLE_POINTS_TEST_TARGET_REQUIRED");
			db = createDb({ DATABASE_URL: target, DB_POOL_MAX: 5 });
			db.$client.options.statement_timeout = 10_000;
			db.$client.options.lock_timeout = 3000;
			await verifyLocalProvisioningDatabase(db, target);
			const existing = await db.execute<{ n: number }>(
				sql`select count(*)::int n from "user" where email not like '%@synthetic.invalid'`,
			);
			expect(existing.rows[0]?.n).toBe(0);
			const fixtureState = await db.execute<{ n: number }>(
				sql`select count(*)::int n from events`,
			);
			if (fixtureState.rows[0]?.n !== 0)
				throw Error("FRESH_POINTS_TEST_DB_REQUIRED");
			await seedOrganization(db);
			const [building] = await db
				.select()
				.from(buildings)
				.where(eq(buildings.code, "A"));
			if (!building) throw Error("FIXTURE_BUILDING_REQUIRED");
			await db.transaction(async (tx) => {
				await tx.insert(user).values(
					Object.values(ids).map((id, i) => ({
						id,
						name: "Synthetic current name",
						email: `${id}@synthetic.invalid`,
						username: `000${i}${randomUUID().replaceAll("-", "")}`,
					})),
				);
				await tx.insert(userProfiles).values(
					Object.entries(ids).map(([key, userId]) => ({
						userId,
						actor:
							key === "admin" ? ("SYSTEM_ADMIN" as const) : ("SR" as const),
						mustChangePassword: false,
						isActive: key !== "former",
					})),
				);
				await tx.insert(srProfiles).values(
					["kadep", "member", "former", "zero"].map((key) => ({
						userId: ids[key as keyof typeof ids],
						departmentCode: key === "former" ? "RND" : "HCO",
						positionCode: key === "kadep" ? "KADEP" : "ANGGOTA",
						buildingId: building.id,
					})),
				);
				await tx
					.insert(systemPrivileges)
					.values({ userId: ids.admin, privilegeCode: "SUPERADMIN" });
			});
			await assignSyntheticSrTenure(db, [ids.kadep, ids.member]);
			const identities = await Promise.all(
				[ids.admin, ids.kadep, ids.member].map((id) =>
					getActiveIdentity(db, id),
				),
			);
			if (!identities[0] || !identities[1] || !identities[2])
				throw Error("FIXTURE_IDENTITY_REQUIRED");
			[admin, kadep, member] = identities as [
				typeof admin,
				typeof admin,
				typeof admin,
			];
		});
		afterAll(async () => {
			if (db) await db.$client.end();
		});
		async function failure(operation: Promise<unknown>, code: string) {
			let error: unknown;
			try {
				await operation;
			} catch (cause) {
				error = cause;
			}
			expect(error).toMatchObject({ code });
		}
		async function period(
			month: string,
			users = [ids.member, ids.former, ids.zero],
		) {
			const [value] = await db
				.insert(srPeriods)
				.values({
					name: `${prefix}-${month}`,
					startsOn: `2026-${month}-01`,
					endsOn: `2026-${month}-28`,
				})
				.returning();
			if (!value) throw Error("FIXTURE_PERIOD_REQUIRED");
			if (users.length)
				await db
					.insert(srPeriodMemberships)
					.values(users.map((userId) => ({ userId, periodId: value.id })));
			return value;
		}
		type EventOptions = {
			startsAt: string;
			mode?: "INCLUDED" | "EXCLUDED" | null;
			status?: "DRAFT" | "PUBLISHED" | "CLOSED";
			visibility?: "VISIBLE" | "HIDDEN" | "ARCHIVED";
			subset?: boolean;
			exclude?: string[];
			committeeId?: string;
			grace?: number;
			invited?: string[];
			attendance?: {
				userId: string;
				delta: number;
				timingClass: "EARLY" | "ON_TIME" | "LATE";
			}[];
		};
		async function event(input: EventOptions) {
			const start = new Date(input.startsAt);
			const closedAt = new Date(start.getTime() + 4 * 3600_000);
			const status = input.status ?? "CLOSED";
			return db.transaction(async (tx) => {
				const [e] = await tx
					.insert(events)
					.values({
						title: "Duplicate historical title",
						createdByUserId: ids.admin,
						startsAt: start,
						endsAt: new Date(start.getTime() + 3 * 3600_000),
						status,
						visibility: input.visibility ?? "VISIBLE",
						attendanceScoringMode:
							input.mode === undefined ? "INCLUDED" : input.mode,
						organizationContext: input.committeeId ? "COMMITTEE" : "SR",
						committeeId: input.committeeId ?? null,
						snapshotCommitteeName: input.committeeId
							? "Historical committee"
							: null,
						publishedAt:
							status === "DRAFT" ? null : new Date(start.getTime() - 3600_000),
						closedAt: status === "CLOSED" ? closedAt : null,
						rosterCriteria: {
							allSr: !input.subset && !input.committeeId,
							exclude: input.exclude ?? [],
							include: [],
							individuals: [],
							inti: false,
							kadep: false,
							departments: [],
						},
					})
					.returning();
				if (!e) throw Error("FIXTURE_EVENT_REQUIRED");
				const [session] = await tx
					.insert(attendanceSessions)
					.values({
						internalEventId: e.id,
						centerLat: 0,
						centerLng: 0,
						status: status === "CLOSED" ? "CLOSED" : "INACTIVE",
						activatedAt: status === "CLOSED" ? start : null,
						closedAt: status === "CLOSED" ? closedAt : null,
						lateGraceMinutes: input.grace ?? 15,
					})
					.returning();
				if (!session) throw Error("FIXTURE_SESSION_REQUIRED");
				const invited = input.invited ?? [ids.member];
				if (invited.length)
					await tx.insert(eventParticipants).values(
						invited.map((userId) => ({
							eventId: e.id,
							userId,
							nim: "historical-nim",
							name: "Historical participant",
							departmentCode: "HCO",
							positionCode: "ANGGOTA",
							buildingCode: "A",
							buildingName: "Historical building",
							committeeDivision: input.committeeId
								? "Historical division"
								: null,
							committeePosition: input.committeeId ? ("PIC1" as const) : null,
						})),
					);
				const records = input.attendance?.length
					? await tx
							.insert(attendanceRecords)
							.values(
								input.attendance.map((r) => ({
									sessionId: session.id,
									userId: r.userId,
									attendanceAt: new Date(start.getTime() + r.delta),
									timingClass: r.timingClass,
									source: "MANUAL" as const,
									recordedByUserId: ids.admin,
									manualReason: "Synthetic original record",
								})),
							)
							.returning()
					: [];
				return { event: e, session, records };
			});
		}
		test("period matrix respects Jakarta boundaries, lifecycle, visibility, snapshots and zero-event former members", async () => {
			const p = await period("01");
			const [committee] = await db
				.insert(committees)
				.values({ name: "Current committee name", createdByUserId: ids.admin })
				.returning();
			if (!committee) throw Error("FIXTURE_COMMITTEE_REQUIRED");
			const full = await event({
				startsAt: "2025-12-31T17:00:00Z",
				invited: [ids.member, ids.former],
				attendance: [{ userId: ids.member, delta: 0, timingClass: "ON_TIME" }],
			});
			const partial = await event({
				startsAt: "2026-01-02T02:00:00Z",
				subset: true,
				grace: 5,
				visibility: "HIDDEN",
				attendance: [
					{ userId: ids.member, delta: 20 * 60_000, timingClass: "LATE" },
				],
			});
			const unclassified = await event({
				startsAt: "2026-01-03T02:00:00Z",
				mode: null,
			});
			await event({ startsAt: "2026-01-02T02:00:00Z", invited: [] });
			await event({ startsAt: "2026-01-04T02:00:00Z", exclude: [ids.zero] });
			const committeeEvent = await event({
				startsAt: "2026-01-05T02:00:00Z",
				committeeId: committee.id,
				visibility: "ARCHIVED",
				attendance: [
					{ userId: ids.member, delta: 30 * 60_000 + 1, timingClass: "LATE" },
				],
			});
			await event({
				startsAt: "2026-01-28T16:59:59.999Z",
				invited: [ids.former],
				attendance: [{ userId: ids.former, delta: -1, timingClass: "EARLY" }],
			});
			for (const input of [
				{ startsAt: "2025-12-31T16:59:59.999Z" },
				{ startsAt: "2026-01-28T17:00:00Z" },
				{ startsAt: "2026-01-09T02:00:00Z", mode: "EXCLUDED" as const },
				{ startsAt: "2026-01-10T02:00:00Z", status: "PUBLISHED" as const },
				{ startsAt: "2026-01-11T02:00:00Z", status: "DRAFT" as const },
			])
				await event(input);
			const defaults = await pointsRecap(db, admin, { periodId: p.id });
			expect(defaults.events).toHaveLength(6);
			expect(
				defaults.events.some((e) => e.eventId === committeeEvent.event.id),
			).toBe(false);
			expect(defaults.availableEvents).toHaveLength(7);
			const report = await pointsRecap(db, admin, {
				periodId: p.id,
				selectedEventIds: defaults.availableEvents.map((e) => e.eventId),
			});
			expect(report.events).toHaveLength(7);
			expect(report.events.map((e) => e.eventId)).toEqual(
				[...report.events]
					.sort(
						(a, b) =>
							a.startsAt.getTime() - b.startsAt.getTime() ||
							a.eventId.localeCompare(b.eventId),
					)
					.map((e) => e.eventId),
			);
			expect(
				report.events.find((e) => e.eventId === full.event.id)?.maximumPoints,
			).toBe(10);
			expect(
				report.events.find((e) => e.eventId === partial.event.id)
					?.maximumPoints,
			).toBe(6);
			expect(
				report.events.find((e) => e.eventId === committeeEvent.event.id),
			).toMatchObject({
				maximumPoints: 6,
				committeeName: "Historical committee",
			});
			expect(new Set(report.participants.map((r) => r.userId)).size).toBe(3);
			expect(report.participants.some((r) => r.userId === ids.admin)).toBe(
				false,
			);
			const member = report.participants.find((r) => r.userId === ids.member);
			expect(member).toMatchObject({
				attendedCount: 3,
				absentCount: 1,
				eventCount: 4,
				totalPoints: 17.2,
				maximumPossiblePoints: 28,
				unclassifiedCount: 1,
				scoringStatus: "PARTIAL",
			});
			expect(
				member?.events.find((e) => e.eventId === unclassified.event.id),
			).toMatchObject({
				scoringStatus: "UNCLASSIFIED",
				points: null,
				maximumPoints: null,
			});
			expect(
				member?.events.find((e) => e.eventId === committeeEvent.event.id)
					?.snapshot,
			).toMatchObject({
				name: "Historical participant",
				nim: "historical-nim",
				committeeDivision: "Historical division",
				committeePosition: "PIC1",
			});
			expect(
				report.participants.find((r) => r.userId === ids.former),
			).toMatchObject({
				attendedCount: 1,
				absentCount: 1,
				eventCount: 2,
				totalPoints: 10,
				maximumPossiblePoints: 20,
				scoringStatus: "COMPLETE",
			});
			expect(
				report.participants.find((r) => r.userId === ids.zero),
			).toMatchObject({
				attendedCount: 0,
				absentCount: 0,
				eventCount: 0,
				totalPoints: 0,
				maximumPossiblePoints: 0,
			});
		});
		test("all HCO can read while grants, revoked department/privilege and inactive identities cannot bypass live checks", async () => {
			const p = await period("02", [ids.member]);
			const caller = appRouter.createCaller({
				db,
				session: { user: { id: ids.kadep } },
			} as never);
			expect(
				(await caller.attendance.pointsRecap({ periodId: p.id })).participants,
			).toHaveLength(1);
			await setAccountPermission(db, admin, {
				userId: ids.member,
				permissionCode: "ATTENDANCE_MANUAL_MANAGE",
				enabled: true,
			});
			try {
				for (const positionCode of ["KADEP", "SEKDEP", "ANGGOTA"]) {
					await db
						.update(srProfiles)
						.set({ positionCode })
						.where(eq(srProfiles.userId, ids.member));
					const current = await getActiveIdentity(db, ids.member);
					if (!current) throw Error("FIXTURE_IDENTITY_REQUIRED");
					const client = appRouter.createCaller({
						db,
						session: { user: { id: ids.member } },
					} as never);
					expect(
						(await client.attendance.pointsRecap({ periodId: p.id }))
							.participants,
					).toHaveLength(1);
					expect(
						(await client.attendance.pointsPeriods()).some(
							(period) => period.periodId === p.id,
						),
					).toBe(true);
					expect(
						(await client.attendance.exportPointsCsv({ periodId: p.id }))
							.content,
					).toContain("Total Poin");
					expect(await client.identity.session()).toMatchObject({
						canReadAttendancePoints: true,
						canManageEventScoring: positionCode === "KADEP",
					});
					if (positionCode !== "KADEP")
						await failure(
							client.attendance.setScoringMode({
								eventId: randomUUID(),
								scoringMode: "INCLUDED",
							}),
							"FORBIDDEN",
						);
				}
				await db
					.update(srProfiles)
					.set({ departmentCode: "RND" })
					.where(eq(srProfiles.userId, ids.member));
				await failure(pointsRecap(db, member, { periodId: p.id }), "FORBIDDEN");
				await failure(pointsPeriods(db, member), "FORBIDDEN");
				await failure(
					exportPointsCsv(db, member, { periodId: p.id }),
					"FORBIDDEN",
				);
				await db
					.update(srProfiles)
					.set({ departmentCode: "HCO" })
					.where(eq(srProfiles.userId, ids.member));
				await db
					.update(srProfiles)
					.set({ departmentCode: "RND" })
					.where(eq(srProfiles.userId, ids.kadep));
				await failure(pointsRecap(db, kadep, { periodId: p.id }), "FORBIDDEN");
				await db
					.update(srProfiles)
					.set({ positionCode: "KADEP", departmentCode: "HCO" })
					.where(eq(srProfiles.userId, ids.kadep));
				await db
					.update(userProfiles)
					.set({ isActive: false })
					.where(eq(userProfiles.userId, ids.kadep));
				await failure(pointsRecap(db, kadep, { periodId: p.id }), "FORBIDDEN");
				await db
					.delete(systemPrivileges)
					.where(eq(systemPrivileges.userId, ids.admin));
				await failure(pointsRecap(db, admin, { periodId: p.id }), "FORBIDDEN");
			} finally {
				await db
					.update(userProfiles)
					.set({ isActive: true })
					.where(eq(userProfiles.userId, ids.kadep));
				await db
					.insert(systemPrivileges)
					.values({ userId: ids.admin, privilegeCode: "SUPERADMIN" })
					.onConflictDoNothing();
				await db
					.update(srProfiles)
					.set({ positionCode: "KADEP", departmentCode: "HCO" })
					.where(eq(srProfiles.userId, ids.kadep));
				await db
					.update(srProfiles)
					.set({ departmentCode: "HCO", positionCode: "ANGGOTA" })
					.where(eq(srProfiles.userId, ids.member));
				await setAccountPermission(db, admin, {
					userId: ids.member,
					permissionCode: "ATTENDANCE_MANUAL_MANAGE",
					enabled: false,
				});
			}
			await failure(
				pointsRecap(db, admin, { periodId: randomUUID() }),
				"NOT_FOUND",
			);
		});
		test("report is read-only and stays on one MVCC snapshot during a real manual correction", async () => {
			const p = await period("03", [ids.member]);
			const e = await event({
				startsAt: "2026-03-02T02:00:00Z",
				attendance: [{ userId: ids.member, delta: 0, timingClass: "ON_TIME" }],
			});
			const started = Promise.withResolvers<void>();
			const resume = Promise.withResolvers<void>();
			const record = e.records[0];
			if (!record) throw Error("FIXTURE_RECORD_REQUIRED");
			const held = new Proxy(db, {
				get(object, key, receiver) {
					if (key !== "transaction") return Reflect.get(object, key, receiver);
					return (
						callback: Parameters<Database["transaction"]>[0],
						options: Parameters<Database["transaction"]>[1],
					) =>
						db.transaction(async (tx) => {
							const settings = await tx.execute<{
								isolation: string;
								read_only: string;
								n: number;
							}>(
								sql`select current_setting('transaction_isolation') as isolation, current_setting('transaction_read_only') as read_only, count(*)::int n from attendance_records`,
							);
							expect(settings.rows[0]).toMatchObject({
								isolation: "repeatable read",
								read_only: "on",
							});
							started.resolve();
							await resume.promise;
							return callback(tx);
						}, options);
				},
			});
			const reading = pointsRecap(held, admin, { periodId: p.id });
			await started.promise;
			try {
				await manualCorrect(db, admin, {
					attendanceId: record.id,
					attendanceAt: new Date(
						e.event.startsAt.getTime() + 16 * 60_000,
					).toISOString(),
					reason: "Synthetic attendance correction",
				});
			} finally {
				resume.resolve();
			}
			expect((await reading).participants[0]?.totalPoints).toBe(10);
			expect(
				(await pointsRecap(db, admin, { periodId: p.id })).participants[0]
					?.totalPoints,
			).toBe(7);
		});
		test("inconsistent stored classification is explicit, while empty periods retain zero-event rows", async () => {
			const p = await period("04", [ids.member]);
			await event({
				startsAt: "2026-04-02T02:00:00Z",
				attendance: [
					{ userId: ids.member, delta: 40 * 60_000, timingClass: "ON_TIME" },
				],
			});
			const report = await pointsRecap(db, admin, { periodId: p.id });
			expect(report.participants[0]).toMatchObject({
				attendedCount: 0,
				absentCount: 0,
				eventCount: 1,
				totalPoints: 0,
				maximumPossiblePoints: 10,
				scoringStatus: "PARTIAL",
			});
			expect(report.participants[0]?.events[0]).toMatchObject({
				points: null,
				scoringStatus: "UNSCORABLE",
			});
			const empty = await period("05", [ids.member, ids.former]);
			expect(
				(await pointsRecap(db, admin, { periodId: empty.id })).participants.map(
					(r) => [r.eventCount, r.totalPoints, r.scoringStatus],
				),
			).toEqual([
				[0, 0, "COMPLETE"],
				[0, 0, "COMPLETE"],
			]);
		});
		test("F3 period options and CSV retain historical members, distinguish current metadata and remain read-only", async () => {
			const p = await period("06");
			await event({
				startsAt: "2026-06-02T02:00:00Z",
				invited: [ids.former],
				attendance: [{ userId: ids.former, delta: 0, timingClass: "ON_TIME" }],
			});
			const report = await pointsRecap(db, admin, { periodId: p.id });
			const former = report.participants.find(
				(row) => row.userId === ids.former,
			);
			expect(former).toMatchObject({
				currentDepartmentCode: "RND",
				currentBuildingCode: "A",
			});
			expect(former?.events[0]?.snapshot).toMatchObject({
				departmentCode: "HCO",
				buildingName: "Historical building",
				buildingCode: "A",
			});
			for (const identity of [admin, kadep]) {
				const options = await pointsPeriods(db, identity);
				expect(options.some((option) => option.periodId === p.id)).toBe(true);
				for (const option of options)
					expect(Object.keys(option).sort()).toEqual([
						"endsOn",
						"name",
						"periodId",
						"startsOn",
					]);
			}
			const caller = appRouter.createCaller({
				db,
				session: { user: { id: ids.kadep } },
			} as never);
			await failure(caller.identity.listPeriods(), "FORBIDDEN");
			expect((await caller.identity.session())?.canManageEventScoring).toBe(
				true,
			);
			const memberCaller = appRouter.createCaller({
				db,
				session: { user: { id: ids.member } },
			} as never);
			expect(await memberCaller.identity.session()).toMatchObject({
				canManageEventScoring: false,
				canReadAttendancePoints: true,
				canManageInternalEvents: true,
				canManageBroadcast: false,
				isSuperadmin: false,
			});
			const held = new Proxy(db, {
				get(object, key, receiver) {
					if (key !== "transaction") return Reflect.get(object, key, receiver);
					return (
						callback: Parameters<Database["transaction"]>[0],
						options: Parameters<Database["transaction"]>[1],
					) =>
						db.transaction(async (tx) => {
							const settings = await tx.execute<{ value: string }>(
								sql`select current_setting('transaction_read_only') as value`,
							);
							expect(settings.rows[0]?.value).toBe("on");
							return callback(tx);
						}, options);
				},
			});
			const csv = await exportPointsCsv(held, kadep, { periodId: p.id });
			expect(csv.content).toBe(pointsCsv(report));
			expect(csv.content.split("\r\n")).toHaveLength(
				report.participants.length + 2,
			);
			expect(csv.filename).toContain(p.id);
			for (const field of ["gpsAccuracy", "scanLat", "qrToken", "audit"])
				expect(csv.content).not.toContain(field);
		});
		test("default/custom/empty selections preserve every total and CSV, reject ineligible IDs, and never write", async () => {
			const p = await period("07");
			const a = await event({
				startsAt: "2026-07-02T02:00:00Z",
				attendance: [{ userId: ids.member, delta: 0, timingClass: "ON_TIME" }],
			});
			const b = await event({
				startsAt: "2026-07-03T02:00:00Z",
				visibility: "HIDDEN",
				attendance: [
					{ userId: ids.member, delta: 16 * 60_000, timingClass: "LATE" },
				],
			});
			const c = await event({
				startsAt: "2026-07-04T02:00:00Z",
				visibility: "ARCHIVED",
				subset: true,
				attendance: [{ userId: ids.member, delta: 0, timingClass: "ON_TIME" }],
			});
			const d = await event({
				startsAt: "2026-07-05T02:00:00Z",
				visibility: "ARCHIVED",
				mode: null,
			});
			const e = await event({
				startsAt: "2026-07-06T02:00:00Z",
				visibility: "HIDDEN",
				mode: null,
				invited: [ids.former],
			});
			const invalid = [];
			for (const options of [
				{ mode: "EXCLUDED" as const },
				{ status: "PUBLISHED" as const },
				{ status: "DRAFT" as const },
			])
				invalid.push(
					(await event({ startsAt: "2026-07-10T02:00:00Z", ...options })).event
						.id,
				);
			invalid.push(
				(await event({ startsAt: "2026-08-01T02:00:00Z" })).event.id,
				randomUUID(),
			);
			const snapshot = () =>
				db.execute(
					sql`select (select jsonb_agg(e order by e.id) from events e) as events,(select jsonb_agg(a order by a.id) from attendance_records a) as attendance,(select jsonb_agg(p order by p.event_id,p.user_id) from event_participants p) as invitations,(select count(*)::int from event_audit_logs) as audits`,
				);
			const before = (await snapshot()).rows;
			const defaults = await pointsRecap(db, admin, { periodId: p.id });
			expect(defaults.events.map((e) => e.eventId)).toEqual([
				a.event.id,
				b.event.id,
				e.event.id,
			]);
			expect(defaults.availableEvents.map((e) => e.eventId)).toEqual([
				a.event.id,
				b.event.id,
				c.event.id,
				d.event.id,
				e.event.id,
			]);
			expect(
				defaults.participants.find((r) => r.userId === ids.member),
			).toMatchObject({
				attendedCount: 2,
				absentCount: 0,
				eventCount: 2,
				totalPoints: 17,
				maximumPossiblePoints: 20,
				unclassifiedCount: 0,
				scoringStatus: "COMPLETE",
			});
			expect(
				defaults.participants.find((r) => r.userId === ids.former),
			).toMatchObject({ unclassifiedCount: 1, scoringStatus: "PARTIAL" });
			for (const [selectedEventIds, total, maximum, unclassified, status] of [
				[[c.event.id, b.event.id, a.event.id], 23, 26, 0, "COMPLETE"],
				[[a.event.id], 10, 10, 0, "COMPLETE"],
				[[d.event.id], 0, 0, 1, "PARTIAL"],
				[[], 0, 0, 0, "COMPLETE"],
			] as const) {
				const input = {
					periodId: p.id,
					selectedEventIds: [...selectedEventIds],
				};
				const report = await pointsRecap(db, kadep, input);
				expect(report.participants).toHaveLength(3);
				expect(
					report.participants.find((r) => r.userId === ids.member),
				).toMatchObject({
					totalPoints: total,
					maximumPossiblePoints: maximum,
					unclassifiedCount: unclassified,
					scoringStatus: status,
				});
				expect((await exportPointsCsv(db, kadep, input)).content).toBe(
					pointsCsv(report),
				);
			}
			const caller = appRouter.createCaller({
				db,
				session: { user: { id: ids.kadep } },
			} as never);
			for (const eventId of invalid)
				await failure(
					caller.attendance.pointsRecap({
						periodId: p.id,
						selectedEventIds: [eventId],
					}),
					"BAD_REQUEST",
				);
			for (const selectedEventIds of [["bad"], [a.event.id, a.event.id]])
				await failure(
					caller.attendance.exportPointsCsv({
						periodId: p.id,
						selectedEventIds,
					}),
					"BAD_REQUEST",
				);
			for (const positionCode of ["KADEP", "SEKDEP", "ANGGOTA"]) {
				await db
					.update(srProfiles)
					.set({ positionCode })
					.where(eq(srProfiles.userId, ids.member));
				const client = appRouter.createCaller({
					db,
					session: { user: { id: ids.member } },
				} as never);
				const input = { periodId: p.id, selectedEventIds: [c.event.id] };
				const report = await client.attendance.pointsRecap(input);
				expect(report.events.map((e) => e.eventId)).toEqual([c.event.id]);
				expect(
					(await client.attendance.exportPointsCsv(input)).content,
				).toContain("Total Poin");
			}
			expect((await snapshot()).rows).toEqual(before);
			await setEventVisibility(db, admin, {
				eventId: a.event.id,
				action: "ARCHIVE",
				reason: "Synthetic archive test",
			});
			expect(
				(await pointsRecap(db, admin, { periodId: p.id })).events.some(
					(e) => e.eventId === a.event.id,
				),
			).toBe(false);
			await setEventVisibility(db, admin, {
				eventId: a.event.id,
				action: "RESTORE",
				reason: "Synthetic restore test",
			});
			expect(
				(await pointsRecap(db, admin, { periodId: p.id })).events.some(
					(e) => e.eventId === a.event.id,
				),
			).toBe(true);
			expect(
				(await db.select().from(events).where(eq(events.id, a.event.id)))[0]
					?.attendanceScoringMode,
			).toBe("INCLUDED");
		});
	},
);
