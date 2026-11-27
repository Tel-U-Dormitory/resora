import type { ActiveIdentity } from "@resora/auth/sr-access";
import type { Database } from "@resora/db";
import {
	evaluationAudits,
	evaluationDepartmentScores,
	evaluationEventScores,
	evaluationPeriodEvents,
	evaluationPeriods,
} from "@resora/db/schema/penilaian";
import { TRPCError } from "@trpc/server";
import { and, asc, eq } from "drizzle-orm";
import type { z } from "zod";
import {
	invitationSnapshots,
	listEvaluatableEvents,
	readEvent,
} from "../events/events.public";
import {
	getLiveOperationalIdentity,
	readOperationalIdentity,
	readSrPeriod,
	readSrPeriodEvaluationRoster,
} from "../identity/identity.public";
import {
	configurePeriodEventSchema,
	evaluationPeriodIdSchema,
	listDepartmentTasksSchema,
	submitDepartmentEvaluationSchema,
	submitEventEvaluationSchema,
} from "./penilaian.contracts";
import {
	canEvaluateDepartmentTarget,
	canManagePeriodGovernance,
	canManageRoutineEvaluation,
} from "./penilaian-policy";

function fail(
	code: "FORBIDDEN" | "NOT_FOUND" | "BAD_REQUEST" | "CONFLICT",
	message: string,
): never {
	throw new TRPCError({ code, message });
}

export async function listCandidateEventsForPeriod(
	db: Database,
	identity: ActiveIdentity,
	input: z.input<typeof evaluationPeriodIdSchema>,
) {
	if (!canManageRoutineEvaluation(identity)) fail("FORBIDDEN", "HCO_REQUIRED");
	const { evaluationPeriodId } = evaluationPeriodIdSchema.parse(input);

	return db.transaction(
		async (tx) => {
			const live = await readOperationalIdentity(tx, identity.userId);
			if (!canManageRoutineEvaluation(live)) fail("FORBIDDEN", "HCO_REQUIRED");

			const [period] = await tx
				.select({
					id: evaluationPeriods.id,
					srPeriodId: evaluationPeriods.srPeriodId,
					status: evaluationPeriods.status,
				})
				.from(evaluationPeriods)
				.where(eq(evaluationPeriods.id, evaluationPeriodId));
			if (!period) fail("NOT_FOUND", "EVALUATION_PERIOD_NOT_FOUND");

			const srPeriod = await readSrPeriod(tx, period.srPeriodId);
			if (!srPeriod) fail("NOT_FOUND", "SR_PERIOD_NOT_FOUND");

			const [events, configured] = await Promise.all([
				listEvaluatableEvents(tx, srPeriod.startsOn, srPeriod.endsOn),
				tx
					.select({
						id: evaluationPeriodEvents.id,
						eventId: evaluationPeriodEvents.eventId,
						category: evaluationPeriodEvents.category,
						isMandatory: evaluationPeriodEvents.isMandatory,
					})
					.from(evaluationPeriodEvents)
					.where(
						eq(evaluationPeriodEvents.evaluationPeriodId, evaluationPeriodId),
					),
			]);
			const configuredByEventId = new Map(
				configured.map((row) => [row.eventId, row]),
			);

			return events.map((event) => ({
				...event,
				configured: configuredByEventId.get(event.eventId) ?? null,
			}));
		},
		{ isolationLevel: "repeatable read", accessMode: "read only" },
	);
}

export async function configurePeriodEvent(
	db: Database,
	identity: ActiveIdentity,
	input: z.input<typeof configurePeriodEventSchema>,
) {
	if (!canManagePeriodGovernance(identity))
		fail("FORBIDDEN", "HCO_KADEP_OR_SUPERADMIN_REQUIRED");
	const data = configurePeriodEventSchema.parse(input);

	return db.transaction(async (tx) => {
		const live = await getLiveOperationalIdentity(tx, identity.userId);
		if (!canManagePeriodGovernance(live))
			fail("FORBIDDEN", "HCO_KADEP_OR_SUPERADMIN_REQUIRED");

		const [period] = await tx
			.select({
				id: evaluationPeriods.id,
				status: evaluationPeriods.status,
			})
			.from(evaluationPeriods)
			.where(eq(evaluationPeriods.id, data.evaluationPeriodId))
			.for("update");
		if (!period) fail("NOT_FOUND", "EVALUATION_PERIOD_NOT_FOUND");
		if (period.status === "FINAL")
			fail("CONFLICT", "EVALUATION_PERIOD_FINALIZED");

		const [event] = await readEvent(tx, data.eventId);
		if (!event) fail("NOT_FOUND", "EVENT_NOT_FOUND");
		if (event.status !== "PUBLISHED" && event.status !== "CLOSED")
			fail("CONFLICT", "EVENT_NOT_PUBLISHED");

		const [existing] = await tx
			.select()
			.from(evaluationPeriodEvents)
			.where(
				and(
					eq(
						evaluationPeriodEvents.evaluationPeriodId,
						data.evaluationPeriodId,
					),
					eq(evaluationPeriodEvents.eventId, data.eventId),
				),
			)
			.for("update");

		const [saved] = existing
			? await tx
					.update(evaluationPeriodEvents)
					.set({
						category: data.category,
						isMandatory: data.isMandatory,
						configuredByUserId: identity.userId,
					})
					.where(eq(evaluationPeriodEvents.id, existing.id))
					.returning()
			: await tx
					.insert(evaluationPeriodEvents)
					.values({
						evaluationPeriodId: data.evaluationPeriodId,
						eventId: data.eventId,
						category: data.category,
						isMandatory: data.isMandatory,
						configuredByUserId: identity.userId,
					})
					.returning();

		if (!saved)
			throw new TRPCError({
				code: "INTERNAL_SERVER_ERROR",
				message: "EVALUATION_PERIOD_EVENT_SAVE_FAILED",
			});

		await tx.insert(evaluationAudits).values({
			evaluationPeriodId: data.evaluationPeriodId,
			entityType: "PERIOD_EVENT",
			entityId: saved.id,
			actorUserId: identity.userId,
			action: existing ? "PERIOD_EVENT_UPDATED" : "PERIOD_EVENT_ADDED",
			reason: data.reason,
			beforeState: existing
				? {
						category: existing.category,
						isMandatory: existing.isMandatory,
					}
				: null,
			afterState: {
				eventId: saved.eventId,
				category: saved.category,
				isMandatory: saved.isMandatory,
			},
		});

		return saved;
	});
}

export async function listMyEventEvaluationTasks(
	db: Database,
	identity: ActiveIdentity,
	input: z.input<typeof evaluationPeriodIdSchema>,
) {
	if (identity.actor !== "SR")
		fail("FORBIDDEN", "SR_EVALUATOR_IDENTITY_REQUIRED");
	const { evaluationPeriodId } = evaluationPeriodIdSchema.parse(input);

	return db.transaction(
		async (tx) => {
			const live = await readOperationalIdentity(tx, identity.userId);
			if (live?.actor !== "SR")
				fail("FORBIDDEN", "SR_EVALUATOR_IDENTITY_REQUIRED");

			const [period] = await tx
				.select({
					id: evaluationPeriods.id,
					status: evaluationPeriods.status,
				})
				.from(evaluationPeriods)
				.where(eq(evaluationPeriods.id, evaluationPeriodId));
			if (!period) fail("NOT_FOUND", "EVALUATION_PERIOD_NOT_FOUND");

			const periodEvents = await tx
				.select({
					periodEventId: evaluationPeriodEvents.id,
					eventId: evaluationPeriodEvents.eventId,
					category: evaluationPeriodEvents.category,
					isMandatory: evaluationPeriodEvents.isMandatory,
				})
				.from(evaluationPeriodEvents)
				.where(
					eq(evaluationPeriodEvents.evaluationPeriodId, evaluationPeriodId),
				)
				.orderBy(asc(evaluationPeriodEvents.createdAt));

			const submitted = await tx
				.select({
					periodEventId: evaluationEventScores.periodEventId,
					targetUserId: evaluationEventScores.targetUserId,
					commitment: evaluationEventScores.commitment,
					teamwork: evaluationEventScores.teamwork,
					attitude: evaluationEventScores.attitude,
					contribution: evaluationEventScores.contribution,
					submittedAt: evaluationEventScores.submittedAt,
				})
				.from(evaluationEventScores)
				.where(
					and(
						eq(evaluationEventScores.evaluationPeriodId, evaluationPeriodId),
						eq(evaluationEventScores.evaluatorUserId, live.userId),
					),
				);
			const submittedMap = new Map(
				submitted.map((row) => [
					`${row.periodEventId}:${row.targetUserId}`,
					row,
				]),
			);

			const tasks = [];
			for (const pe of periodEvents) {
				const [event] = await readEvent(tx, pe.eventId);
				if (
					!event ||
					(event.status !== "PUBLISHED" && event.status !== "CLOSED")
				)
					continue;
				const roster = await invitationSnapshots(tx, pe.eventId);
				const isParticipant = roster.some(
					(member) => member.userId === live.userId,
				);
				if (!isParticipant) continue;

				const targets = roster
					.filter((member) => member.userId !== live.userId)
					.map((member) => ({
						userId: member.userId,
						nim: member.nim,
						name: member.name,
						departmentCode: member.departmentCode,
						committeeDivision: member.committeeDivision,
						committeePosition: member.committeePosition,
						submission:
							submittedMap.get(`${pe.periodEventId}:${member.userId}`) ?? null,
					}));

				tasks.push({
					periodEventId: pe.periodEventId,
					eventId: pe.eventId,
					title: event.title,
					category: pe.category,
					isMandatory: pe.isMandatory,
					canSubmit: period.status !== "FINAL",
					targets,
				});
			}
			return tasks;
		},
		{ isolationLevel: "repeatable read", accessMode: "read only" },
	);
}

export async function submitEventEvaluation(
	db: Database,
	identity: ActiveIdentity,
	input: z.input<typeof submitEventEvaluationSchema>,
) {
	if (identity.actor !== "SR")
		fail("FORBIDDEN", "SR_EVALUATOR_IDENTITY_REQUIRED");
	const data = submitEventEvaluationSchema.parse(input);
	if (data.targetUserId === identity.userId)
		fail("BAD_REQUEST", "SELF_EVALUATION_NOT_ALLOWED");

	return db.transaction(async (tx) => {
		const live = await getLiveOperationalIdentity(tx, identity.userId);
		if (live?.actor !== "SR")
			fail("FORBIDDEN", "SR_EVALUATOR_IDENTITY_REQUIRED");

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

		const [periodEvent] = await tx
			.select()
			.from(evaluationPeriodEvents)
			.where(
				and(
					eq(evaluationPeriodEvents.id, data.periodEventId),
					eq(
						evaluationPeriodEvents.evaluationPeriodId,
						data.evaluationPeriodId,
					),
				),
			)
			.for("share");
		if (!periodEvent) fail("NOT_FOUND", "EVALUATION_PERIOD_EVENT_NOT_FOUND");

		const [event] = await readEvent(tx, periodEvent.eventId);
		if (!event || (event.status !== "PUBLISHED" && event.status !== "CLOSED"))
			fail("CONFLICT", "EVENT_NOT_PUBLISHED");

		const roster = await invitationSnapshots(tx, periodEvent.eventId);
		const evaluatorInRoster = roster.some(
			(member) => member.userId === live.userId,
		);
		const targetInRoster = roster.some(
			(member) => member.userId === data.targetUserId,
		);
		if (!evaluatorInRoster) fail("FORBIDDEN", "EVALUATOR_NOT_IN_EVENT_ROSTER");
		if (!targetInRoster) fail("BAD_REQUEST", "TARGET_NOT_IN_EVENT_ROSTER");

		const [existing] = await tx
			.select({ id: evaluationEventScores.id })
			.from(evaluationEventScores)
			.where(
				and(
					eq(evaluationEventScores.periodEventId, data.periodEventId),
					eq(evaluationEventScores.evaluatorUserId, live.userId),
					eq(evaluationEventScores.targetUserId, data.targetUserId),
				),
			);
		if (existing) fail("CONFLICT", "EVALUATION_DUPLICATE_SUBMISSION");

		const [inserted] = await tx
			.insert(evaluationEventScores)
			.values({
				evaluationPeriodId: data.evaluationPeriodId,
				periodEventId: data.periodEventId,
				evaluatorUserId: live.userId,
				targetUserId: data.targetUserId,
				commitment: data.commitment,
				teamwork: data.teamwork,
				attitude: data.attitude,
				contribution: data.contribution,
				comment: data.comment ?? null,
			})
			.returning({
				id: evaluationEventScores.id,
				periodEventId: evaluationEventScores.periodEventId,
				targetUserId: evaluationEventScores.targetUserId,
				commitment: evaluationEventScores.commitment,
				teamwork: evaluationEventScores.teamwork,
				attitude: evaluationEventScores.attitude,
				contribution: evaluationEventScores.contribution,
				submittedAt: evaluationEventScores.submittedAt,
			});

		if (!inserted)
			throw new TRPCError({
				code: "INTERNAL_SERVER_ERROR",
				message: "EVENT_SCORE_SAVE_FAILED",
			});

		await tx.insert(evaluationAudits).values({
			evaluationPeriodId: data.evaluationPeriodId,
			targetUserId: data.targetUserId,
			entityType: "EVENT_SCORE",
			entityId: inserted.id,
			actorUserId: live.userId,
			action: "EVENT_SCORE_SUBMITTED",
			reason: "Pengiriman penilaian event SR",
			beforeState: null,
			afterState: {
				periodEventId: data.periodEventId,
				commitment: data.commitment,
				teamwork: data.teamwork,
				attitude: data.attitude,
				contribution: data.contribution,
			},
		});

		return inserted;
	});
}

export async function listMyDepartmentEvaluationTasks(
	db: Database,
	identity: ActiveIdentity,
	input: z.input<typeof listDepartmentTasksSchema>,
) {
	if (identity.actor !== "SR")
		fail("FORBIDDEN", "SR_EVALUATOR_IDENTITY_REQUIRED");
	const { evaluationPeriodId, quarterNumber } =
		listDepartmentTasksSchema.parse(input);

	return db.transaction(
		async (tx) => {
			const live = await readOperationalIdentity(tx, identity.userId);
			if (live?.actor !== "SR")
				fail("FORBIDDEN", "SR_EVALUATOR_IDENTITY_REQUIRED");

			const [period] = await tx
				.select({
					id: evaluationPeriods.id,
					srPeriodId: evaluationPeriods.srPeriodId,
					status: evaluationPeriods.status,
				})
				.from(evaluationPeriods)
				.where(eq(evaluationPeriods.id, evaluationPeriodId));
			if (!period) fail("NOT_FOUND", "EVALUATION_PERIOD_NOT_FOUND");

			const roster = await readSrPeriodEvaluationRoster(tx, period.srPeriodId);
			const submitted = await tx
				.select({
					targetUserId: evaluationDepartmentScores.targetUserId,
					commitment: evaluationDepartmentScores.commitment,
					teamwork: evaluationDepartmentScores.teamwork,
					attitude: evaluationDepartmentScores.attitude,
					contribution: evaluationDepartmentScores.contribution,
					submittedAt: evaluationDepartmentScores.submittedAt,
				})
				.from(evaluationDepartmentScores)
				.where(
					and(
						eq(
							evaluationDepartmentScores.evaluationPeriodId,
							evaluationPeriodId,
						),
						eq(evaluationDepartmentScores.quarterNumber, quarterNumber),
						eq(evaluationDepartmentScores.evaluatorUserId, live.userId),
					),
				);
			const submittedMap = new Map(
				submitted.map((row) => [row.targetUserId, row]),
			);

			const targets = roster
				.filter((member) =>
					canEvaluateDepartmentTarget(live, {
						userId: member.userId,
						departmentCode: member.currentDepartmentCode,
						positionCode: member.currentPositionCode,
					}),
				)
				.map((member) => ({
					userId: member.userId,
					nim: member.nim,
					name: member.name,
					departmentCode: member.currentDepartmentCode,
					positionCode: member.currentPositionCode,
					buildingName: member.currentBuildingName,
					submission: submittedMap.get(member.userId) ?? null,
				}));

			return {
				quarterNumber,
				canSubmit: period.status !== "FINAL",
				targets,
			};
		},
		{ isolationLevel: "repeatable read", accessMode: "read only" },
	);
}

export async function submitDepartmentEvaluation(
	db: Database,
	identity: ActiveIdentity,
	input: z.input<typeof submitDepartmentEvaluationSchema>,
) {
	if (identity.actor !== "SR")
		fail("FORBIDDEN", "SR_EVALUATOR_IDENTITY_REQUIRED");
	const data = submitDepartmentEvaluationSchema.parse(input);
	if (data.targetUserId === identity.userId)
		fail("BAD_REQUEST", "SELF_EVALUATION_NOT_ALLOWED");

	return db.transaction(async (tx) => {
		const live = await getLiveOperationalIdentity(tx, identity.userId);
		if (live?.actor !== "SR")
			fail("FORBIDDEN", "SR_EVALUATOR_IDENTITY_REQUIRED");

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
		const target = roster.find((member) => member.userId === data.targetUserId);
		if (!target) fail("NOT_FOUND", "TARGET_SR_NOT_IN_PERIOD_ROSTER");

		if (
			!canEvaluateDepartmentTarget(live, {
				userId: target.userId,
				departmentCode: target.currentDepartmentCode,
				positionCode: target.currentPositionCode,
			})
		)
			fail("FORBIDDEN", "DEPARTMENT_EVALUATION_NOT_AUTHORIZED");

		const [existing] = await tx
			.select({ id: evaluationDepartmentScores.id })
			.from(evaluationDepartmentScores)
			.where(
				and(
					eq(
						evaluationDepartmentScores.evaluationPeriodId,
						data.evaluationPeriodId,
					),
					eq(evaluationDepartmentScores.quarterNumber, data.quarterNumber),
					eq(evaluationDepartmentScores.evaluatorUserId, live.userId),
					eq(evaluationDepartmentScores.targetUserId, data.targetUserId),
				),
			);
		if (existing) fail("CONFLICT", "EVALUATION_DUPLICATE_SUBMISSION");

		const [inserted] = await tx
			.insert(evaluationDepartmentScores)
			.values({
				evaluationPeriodId: data.evaluationPeriodId,
				quarterNumber: data.quarterNumber,
				evaluatorUserId: live.userId,
				targetUserId: data.targetUserId,
				targetDepartmentCode: target.currentDepartmentCode,
				targetPositionCode: target.currentPositionCode,
				commitment: data.commitment,
				teamwork: data.teamwork,
				attitude: data.attitude,
				contribution: data.contribution,
				comment: data.comment ?? null,
			})
			.returning({
				id: evaluationDepartmentScores.id,
				quarterNumber: evaluationDepartmentScores.quarterNumber,
				targetUserId: evaluationDepartmentScores.targetUserId,
				commitment: evaluationDepartmentScores.commitment,
				teamwork: evaluationDepartmentScores.teamwork,
				attitude: evaluationDepartmentScores.attitude,
				contribution: evaluationDepartmentScores.contribution,
				submittedAt: evaluationDepartmentScores.submittedAt,
			});

		if (!inserted)
			throw new TRPCError({
				code: "INTERNAL_SERVER_ERROR",
				message: "DEPARTMENT_SCORE_SAVE_FAILED",
			});

		await tx.insert(evaluationAudits).values({
			evaluationPeriodId: data.evaluationPeriodId,
			targetUserId: data.targetUserId,
			entityType: "DEPARTMENT_SCORE",
			entityId: inserted.id,
			actorUserId: live.userId,
			action: "DEPARTMENT_SCORE_SUBMITTED",
			reason: "Pengiriman penilaian departemen triwulanan SR",
			beforeState: null,
			afterState: {
				quarterNumber: data.quarterNumber,
				targetDepartmentCode: target.currentDepartmentCode,
				targetPositionCode: target.currentPositionCode,
				commitment: data.commitment,
				teamwork: data.teamwork,
				attitude: data.attitude,
				contribution: data.contribution,
			},
		});

		return inserted;
	});
}
