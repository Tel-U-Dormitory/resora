import type { ActiveIdentity } from "@resora/auth/sr-access";
import type { Database, DatabaseTransaction } from "@resora/db";
import {
	evaluationAttendanceFallbacks,
	evaluationAudits,
	evaluationDepartmentScores,
	evaluationEventScores,
	evaluationGformResponses,
	evaluationPeriodEvents,
	evaluationPeriods,
	evaluationPointTransactions,
	evaluationResultSnapshots,
} from "@resora/db/schema/penilaian";
import { TRPCError } from "@trpc/server";
import { and, asc, eq } from "drizzle-orm";
import type { z } from "zod";
import { readPeriodAttendancePoints } from "../attendance/attendance.public";
import { invitationSnapshots, readEvent } from "../events/events.public";
import {
	getLiveOperationalIdentity,
	readOperationalIdentity,
	readSrPeriodEvaluationRoster,
} from "../identity/identity.public";
import {
	correctEvaluationScoreSchema,
	evaluationPeriodIdSchema,
	finalizeEvaluationPeriodSchema,
	openEvaluationRevisionSchema,
} from "./penilaian.contracts";
import { calculatePeriodEvaluations } from "./penilaian-calculator";
import {
	canManagePeriodGovernance,
	canViewPreFinalResults,
} from "./penilaian-policy";

function fail(
	code:
		| "FORBIDDEN"
		| "NOT_FOUND"
		| "BAD_REQUEST"
		| "CONFLICT"
		| "PRECONDITION_FAILED",
	message: string,
): never {
	throw new TRPCError({ code, message });
}

export async function loadLivePeriodComputation(
	tx: Database | DatabaseTransaction,
	period: {
		id: string;
		srPeriodId: string;
		status: "OPEN" | "FINAL" | "REVISING";
		performanceThreshold: number | null;
	},
) {
	const [
		roster,
		periodEventRows,
		eventScores,
		departmentScores,
		gformResponses,
		attendancePrimary,
		attendanceFallbacks,
		pointTransactions,
	] = await Promise.all([
		readSrPeriodEvaluationRoster(tx, period.srPeriodId),
		tx
			.select()
			.from(evaluationPeriodEvents)
			.where(eq(evaluationPeriodEvents.evaluationPeriodId, period.id))
			.orderBy(asc(evaluationPeriodEvents.createdAt)),
		tx
			.select()
			.from(evaluationEventScores)
			.where(eq(evaluationEventScores.evaluationPeriodId, period.id)),
		tx
			.select()
			.from(evaluationDepartmentScores)
			.where(eq(evaluationDepartmentScores.evaluationPeriodId, period.id)),
		tx
			.select({
				sourceType: evaluationGformResponses.sourceType,
				cycleNumber: evaluationGformResponses.cycleNumber,
				targetUserId: evaluationGformResponses.targetUserId,
				totalScore: evaluationGformResponses.totalScore,
			})
			.from(evaluationGformResponses)
			.where(eq(evaluationGformResponses.evaluationPeriodId, period.id)),
		readPeriodAttendancePoints(tx, period.srPeriodId),
		tx
			.select({
				targetUserId: evaluationAttendanceFallbacks.targetUserId,
				earnedPoints: evaluationAttendanceFallbacks.earnedPoints,
			})
			.from(evaluationAttendanceFallbacks)
			.where(eq(evaluationAttendanceFallbacks.evaluationPeriodId, period.id)),
		tx
			.select({
				targetUserId: evaluationPointTransactions.targetUserId,
				transactionType: evaluationPointTransactions.transactionType,
				points: evaluationPointTransactions.points,
				status: evaluationPointTransactions.status,
			})
			.from(evaluationPointTransactions)
			.where(
				and(
					eq(evaluationPointTransactions.evaluationPeriodId, period.id),
					eq(evaluationPointTransactions.status, "APPROVED"),
				),
			),
	]);

	const periodEvents = [];
	for (const pe of periodEventRows) {
		const [[event], participants] = await Promise.all([
			readEvent(tx, pe.eventId),
			invitationSnapshots(tx, pe.eventId),
		]);
		periodEvents.push({
			periodEventId: pe.id,
			eventId: pe.eventId,
			title: event?.title ?? pe.eventId,
			category: pe.category,
			isMandatory: pe.isMandatory,
			rosterUserIds: participants.map((p) => p.userId),
		});
	}

	const attendanceByUserId = new Map<
		string,
		{ resoraPoints: number; fallbackPoints: number }
	>();
	for (const row of attendancePrimary.participants) {
		attendanceByUserId.set(row.userId, {
			resoraPoints: row.totalPoints,
			fallbackPoints: 0,
		});
	}
	for (const fb of attendanceFallbacks) {
		const entry = attendanceByUserId.get(fb.targetUserId) ?? {
			resoraPoints: 0,
			fallbackPoints: 0,
		};
		entry.fallbackPoints += fb.earnedPoints;
		attendanceByUserId.set(fb.targetUserId, entry);
	}

	const adjustmentsByUserId = new Map<
		string,
		{ additions: number; deductions: number }
	>();
	for (const item of pointTransactions) {
		const entry = adjustmentsByUserId.get(item.targetUserId) ?? {
			additions: 0,
			deductions: 0,
		};
		if (item.transactionType === "ADDITION") entry.additions += item.points;
		else entry.deductions += item.points;
		adjustmentsByUserId.set(item.targetUserId, entry);
	}

	return calculatePeriodEvaluations({
		periodStatus: period.status,
		performanceThreshold: period.performanceThreshold,
		roster: roster.map((r) => ({
			userId: r.userId,
			nim: r.nim ?? "",
			name: r.name,
			departmentCode: r.currentDepartmentCode,
			positionCode: r.currentPositionCode,
			buildingCode: r.currentBuildingCode ?? "",
			buildingName: r.currentBuildingName ?? "",
		})),
		periodEvents,
		eventScores,
		departmentScores,
		gformResponses,
		attendanceByUserId,
		adjustmentsByUserId,
	});
}

export async function getPeriodCompletenessStatus(
	db: Database,
	identity: ActiveIdentity,
	input: z.input<typeof evaluationPeriodIdSchema>,
) {
	if (!canViewPreFinalResults(identity))
		fail("FORBIDDEN", "EVALUATION_PREFINAL_ACCESS_DENIED");
	const { evaluationPeriodId } = evaluationPeriodIdSchema.parse(input);

	return db.transaction(
		async (tx) => {
			const live = await readOperationalIdentity(tx, identity.userId);
			if (!canViewPreFinalResults(live))
				fail("FORBIDDEN", "EVALUATION_PREFINAL_ACCESS_DENIED");

			const [period] = await tx
				.select()
				.from(evaluationPeriods)
				.where(eq(evaluationPeriods.id, evaluationPeriodId));
			if (!period) fail("NOT_FOUND", "EVALUATION_PERIOD_NOT_FOUND");

			const computed = await loadLivePeriodComputation(tx, period);
			return {
				evaluationPeriodId: period.id,
				name: period.name,
				status: period.status,
				version: period.version,
				readinessStatus: computed.readinessStatus,
				assessedCount: computed.assessedCount,
				unassessedCount: computed.unassessedCount,
				totalRosterCount: computed.totalRosterCount,
				incompleteMembers: computed.members
					.filter((m) => !m.isComplete)
					.map((m) => ({
						userId: m.target.userId,
						nim: m.target.nim,
						name: m.target.name,
						departmentCode: m.target.departmentCode,
						missingComponents: m.missingComponents,
					})),
			};
		},
		{ isolationLevel: "repeatable read", accessMode: "read only" },
	);
}

export async function finalizeEvaluationPeriod(
	db: Database,
	identity: ActiveIdentity,
	input: z.input<typeof finalizeEvaluationPeriodSchema>,
) {
	if (!canManagePeriodGovernance(identity))
		fail("FORBIDDEN", "HCO_KADEP_OR_SUPERADMIN_REQUIRED");
	const data = finalizeEvaluationPeriodSchema.parse(input);

	return db.transaction(async (tx) => {
		const live = await getLiveOperationalIdentity(tx, identity.userId);
		if (!canManagePeriodGovernance(live))
			fail("FORBIDDEN", "HCO_KADEP_OR_SUPERADMIN_REQUIRED");

		const [period] = await tx
			.select()
			.from(evaluationPeriods)
			.where(eq(evaluationPeriods.id, data.evaluationPeriodId))
			.for("update");
		if (!period) fail("NOT_FOUND", "EVALUATION_PERIOD_NOT_FOUND");
		if (period.status === "FINAL")
			fail("CONFLICT", "EVALUATION_PERIOD_ALREADY_FINAL");

		const computed = await loadLivePeriodComputation(tx, period);
		if (computed.readinessStatus !== "SIAP_DIFINALISASI")
			fail("PRECONDITION_FAILED", "EVALUATION_INCOMPLETE_CANNOT_FINALIZE");

		const finalizedAt = new Date();
		await tx.insert(evaluationResultSnapshots).values(
			computed.members.map((member) => ({
				evaluationPeriodId: period.id,
				version: period.version,
				targetUserId: member.target.userId,
				snapshotNim: member.target.nim,
				snapshotName: member.target.name,
				snapshotDepartmentCode: member.target.departmentCode,
				snapshotPositionCode: member.target.positionCode,
				snapshotBuildingCode: member.target.buildingCode,
				snapshotBuildingName: member.target.buildingName,
				annualWeighted: member.annualWeighted ?? 0,
				monthlyWeighted: member.monthlyWeighted ?? 0,
				weeklyWeighted: member.weeklyWeighted ?? 0,
				departmentWeighted: member.departmentWeighted ?? 0,
				gformWeighted: member.gformWeighted ?? 0,
				totalWeightedScore: member.totalWeightedScore ?? 0,
				attendancePointsTotal: member.attendancePointsTotal,
				netAdjustmentPoints: member.netAdjustmentPoints,
				externalScoreAverage: member.externalScoreAverage,
				componentBreakdown: {
					eventBreakdowns: member.eventBreakdowns,
					departmentScoreAverage: member.departmentScoreAverage,
					gformScoreAverage: member.gformScoreAverage,
					resoraAttendancePoints: member.resoraAttendancePoints,
					fallbackAttendancePoints: member.fallbackAttendancePoints,
					approvedAdditionPoints: member.approvedAdditionPoints,
					approvedDeductionPoints: member.approvedDeductionPoints,
					externalResponseCount: member.externalResponseCount,
					thresholdStatus: member.thresholdStatus,
				},
				finalizedByUserId: identity.userId,
				finalizedAt,
			})),
		);

		const [updated] = await tx
			.update(evaluationPeriods)
			.set({
				status: "FINAL",
				finalizedAt,
				finalizedByUserId: identity.userId,
			})
			.where(eq(evaluationPeriods.id, period.id))
			.returning();

		await tx.insert(evaluationAudits).values({
			evaluationPeriodId: period.id,
			entityType: "FINALIZATION",
			entityId: period.id,
			actorUserId: identity.userId,
			action: "PERIOD_FINALIZED",
			reason: data.reason,
			beforeState: { status: period.status, version: period.version },
			afterState: {
				status: "FINAL",
				version: period.version,
				finalizedCount: computed.members.length,
			},
		});

		return updated;
	});
}

export async function openEvaluationRevision(
	db: Database,
	identity: ActiveIdentity,
	input: z.input<typeof openEvaluationRevisionSchema>,
) {
	if (!canManagePeriodGovernance(identity))
		fail("FORBIDDEN", "HCO_KADEP_OR_SUPERADMIN_REQUIRED");
	const data = openEvaluationRevisionSchema.parse(input);

	return db.transaction(async (tx) => {
		const live = await getLiveOperationalIdentity(tx, identity.userId);
		if (!canManagePeriodGovernance(live))
			fail("FORBIDDEN", "HCO_KADEP_OR_SUPERADMIN_REQUIRED");

		const [period] = await tx
			.select()
			.from(evaluationPeriods)
			.where(eq(evaluationPeriods.id, data.evaluationPeriodId))
			.for("update");
		if (!period) fail("NOT_FOUND", "EVALUATION_PERIOD_NOT_FOUND");
		if (period.status !== "FINAL")
			fail("CONFLICT", "EVALUATION_PERIOD_NOT_FINAL");

		const nextVersion = period.version + 1;
		const [updated] = await tx
			.update(evaluationPeriods)
			.set({
				status: "REVISING",
				version: nextVersion,
				finalizedAt: null,
				finalizedByUserId: null,
			})
			.where(eq(evaluationPeriods.id, period.id))
			.returning();

		await tx.insert(evaluationAudits).values({
			evaluationPeriodId: period.id,
			entityType: "FINALIZATION",
			entityId: period.id,
			actorUserId: identity.userId,
			action: "REVISION_OPENED",
			reason: data.reason,
			beforeState: { status: "FINAL", version: period.version },
			afterState: { status: "REVISING", version: nextVersion },
		});

		return updated;
	});
}

export async function correctEvaluationScore(
	db: Database,
	identity: ActiveIdentity,
	input: z.input<typeof correctEvaluationScoreSchema>,
) {
	if (!canManagePeriodGovernance(identity))
		fail("FORBIDDEN", "HCO_KADEP_OR_SUPERADMIN_REQUIRED");
	const data = correctEvaluationScoreSchema.parse(input);

	return db.transaction(async (tx) => {
		const live = await getLiveOperationalIdentity(tx, identity.userId);
		if (!canManagePeriodGovernance(live))
			fail("FORBIDDEN", "HCO_KADEP_OR_SUPERADMIN_REQUIRED");

		const [period] = await tx
			.select({
				id: evaluationPeriods.id,
				status: evaluationPeriods.status,
				version: evaluationPeriods.version,
			})
			.from(evaluationPeriods)
			.where(eq(evaluationPeriods.id, data.evaluationPeriodId))
			.for("update");
		if (!period) fail("NOT_FOUND", "EVALUATION_PERIOD_NOT_FOUND");
		if (period.status === "FINAL")
			fail("CONFLICT", "EVALUATION_FINALIZED_OPEN_REVISION_REQUIRED");

		const table =
			data.scoreType === "EVENT_SCORE"
				? evaluationEventScores
				: evaluationDepartmentScores;

		const [existing] = await tx
			.select({
				id: table.id,
				targetUserId: table.targetUserId,
				commitment: table.commitment,
				teamwork: table.teamwork,
				attitude: table.attitude,
				contribution: table.contribution,
			})
			.from(table)
			.where(
				and(
					eq(table.id, data.scoreId),
					eq(table.evaluationPeriodId, data.evaluationPeriodId),
				),
			)
			.for("update");
		if (!existing) fail("NOT_FOUND", "EVALUATION_SCORE_NOT_FOUND");

		const [updated] = await tx
			.update(table)
			.set({
				commitment: data.commitment,
				teamwork: data.teamwork,
				attitude: data.attitude,
				contribution: data.contribution,
			})
			.where(eq(table.id, existing.id))
			.returning({
				id: table.id,
				targetUserId: table.targetUserId,
				commitment: table.commitment,
				teamwork: table.teamwork,
				attitude: table.attitude,
				contribution: table.contribution,
			});

		await tx.insert(evaluationAudits).values({
			evaluationPeriodId: data.evaluationPeriodId,
			targetUserId: existing.targetUserId,
			entityType: data.scoreType,
			entityId: existing.id,
			actorUserId: identity.userId,
			action: "SCORE_CORRECTED",
			reason: data.reason,
			beforeState: {
				commitment: existing.commitment,
				teamwork: existing.teamwork,
				attitude: existing.attitude,
				contribution: existing.contribution,
			},
			afterState: {
				commitment: data.commitment,
				teamwork: data.teamwork,
				attitude: data.attitude,
				contribution: data.contribution,
			},
		});

		return updated;
	});
}
