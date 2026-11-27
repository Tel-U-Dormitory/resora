import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
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
import {
	buildings,
	srPeriodMemberships,
	srPeriods,
	srProfiles,
	systemPrivileges,
	userProfiles,
} from "@resora/db/schema/identity";
import { eq, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { appRouter } from "../../../../routers";

function scratchTarget(value: string) {
	const url = new URL(value);
	if (
		!["postgres:", "postgresql:"].includes(url.protocol) ||
		url.hostname !== "127.0.0.1" ||
		url.pathname !== "/resora_test_penilaian" ||
		!url.username ||
		!url.port ||
		url.search ||
		url.hash
	)
		throw Error("EXPLICIT_EMPTY_LOOPBACK_PENILAIAN_DATABASE_REQUIRED");
	return url;
}

test("penilaian integration guard refuses remote, ambiguous and existing operational database targets", () => {
	for (const value of [
		"invalid",
		"postgresql://test@remote:5432/resora_test_penilaian",
		"postgresql://test@127.0.0.1/resora_test_penilaian",
		"postgresql://test@127.0.0.1:5432/postgres",
		"postgresql://test@127.0.0.1:5432/resora_test_penilaian?host=remote",
	])
		expect(() => scratchTarget(value)).toThrow();
});

const target = process.env.RESORA_PENILAIAN_TEST_DB_URL;

(target ? describe : describe.skip)(
	"penilaian end-to-end on verified disposable PostgreSQL",
	() => {
		let db: Database;
		const prefix = `syn-pen-${randomUUID().slice(0, 8)}`;
		const ids = {
			superadmin: `${prefix}-superadmin`,
			hcoKadep: `${prefix}-hco-kadep`,
			intiKetum: `${prefix}-inti-ketum`,
			intiWaketum: `${prefix}-inti-waketum`,
			rndKadep: `${prefix}-rnd-kadep`,
			rndSekdep: `${prefix}-rnd-sekdep`,
			rndMember: `${prefix}-rnd-member`,
		};

		function makeCaller(userId: string) {
			return appRouter.createCaller({
				db,
				session: { user: { id: userId } },
			} as never);
		}

		let srPeriodId: string;
		let eventId: string;

		beforeAll(async () => {
			if (!target) return;
			scratchTarget(target);
			db = createDb({ DATABASE_URL: target, DB_POOL_MAX: 5 });
			await migrate(db, {
				migrationsFolder: resolve(
					import.meta.dir,
					"../../../../../../db/src/migrations",
				),
			});
			await seedOrganization(db);

			const [building] = await db
				.select()
				.from(buildings)
				.where(eq(buildings.code, "A"));
			if (!building) throw Error("FIXTURE_BUILDING_A_MISSING");

			await db.transaction(async (tx) => {
				await tx.insert(user).values([
					{
						id: ids.superadmin,
						name: "Superadmin Sintetis",
						email: `${ids.superadmin}@synthetic.invalid`,
						username: "pen.superadmin",
					},
					{
						id: ids.hcoKadep,
						name: "Kadep HCO Sintetis",
						email: `${ids.hcoKadep}@synthetic.invalid`,
						username: "9901000001",
					},
					{
						id: ids.intiKetum,
						name: "Ketum Inti Sintetis",
						email: `${ids.intiKetum}@synthetic.invalid`,
						username: "9901000002",
					},
					{
						id: ids.intiWaketum,
						name: "Waketum Inti Sintetis",
						email: `${ids.intiWaketum}@synthetic.invalid`,
						username: "9901000006",
					},
					{
						id: ids.rndKadep,
						name: "Kadep RND Sintetis",
						email: `${ids.rndKadep}@synthetic.invalid`,
						username: "9901000003",
					},
					{
						id: ids.rndSekdep,
						name: "Sekdep RND Sintetis",
						email: `${ids.rndSekdep}@synthetic.invalid`,
						username: "9901000004",
					},
					{
						id: ids.rndMember,
						name: "Anggota RND Sintetis",
						email: `${ids.rndMember}@synthetic.invalid`,
						username: "9901000005",
					},
				]);

				await tx.insert(userProfiles).values(
					Object.entries(ids).map(([key, userId]) => ({
						userId,
						actor:
							key === "superadmin"
								? ("SYSTEM_ADMIN" as const)
								: ("SR" as const),
						mustChangePassword: false,
						isActive: true,
					})),
				);

				await tx.insert(systemPrivileges).values({
					userId: ids.superadmin,
					privilegeCode: "SUPERADMIN",
				});

				await tx.insert(srProfiles).values([
					{
						userId: ids.hcoKadep,
						departmentCode: "HCO",
						positionCode: "KADEP",
						buildingId: building.id,
					},
					{
						userId: ids.intiKetum,
						departmentCode: "INTI",
						positionCode: "KETUM",
						buildingId: building.id,
					},
					{
						userId: ids.intiWaketum,
						departmentCode: "INTI",
						positionCode: "WAKETUM",
						buildingId: building.id,
					},
					{
						userId: ids.rndKadep,
						departmentCode: "RND",
						positionCode: "KADEP",
						buildingId: building.id,
					},
					{
						userId: ids.rndSekdep,
						departmentCode: "RND",
						positionCode: "SEKDEP",
						buildingId: building.id,
					},
					{
						userId: ids.rndMember,
						departmentCode: "RND",
						positionCode: "ANGGOTA",
						buildingId: building.id,
					},
				]);

				const [srP] = await tx
					.insert(srPeriods)
					.values({
						name: `${prefix}-tenure`,
						startsOn: "2026-07-01",
						endsOn: "2027-06-30",
					})
					.returning();
				if (!srP) throw Error("FIXTURE_SR_PERIOD_FAILED");
				srPeriodId = srP.id;

				const srMemberList = [
					ids.hcoKadep,
					ids.intiKetum,
					ids.intiWaketum,
					ids.rndKadep,
					ids.rndSekdep,
					ids.rndMember,
				];
				await tx
					.insert(srPeriodMemberships)
					.values(srMemberList.map((userId) => ({ userId, periodId: srP.id })));

				const startsAt = new Date("2026-09-10T09:00:00Z");
				const closedAt = new Date("2026-09-10T12:00:00Z");
				const [evt] = await tx
					.insert(events)
					.values({
						title: `${prefix}-annual-event`,
						createdByUserId: ids.hcoKadep,
						startsAt,
						endsAt: new Date("2026-09-10T11:30:00Z"),
						status: "CLOSED",
						visibility: "VISIBLE",
						attendanceScoringMode: "INCLUDED",
						organizationContext: "SR",
						publishedAt: new Date("2026-09-09T09:00:00Z"),
						closedAt,
						rosterCriteria: {
							allSr: true,
							exclude: [],
							include: [],
							individuals: [],
							inti: false,
							kadep: false,
							departments: [],
						},
					})
					.returning();
				if (!evt) throw Error("FIXTURE_EVENT_FAILED");
				eventId = evt.id;

				const [sess] = await tx
					.insert(attendanceSessions)
					.values({
						internalEventId: evt.id,
						centerLat: 0,
						centerLng: 0,
						status: "CLOSED",
						activatedAt: startsAt,
						closedAt,
						lateGraceMinutes: 15,
					})
					.returning();
				if (!sess) throw Error("FIXTURE_SESSION_FAILED");

				const srEntries = [
					{
						userId: ids.hcoKadep,
						nim: "9901000001",
						name: "Kadep HCO Sintetis",
						dept: "HCO",
						pos: "KADEP",
					},
					{
						userId: ids.intiKetum,
						nim: "9901000002",
						name: "Ketum Inti Sintetis",
						dept: "INTI",
						pos: "KETUM",
					},
					{
						userId: ids.intiWaketum,
						nim: "9901000006",
						name: "Waketum Inti Sintetis",
						dept: "INTI",
						pos: "WAKETUM",
					},
					{
						userId: ids.rndKadep,
						nim: "9901000003",
						name: "Kadep RND Sintetis",
						dept: "RND",
						pos: "KADEP",
					},
					{
						userId: ids.rndSekdep,
						nim: "9901000004",
						name: "Sekdep RND Sintetis",
						dept: "RND",
						pos: "SEKDEP",
					},
					{
						userId: ids.rndMember,
						nim: "9901000005",
						name: "Anggota RND Sintetis",
						dept: "RND",
						pos: "ANGGOTA",
					},
				];
				await tx.insert(eventParticipants).values(
					srEntries.map((s) => ({
						eventId: evt.id,
						userId: s.userId,
						nim: s.nim,
						name: s.name,
						departmentCode: s.dept,
						positionCode: s.pos,
						buildingId: building.id,
						buildingCode: building.code,
						buildingName: building.name,
						committeeDivision: "Inti",
						committeePosition: "ANGGOTA" as const,
					})),
				);
				await tx.insert(attendanceRecords).values({
					sessionId: sess.id,
					userId: ids.rndMember,
					timingClass: "ON_TIME",
					source: "MANUAL" as const,
					recordedByUserId: ids.hcoKadep,
					attendanceAt: startsAt,
					manualReason: "Synthetic seed attendance",
				});
			});
		});

		afterAll(async () => {
			if (db) await db.$client.end();
		});

		test("evaluation tables enforce RLS and append-only audit triggers in PostgreSQL", async () => {
			const rls = await db.execute<{
				relname: string;
				relrowsecurity: boolean;
			}>(
				sql`SELECT relname, relrowsecurity FROM pg_class WHERE relname LIKE 'evaluation_%' AND relkind = 'r' ORDER BY relname`,
			);
			expect(rls.rows.length).toBe(9);
			for (const row of rls.rows) {
				expect(row.relrowsecurity).toBe(true);
			}
		});

		test("full evaluation lifecycle passes end-to-end with FR-EVAL-036 and immutability", async () => {
			const superadminCaller = makeCaller(ids.superadmin);
			const hcoCaller = makeCaller(ids.hcoKadep);
			const intiCaller = makeCaller(ids.intiKetum);
			const inti2Caller = makeCaller(ids.intiWaketum);
			const rndKadepCaller = makeCaller(ids.rndKadep);
			const rndSekdepCaller = makeCaller(ids.rndSekdep);
			const rndMemberCaller = makeCaller(ids.rndMember);

			// Verify live identities resolve properly.
			expect((await getActiveIdentity(db, ids.hcoKadep))?.actor).toBe("SR");

			// Non-KADEP-HCO fails period creation.
			await expect(
				rndKadepCaller.penilaian.createPeriod({
					srPeriodId,
					name: "Unauthorized Period",
				}),
			).rejects.toThrow();

			const period = await hcoCaller.penilaian.createPeriod({
				srPeriodId,
				name: `${prefix}-Eval`,
				sidakMaxPoints: 10,
				performanceThreshold: null,
				isActive: true,
			});
			expect(period.performanceThreshold).toBeNull();

			const periodEvent = await hcoCaller.penilaian.configurePeriodEvent({
				evaluationPeriodId: period.id,
				eventId,
				category: "ANNUAL",
				isMandatory: true,
			});

			// Non-HCO Kadep can list point proposal targets cleanly pre-final without scores.
			const targets = await rndKadepCaller.penilaian.listPointProposalTargets({
				evaluationPeriodId: period.id,
			});
			expect(targets).toHaveLength(6);

			// Regular SR cannot view pre-final recap.
			const preFinalOwn = await rndMemberCaller.penilaian.ownRecap({
				evaluationPeriodId: period.id,
			});
			expect(preFinalOwn.status).toBe("BELUM_FINAL");

			// Score event across roster (hcoKadep scores everyone else; intiKetum scores hcoKadep).
			const srIds = [
				ids.hcoKadep,
				ids.intiKetum,
				ids.intiWaketum,
				ids.rndKadep,
				ids.rndSekdep,
				ids.rndMember,
			];
			const callersByUser: Record<string, ReturnType<typeof makeCaller>> = {
				[ids.hcoKadep]: hcoCaller,
				[ids.intiKetum]: intiCaller,
				[ids.intiWaketum]: inti2Caller,
				[ids.rndKadep]: rndKadepCaller,
				[ids.rndSekdep]: rndSekdepCaller,
				[ids.rndMember]: rndMemberCaller,
			};
			let memberEventScoreId = "";
			for (const evaluatorId of srIds) {
				const evaluator = callersByUser[evaluatorId];
				if (!evaluator) throw new Error("Caller missing");
				for (const targetId of srIds) {
					if (evaluatorId === targetId) continue;
					const saved = await evaluator.penilaian.submitEventScore({
						evaluationPeriodId: period.id,
						periodEventId: periodEvent.id,
						targetUserId: targetId,
						commitment: 5,
						teamwork: 5,
						attitude: 5,
						contribution: 5,
						comment: "Kontribusi event baik",
					});
					if (evaluatorId === ids.hcoKadep && targetId === ids.rndMember) {
						memberEventScoreId = saved.id;
					}
				}
			}

			// SEKDEP is rejected for department evaluation (FR-EVAL-032).
			await expect(
				rndSekdepCaller.penilaian.submitDepartmentScore({
					evaluationPeriodId: period.id,
					quarterNumber: 1,
					targetUserId: ids.rndMember,
					commitment: 5,
					teamwork: 5,
					attitude: 5,
					contribution: 5,
				}),
			).rejects.toThrow();

			// Complete all D03 department evaluations.
			await rndKadepCaller.penilaian.submitDepartmentScore({
				evaluationPeriodId: period.id,
				quarterNumber: 1,
				targetUserId: ids.rndMember,
				commitment: 5,
				teamwork: 4,
				attitude: 5,
				contribution: 4,
			});
			await rndKadepCaller.penilaian.submitDepartmentScore({
				evaluationPeriodId: period.id,
				quarterNumber: 1,
				targetUserId: ids.rndSekdep,
				commitment: 5,
				teamwork: 5,
				attitude: 5,
				contribution: 5,
			});
			await intiCaller.penilaian.submitDepartmentScore({
				evaluationPeriodId: period.id,
				quarterNumber: 1,
				targetUserId: ids.hcoKadep,
				commitment: 5,
				teamwork: 5,
				attitude: 5,
				contribution: 5,
			});
			await intiCaller.penilaian.submitDepartmentScore({
				evaluationPeriodId: period.id,
				quarterNumber: 1,
				targetUserId: ids.rndKadep,
				commitment: 4,
				teamwork: 4,
				attitude: 5,
				contribution: 5,
			});
			await intiCaller.penilaian.submitDepartmentScore({
				evaluationPeriodId: period.id,
				quarterNumber: 1,
				targetUserId: ids.intiWaketum,
				commitment: 5,
				teamwork: 5,
				attitude: 5,
				contribution: 5,
			});

			// Finalize rejects while Ketum INTI dept score and GForm rows are still missing.
			await expect(
				hcoCaller.penilaian.finalizePeriod({
					evaluationPeriodId: period.id,
					reason: "Incomplete check",
				}),
			).rejects.toThrow("EVALUATION_INCOMPLETE_CANNOT_FINALIZE");

			await inti2Caller.penilaian.submitDepartmentScore({
				evaluationPeriodId: period.id,
				quarterNumber: 1,
				targetUserId: ids.intiKetum,
				commitment: 5,
				teamwork: 5,
				attitude: 5,
				contribution: 5,
			});

			// Propose & approve bonus point transaction.
			const txRow = await rndKadepCaller.penilaian.proposePointTransaction({
				evaluationPeriodId: period.id,
				targetUserId: ids.rndMember,
				transactionType: "ADDITION",
				points: 5,
				category: "Inisiatif",
				reason: "Bantu piket tambahan",
				occurredOn: "2026-10-01",
			});
			await hcoCaller.penilaian.decidePointTransaction({
				evaluationPeriodId: period.id,
				transactionId: txRow.id,
				decision: "APPROVED",
			});

			// GForm import (SR_MABA) for all 6 SRs + check FR-EVAL-036 SUPERADMIN visibility.
			const allNims = [
				"9901000001",
				"9901000002",
				"9901000006",
				"9901000003",
				"9901000004",
				"9901000005",
			];
			const gfImport = await hcoCaller.penilaian.confirmGformImport({
				evaluationPeriodId: period.id,
				sourceType: "SR_MABA",
				cycleNumber: 1,
				sourceReference: "gform-int.csv",
				skipDuplicates: false,
				rows: allNims.map((nim, i) => ({
					rowNumber: i + 2,
					respondentKey: `maba-int-${i + 1}`,
					respondentRole: "MABA" as const,
					targetNim: nim,
					buildingCode: "A",
					answers: Array(20).fill(5),
					comment: "Sangat ramah dan responsif",
				})),
			});
			expect(gfImport.insertedCount).toBe(6);

			const superadminImports =
				await superadminCaller.penilaian.listGformImports({
					evaluationPeriodId: period.id,
				});
			expect(superadminImports[0]?.comment).toBe("Sangat ramah dan responsif");
			expect(superadminImports[0]?.respondentKey).toMatch(/^maba-int-/);

			// Finalize succeeds once all mandatory components complete -> creates frozen snapshots.
			const finalized = await hcoCaller.penilaian.finalizePeriod({
				evaluationPeriodId: period.id,
				reason: "Semua komponen wajib lengkap",
			});
			expect(finalized?.status).toBe("FINAL");

			// Post-FINAL ownRecap reveals frozen result without threshold label (threshold null).
			const finalOwn = await rndMemberCaller.penilaian.ownRecap({
				evaluationPeriodId: period.id,
			});
			expect(finalOwn.status).toBe("FINAL");
			if (finalOwn.status !== "FINAL" || !finalOwn.recap) {
				throw new Error("Expected FINAL ownRecap");
			}
			expect(finalOwn.recap.attendancePointsTotal).toBe(10);
			expect(finalOwn.recap.netAdjustmentPoints).toBe(5);
			expect(finalOwn.recap.thresholdStatus).toBeNull();
			expect(finalOwn.recap.totalWeightedScore).toBeGreaterThan(50);

			// Score edit while FINAL fails -> openRevision opens v2 -> correctScore succeeds -> re-finalize.
			await expect(
				hcoCaller.penilaian.correctScore({
					evaluationPeriodId: period.id,
					scoreType: "EVENT_SCORE",
					scoreId: memberEventScoreId,
					commitment: 4,
					teamwork: 4,
					attitude: 4,
					contribution: 4,
					reason: "Blocked while FINAL",
				}),
			).rejects.toThrow();

			const reopened = await hcoCaller.penilaian.openRevision({
				evaluationPeriodId: period.id,
				reason: "Koreksi temuan acara",
			});
			expect(reopened?.version).toBe(2);
			expect(reopened?.status).toBe("REVISING");

			await hcoCaller.penilaian.correctScore({
				evaluationPeriodId: period.id,
				scoreType: "EVENT_SCORE",
				scoreId: memberEventScoreId,
				commitment: 4,
				teamwork: 4,
				attitude: 4,
				contribution: 4,
				reason: "Penyesuaian indikator event",
			});

			const refinalized = await hcoCaller.penilaian.finalizePeriod({
				evaluationPeriodId: period.id,
				reason: "Finalisasi versi 2",
			});
			expect(refinalized?.status).toBe("FINAL");
			expect(refinalized?.version).toBe(2);

			// CSV export & dashboardSummary post-final check.
			const csv = await hcoCaller.penilaian.exportRecapCsv({
				evaluationPeriodId: period.id,
				aggregateOnly: false,
			});
			expect(csv.content).toContain("Anggota RND Sintetis");
			const dash = await rndMemberCaller.penilaian.dashboardSummary({
				mode: "personal",
			});
			expect(dash.state).toBe("ready");

			// Verify append-only trigger blocks DELETE and UPDATE on evaluation_audits in real PostgreSQL.
			await expect(
				Promise.resolve(
					db.execute(
						sql`DELETE FROM evaluation_audits WHERE evaluation_period_id = ${period.id}`,
					),
				),
			).rejects.toThrow();
			await expect(
				Promise.resolve(
					db.execute(
						sql`UPDATE evaluation_audits SET reason = 'tampered' WHERE evaluation_period_id = ${period.id}`,
					),
				),
			).rejects.toThrow();
		});
	},
);
