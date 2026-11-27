import type { ActiveIdentity } from "@resora/auth/sr-access";
import type { Database } from "@resora/db";
import {
	evaluationAttendanceFallbacks,
	evaluationAudits,
	evaluationPeriods,
	evaluationPointTransactions,
} from "@resora/db/schema/penilaian";
import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import type { z } from "zod";
import { readPeriodAttendancePoints } from "../attendance/attendance.public";
import {
	getLiveOperationalIdentity,
	getUserDisplayNames,
	readOperationalIdentity,
	readSrPeriodEvaluationRoster,
} from "../identity/identity.public";
import {
	calculateFallbackAttendancePoints,
	decidePointTransactionSchema,
	evaluationPeriodIdSchema,
	listAttendancePointsSchema,
	listPointTransactionsSchema,
	proposePointTransactionSchema,
	recordAttendanceFallbackSchema,
} from "./penilaian.contracts";
import {
	canApprovePointTransaction,
	canManageRoutineEvaluation,
	canProposePointTransaction,
	canReadPenilaianModule,
	canViewFinalAllMembers,
	canViewPreFinalResults,
	isStructuralKadep,
} from "./penilaian-policy";

function fail(
	code: "FORBIDDEN" | "NOT_FOUND" | "BAD_REQUEST" | "CONFLICT",
	message: string,
): never {
	throw new TRPCError({ code, message });
}

export async function listPointProposalTargets(
	db: Database,
	identity: ActiveIdentity,
	input: z.input<typeof evaluationPeriodIdSchema>,
) {
	if (!canProposePointTransaction(identity))
		fail("FORBIDDEN", "POINT_PROPOSAL_KADEP_REQUIRED");
	const { evaluationPeriodId } = evaluationPeriodIdSchema.parse(input);

	return db.transaction(
		async (tx) => {
			const live = await readOperationalIdentity(tx, identity.userId);
			if (!live || !canProposePointTransaction(live))
				fail("FORBIDDEN", "POINT_PROPOSAL_KADEP_REQUIRED");

			const [period] = await tx
				.select({
					id: evaluationPeriods.id,
					srPeriodId: evaluationPeriods.srPeriodId,
				})
				.from(evaluationPeriods)
				.where(eq(evaluationPeriods.id, evaluationPeriodId));
			if (!period) fail("NOT_FOUND", "EVALUATION_PERIOD_NOT_FOUND");

			const roster = await readSrPeriodEvaluationRoster(tx, period.srPeriodId);
			return roster.map((member) => ({
				userId: member.userId,
				nim: member.nim,
				name: member.name,
				departmentCode: member.currentDepartmentCode,
				positionCode: member.currentPositionCode,
			}));
		},
		{ isolationLevel: "repeatable read", accessMode: "read only" },
	);
}

export async function recordAttendanceFallback(
	db: Database,
	identity: ActiveIdentity,
	input: z.input<typeof recordAttendanceFallbackSchema>,
) {
	if (!canManageRoutineEvaluation(identity)) fail("FORBIDDEN", "HCO_REQUIRED");
	const data = recordAttendanceFallbackSchema.parse(input);

	return db.transaction(async (tx) => {
		const live = await getLiveOperationalIdentity(tx, identity.userId);
		if (!live || !canManageRoutineEvaluation(live))
			fail("FORBIDDEN", "HCO_REQUIRED");

		const [period] = await tx
			.select({
				id: evaluationPeriods.id,
				srPeriodId: evaluationPeriods.srPeriodId,
				status: evaluationPeriods.status,
				sidakMaxPoints: evaluationPeriods.sidakMaxPoints,
			})
			.from(evaluationPeriods)
			.where(eq(evaluationPeriods.id, data.evaluationPeriodId))
			.for("share");
		if (!period) fail("NOT_FOUND", "EVALUATION_PERIOD_NOT_FOUND");
		if (period.status === "FINAL")
			fail("CONFLICT", "EVALUATION_PERIOD_FINALIZED");

		const roster = await readSrPeriodEvaluationRoster(tx, period.srPeriodId);
		if (!roster.some((member) => member.userId === data.targetUserId))
			fail("NOT_FOUND", "TARGET_SR_NOT_IN_PERIOD_ROSTER");

		const [duplicate] = await tx
			.select({ id: evaluationAttendanceFallbacks.id })
			.from(evaluationAttendanceFallbacks)
			.where(
				and(
					eq(
						evaluationAttendanceFallbacks.evaluationPeriodId,
						data.evaluationPeriodId,
					),
					eq(evaluationAttendanceFallbacks.targetUserId, data.targetUserId),
					eq(evaluationAttendanceFallbacks.activityType, data.activityType),
					eq(evaluationAttendanceFallbacks.activityDate, data.activityDate),
					eq(evaluationAttendanceFallbacks.activityTitle, data.activityTitle),
				),
			);
		if (duplicate) fail("CONFLICT", "ATTENDANCE_FALLBACK_DUPLICATE");

		const { maxPoints, earnedPoints } = calculateFallbackAttendancePoints(
			data.activityType,
			data.attendanceStatus,
			period.sidakMaxPoints,
		);

		const [inserted] = await tx
			.insert(evaluationAttendanceFallbacks)
			.values({
				evaluationPeriodId: data.evaluationPeriodId,
				targetUserId: data.targetUserId,
				activityType: data.activityType,
				activityTitle: data.activityTitle,
				activityDate: data.activityDate,
				attendanceStatus: data.attendanceStatus,
				maxPoints,
				earnedPoints,
				sourceKind: data.sourceKind,
				sourceReference: data.sourceReference ?? null,
				notes: data.notes,
				recordedByUserId: live.userId,
			})
			.returning();

		if (!inserted)
			throw new TRPCError({
				code: "INTERNAL_SERVER_ERROR",
				message: "ATTENDANCE_FALLBACK_SAVE_FAILED",
			});

		await tx.insert(evaluationAudits).values({
			evaluationPeriodId: data.evaluationPeriodId,
			targetUserId: data.targetUserId,
			entityType: "ATTENDANCE_FALLBACK",
			entityId: inserted.id,
			actorUserId: live.userId,
			action: "ATTENDANCE_FALLBACK_RECORDED",
			reason: data.notes,
			beforeState: null,
			afterState: {
				activityType: data.activityType,
				activityTitle: data.activityTitle,
				activityDate: data.activityDate,
				attendanceStatus: data.attendanceStatus,
				maxPoints,
				earnedPoints,
			},
		});

		return inserted;
	});
}

export async function listAttendancePointsSummary(
	db: Database,
	identity: ActiveIdentity,
	input: z.input<typeof listAttendancePointsSchema>,
) {
	if (!canReadPenilaianModule(identity))
		fail("FORBIDDEN", "EVALUATION_ACCESS_DENIED");
	const data = listAttendancePointsSchema.parse(input);

	return db.transaction(
		async (tx) => {
			const live = await readOperationalIdentity(tx, identity.userId);
			if (!live || !canReadPenilaianModule(live))
				fail("FORBIDDEN", "EVALUATION_ACCESS_DENIED");

			const [period] = await tx
				.select({
					id: evaluationPeriods.id,
					srPeriodId: evaluationPeriods.srPeriodId,
					status: evaluationPeriods.status,
				})
				.from(evaluationPeriods)
				.where(eq(evaluationPeriods.id, data.evaluationPeriodId));
			if (!period) fail("NOT_FOUND", "EVALUATION_PERIOD_NOT_FOUND");

			const canSeePreFinal = canViewPreFinalResults(live);
			if (!canSeePreFinal && period.status !== "FINAL")
				fail("FORBIDDEN", "EVALUATION_PREFINAL_ACCESS_DENIED");

			const canSeeAll = canViewFinalAllMembers(live);
			if (!canSeeAll && data.targetUserId && data.targetUserId !== live.userId)
				fail("FORBIDDEN", "EVALUATION_TARGET_ACCESS_DENIED");

			const [primaryRecap, fallbacks] = await Promise.all([
				readPeriodAttendancePoints(tx, period.srPeriodId),
				tx
					.select()
					.from(evaluationAttendanceFallbacks)
					.where(
						eq(
							evaluationAttendanceFallbacks.evaluationPeriodId,
							data.evaluationPeriodId,
						),
					)
					.orderBy(desc(evaluationAttendanceFallbacks.activityDate)),
			]);

			const fallbackByUser = new Map<
				string,
				{ total: number; entries: typeof fallbacks }
			>();
			for (const entry of fallbacks) {
				const bucket = fallbackByUser.get(entry.targetUserId) ?? {
					total: 0,
					entries: [],
				};
				bucket.total =
					Math.round((bucket.total + entry.earnedPoints) * 100) / 100;
				bucket.entries.push(entry);
				fallbackByUser.set(entry.targetUserId, bucket);
			}

			const filterUserId = canSeeAll ? data.targetUserId : live.userId;
			return primaryRecap.participants
				.filter((row) => !filterUserId || row.userId === filterUserId)
				.map((row) => {
					const fallback = fallbackByUser.get(row.userId) ?? {
						total: 0,
						entries: [],
					};
					return {
						userId: row.userId,
						nim: row.nim,
						name: row.name,
						resoraPoints: row.totalPoints,
						fallbackPoints: fallback.total,
						totalAttendancePoints:
							Math.round((row.totalPoints + fallback.total) * 100) / 100,
						attendedCount: row.attendedCount,
						absentCount: row.absentCount,
						eventCount: row.eventCount,
						fallbackEntries: fallback.entries,
					};
				});
		},
		{ isolationLevel: "repeatable read", accessMode: "read only" },
	);
}

export async function proposePointTransaction(
	db: Database,
	identity: ActiveIdentity,
	input: z.input<typeof proposePointTransactionSchema>,
) {
	if (!canProposePointTransaction(identity))
		fail("FORBIDDEN", "POINT_PROPOSAL_KADEP_REQUIRED");
	const data = proposePointTransactionSchema.parse(input);

	return db.transaction(async (tx) => {
		const live = await getLiveOperationalIdentity(tx, identity.userId);
		if (!live || !canProposePointTransaction(live))
			fail("FORBIDDEN", "POINT_PROPOSAL_KADEP_REQUIRED");

		const [period] = await tx
			.select({
				id: evaluationPeriods.id,
				srPeriodId: evaluationPeriods.srPeriodId,
				status: evaluationPeriods.status,
			})
			.from(evaluationPeriods)
			.where(eq(evaluationPeriods.id, data.evaluationPeriodId))
			.for("share");
		if (!period) fail("NOT_FOUND", "EVALUATION_PERIOD_NOT_FOUND");
		if (period.status === "FINAL")
			fail("CONFLICT", "EVALUATION_PERIOD_FINALIZED");

		const roster = await readSrPeriodEvaluationRoster(tx, period.srPeriodId);
		if (!roster.some((member) => member.userId === data.targetUserId))
			fail("NOT_FOUND", "TARGET_SR_NOT_IN_PERIOD_ROSTER");

		const [created] = await tx
			.insert(evaluationPointTransactions)
			.values({
				evaluationPeriodId: data.evaluationPeriodId,
				targetUserId: data.targetUserId,
				transactionType: data.transactionType,
				points: data.points,
				category: data.category,
				reason: data.reason,
				occurredOn: data.occurredOn,
				status: "PENDING",
				proposedByUserId: live.userId,
			})
			.returning();

		if (!created)
			throw new TRPCError({
				code: "INTERNAL_SERVER_ERROR",
				message: "POINT_TRANSACTION_CREATE_FAILED",
			});

		await tx.insert(evaluationAudits).values({
			evaluationPeriodId: data.evaluationPeriodId,
			targetUserId: data.targetUserId,
			entityType: "POINT_TRANSACTION",
			entityId: created.id,
			actorUserId: live.userId,
			action: "POINT_TRANSACTION_PROPOSED",
			reason: data.reason,
			beforeState: null,
			afterState: {
				transactionType: data.transactionType,
				points: data.points,
				category: data.category,
				occurredOn: data.occurredOn,
				status: "PENDING",
			},
		});

		return created;
	});
}

export async function decidePointTransaction(
	db: Database,
	identity: ActiveIdentity,
	input: z.input<typeof decidePointTransactionSchema>,
) {
	if (!canApprovePointTransaction(identity))
		fail("FORBIDDEN", "POINT_APPROVAL_HCO_OR_INTI_REQUIRED");
	const data = decidePointTransactionSchema.parse(input);

	return db.transaction(async (tx) => {
		const live = await getLiveOperationalIdentity(tx, identity.userId);
		if (!live || !canApprovePointTransaction(live))
			fail("FORBIDDEN", "POINT_APPROVAL_HCO_OR_INTI_REQUIRED");

		const [period] = await tx
			.select({
				id: evaluationPeriods.id,
				status: evaluationPeriods.status,
			})
			.from(evaluationPeriods)
			.where(eq(evaluationPeriods.id, data.evaluationPeriodId))
			.for("share");
		if (!period) fail("NOT_FOUND", "EVALUATION_PERIOD_NOT_FOUND");
		if (period.status === "FINAL")
			fail("CONFLICT", "EVALUATION_PERIOD_FINALIZED");

		const [existing] = await tx
			.select()
			.from(evaluationPointTransactions)
			.where(
				and(
					eq(evaluationPointTransactions.id, data.transactionId),
					eq(
						evaluationPointTransactions.evaluationPeriodId,
						data.evaluationPeriodId,
					),
				),
			)
			.for("update");
		if (!existing) fail("NOT_FOUND", "POINT_TRANSACTION_NOT_FOUND");
		if (existing.status !== "PENDING")
			fail("CONFLICT", "POINT_TRANSACTION_ALREADY_DECIDED");

		const decidedAt = new Date();
		const [updated] = await tx
			.update(evaluationPointTransactions)
			.set({
				status: data.decision,
				decidedByUserId: live.userId,
				decisionNote: data.decisionNote ?? null,
				decidedAt,
			})
			.where(eq(evaluationPointTransactions.id, existing.id))
			.returning();

		await tx.insert(evaluationAudits).values({
			evaluationPeriodId: data.evaluationPeriodId,
			targetUserId: existing.targetUserId,
			entityType: "POINT_TRANSACTION",
			entityId: existing.id,
			actorUserId: live.userId,
			action:
				data.decision === "APPROVED"
					? "POINT_TRANSACTION_APPROVED"
					: "POINT_TRANSACTION_REJECTED",
			reason:
				data.decisionNote?.trim() ||
				`Keputusan transaksi poin: ${data.decision}`,
			beforeState: { status: "PENDING" },
			afterState: {
				status: data.decision,
				decisionNote: data.decisionNote ?? null,
			},
		});

		return updated;
	});
}

export async function listPointTransactions(
	db: Database,
	identity: ActiveIdentity,
	input: z.input<typeof listPointTransactionsSchema>,
) {
	if (!canReadPenilaianModule(identity))
		fail("FORBIDDEN", "EVALUATION_ACCESS_DENIED");
	const data = listPointTransactionsSchema.parse(input);

	return db.transaction(
		async (tx) => {
			const live = await readOperationalIdentity(tx, identity.userId);
			if (!live || !canReadPenilaianModule(live))
				fail("FORBIDDEN", "EVALUATION_ACCESS_DENIED");

			const [period] = await tx
				.select({
					id: evaluationPeriods.id,
					status: evaluationPeriods.status,
				})
				.from(evaluationPeriods)
				.where(eq(evaluationPeriods.id, data.evaluationPeriodId));
			if (!period) fail("NOT_FOUND", "EVALUATION_PERIOD_NOT_FOUND");

			const canSeePreFinal = canViewPreFinalResults(live);
			const isKadep = isStructuralKadep(live);
			if (!canSeePreFinal && !isKadep && period.status !== "FINAL")
				fail("FORBIDDEN", "EVALUATION_PREFINAL_ACCESS_DENIED");

			const rows = await tx
				.select()
				.from(evaluationPointTransactions)
				.where(
					and(
						eq(
							evaluationPointTransactions.evaluationPeriodId,
							data.evaluationPeriodId,
						),
						data.targetUserId
							? eq(evaluationPointTransactions.targetUserId, data.targetUserId)
							: undefined,
						data.status
							? eq(evaluationPointTransactions.status, data.status)
							: undefined,
					),
				)
				.orderBy(desc(evaluationPointTransactions.createdAt));

			const visible = rows.filter((row) => {
				if (canSeePreFinal) return true;
				if (isKadep) {
					if (row.proposedByUserId === live.userId) return true;
					return period.status === "FINAL" && row.status === "APPROVED";
				}
				return (
					period.status === "FINAL" &&
					row.targetUserId === live.userId &&
					row.status === "APPROVED"
				);
			});

			const userIds = visible.flatMap((row) => [
				row.targetUserId,
				row.proposedByUserId,
				...(row.decidedByUserId ? [row.decidedByUserId] : []),
			]);
			const names = await getUserDisplayNames(tx, userIds);

			const netByUser = new Map<
				string,
				{ additions: number; deductions: number; net: number }
			>();
			for (const row of visible) {
				if (row.status !== "APPROVED") continue;
				const current = netByUser.get(row.targetUserId) ?? {
					additions: 0,
					deductions: 0,
					net: 0,
				};
				if (row.transactionType === "ADDITION") current.additions += row.points;
				else current.deductions += row.points;
				current.net =
					Math.round((current.additions - current.deductions) * 100) / 100;
				netByUser.set(row.targetUserId, current);
			}

			return {
				transactions: visible.map((row) => ({
					...row,
					targetName: names.get(row.targetUserId) ?? null,
					proposedByName: names.get(row.proposedByUserId) ?? null,
					decidedByName: row.decidedByUserId
						? (names.get(row.decidedByUserId) ?? null)
						: null,
				})),
				netTotalsByUser: Object.fromEntries(netByUser),
			};
		},
		{ isolationLevel: "repeatable read", accessMode: "read only" },
	);
}
