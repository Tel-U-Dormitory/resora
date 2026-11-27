import type { ActiveIdentity } from "@resora/auth/sr-access";
import type { Database } from "@resora/db";
import {
	evaluationAudits,
	evaluationPeriods,
} from "@resora/db/schema/penilaian";
import { TRPCError } from "@trpc/server";
import { desc, eq, ne, sql } from "drizzle-orm";
import type { z } from "zod";
import {
	getLiveOperationalIdentity,
	readOperationalIdentity,
	readScoringPeriods,
	readSrPeriod,
} from "../identity/identity.public";
import {
	createEvaluationPeriodSchema,
	evaluationSchedulesSchema,
	setActiveEvaluationPeriodSchema,
	updateEvaluationPeriodConfigSchema,
} from "./penilaian.contracts";
import {
	canManagePeriodGovernance,
	canManageRoutineEvaluation,
	canReadPenilaianModule,
	canViewPreFinalResults,
} from "./penilaian-policy";

function fail(
	code: "FORBIDDEN" | "NOT_FOUND" | "BAD_REQUEST" | "CONFLICT",
	message: string,
): never {
	throw new TRPCError({ code, message });
}

export async function listSrTenureOptions(
	db: Database,
	identity: ActiveIdentity,
) {
	if (!canManageRoutineEvaluation(identity)) fail("FORBIDDEN", "HCO_REQUIRED");
	return db.transaction(
		async (tx) => {
			const live = await readOperationalIdentity(tx, identity.userId);
			if (!canManageRoutineEvaluation(live)) fail("FORBIDDEN", "HCO_REQUIRED");
			return readScoringPeriods(tx);
		},
		{ isolationLevel: "repeatable read", accessMode: "read only" },
	);
}

export async function listEvaluationPeriods(
	db: Database,
	identity: ActiveIdentity,
) {
	if (!canReadPenilaianModule(identity))
		fail("FORBIDDEN", "EVALUATION_ACCESS_DENIED");
	return db.transaction(
		async (tx) => {
			const live = await readOperationalIdentity(tx, identity.userId);
			if (!canReadPenilaianModule(live))
				fail("FORBIDDEN", "EVALUATION_ACCESS_DENIED");
			const canSeePreFinal = canViewPreFinalResults(live);
			const rows = await tx
				.select({
					id: evaluationPeriods.id,
					srPeriodId: evaluationPeriods.srPeriodId,
					name: evaluationPeriods.name,
					status: evaluationPeriods.status,
					version: evaluationPeriods.version,
					isActive: evaluationPeriods.isActive,
					schedules: evaluationPeriods.schedules,
					sidakMaxPoints: evaluationPeriods.sidakMaxPoints,
					performanceThreshold: evaluationPeriods.performanceThreshold,
					finalizedAt: evaluationPeriods.finalizedAt,
					createdAt: evaluationPeriods.createdAt,
				})
				.from(evaluationPeriods)
				.orderBy(
					desc(evaluationPeriods.isActive),
					desc(evaluationPeriods.createdAt),
				);

			return rows.map((row) => ({
				...row,
				isFinalized: row.status === "FINAL",
				// Hide internal REVISING state from non-HCO/Inti roles.
				visibleStatus:
					canSeePreFinal || row.status === "FINAL"
						? row.status
						: ("BELUM_FINAL" as const),
			}));
		},
		{ isolationLevel: "repeatable read", accessMode: "read only" },
	);
}

export async function createEvaluationPeriod(
	db: Database,
	identity: ActiveIdentity,
	input: z.input<typeof createEvaluationPeriodSchema>,
) {
	if (!canManagePeriodGovernance(identity))
		fail("FORBIDDEN", "HCO_KADEP_OR_SUPERADMIN_REQUIRED");
	const data = createEvaluationPeriodSchema.parse(input);
	const schedules = evaluationSchedulesSchema.parse(data.schedules ?? {});

	return db.transaction(async (tx) => {
		await tx.execute(
			sql`SELECT pg_advisory_xact_lock(hashtext('resora:penilaian-period-admin'))`,
		);
		const live = await getLiveOperationalIdentity(tx, identity.userId);
		if (!canManagePeriodGovernance(live))
			fail("FORBIDDEN", "HCO_KADEP_OR_SUPERADMIN_REQUIRED");

		const srPeriod = await readSrPeriod(tx, data.srPeriodId);
		if (!srPeriod) fail("NOT_FOUND", "SR_PERIOD_NOT_FOUND");

		const [duplicate] = await tx
			.select({ id: evaluationPeriods.id })
			.from(evaluationPeriods)
			.where(eq(evaluationPeriods.name, data.name));
		if (duplicate) fail("CONFLICT", "EVALUATION_PERIOD_NAME_EXISTS");

		if (data.isActive) {
			await tx
				.update(evaluationPeriods)
				.set({ isActive: false })
				.where(eq(evaluationPeriods.isActive, true));
		}

		const [created] = await tx
			.insert(evaluationPeriods)
			.values({
				srPeriodId: srPeriod.id,
				name: data.name,
				status: "OPEN",
				version: 1,
				isActive: data.isActive,
				schedules,
				sidakMaxPoints: data.sidakMaxPoints,
				performanceThreshold: data.performanceThreshold,
				createdByUserId: identity.userId,
			})
			.returning();
		if (!created)
			throw new TRPCError({
				code: "INTERNAL_SERVER_ERROR",
				message: "EVALUATION_PERIOD_CREATE_FAILED",
			});

		await tx.insert(evaluationAudits).values({
			evaluationPeriodId: created.id,
			entityType: "PERIOD",
			entityId: created.id,
			actorUserId: identity.userId,
			action: "PERIOD_CREATED",
			reason: "Pembuatan periode evaluasi SR baru",
			beforeState: null,
			afterState: {
				srPeriodId: created.srPeriodId,
				name: created.name,
				isActive: created.isActive,
				sidakMaxPoints: created.sidakMaxPoints,
				performanceThreshold: created.performanceThreshold,
			},
		});

		return created;
	});
}

export async function updateEvaluationPeriodConfig(
	db: Database,
	identity: ActiveIdentity,
	input: z.input<typeof updateEvaluationPeriodConfigSchema>,
) {
	if (!canManagePeriodGovernance(identity))
		fail("FORBIDDEN", "HCO_KADEP_OR_SUPERADMIN_REQUIRED");
	const data = updateEvaluationPeriodConfigSchema.parse(input);

	return db.transaction(async (tx) => {
		await tx.execute(
			sql`SELECT pg_advisory_xact_lock(hashtext('resora:penilaian-period-admin'))`,
		);
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
			fail("CONFLICT", "EVALUATION_PERIOD_FINALIZED");

		if (data.name && data.name !== period.name) {
			const [duplicate] = await tx
				.select({ id: evaluationPeriods.id })
				.from(evaluationPeriods)
				.where(eq(evaluationPeriods.name, data.name));
			if (duplicate) fail("CONFLICT", "EVALUATION_PERIOD_NAME_EXISTS");
		}

		const nextName = data.name ?? period.name;
		const nextSidakMax = data.sidakMaxPoints ?? period.sidakMaxPoints;
		const nextThreshold =
			data.performanceThreshold !== undefined
				? data.performanceThreshold
				: period.performanceThreshold;
		const nextSchedules = data.schedules ?? period.schedules;

		const [updated] = await tx
			.update(evaluationPeriods)
			.set({
				name: nextName,
				sidakMaxPoints: nextSidakMax,
				performanceThreshold: nextThreshold,
				schedules: nextSchedules,
			})
			.where(eq(evaluationPeriods.id, period.id))
			.returning();

		await tx.insert(evaluationAudits).values({
			evaluationPeriodId: period.id,
			entityType: "PERIOD",
			entityId: period.id,
			actorUserId: identity.userId,
			action: "PERIOD_CONFIG_UPDATED",
			reason: data.reason,
			beforeState: {
				name: period.name,
				sidakMaxPoints: period.sidakMaxPoints,
				performanceThreshold: period.performanceThreshold,
				schedules: period.schedules,
			},
			afterState: {
				name: nextName,
				sidakMaxPoints: nextSidakMax,
				performanceThreshold: nextThreshold,
				schedules: nextSchedules,
			},
		});

		return updated;
	});
}

export async function setActiveEvaluationPeriod(
	db: Database,
	identity: ActiveIdentity,
	input: z.input<typeof setActiveEvaluationPeriodSchema>,
) {
	if (!canManagePeriodGovernance(identity))
		fail("FORBIDDEN", "HCO_KADEP_OR_SUPERADMIN_REQUIRED");
	const data = setActiveEvaluationPeriodSchema.parse(input);

	return db.transaction(async (tx) => {
		await tx.execute(
			sql`SELECT pg_advisory_xact_lock(hashtext('resora:penilaian-period-admin'))`,
		);
		const live = await getLiveOperationalIdentity(tx, identity.userId);
		if (!canManagePeriodGovernance(live))
			fail("FORBIDDEN", "HCO_KADEP_OR_SUPERADMIN_REQUIRED");

		const [target] = await tx
			.select()
			.from(evaluationPeriods)
			.where(eq(evaluationPeriods.id, data.evaluationPeriodId))
			.for("update");
		if (!target) fail("NOT_FOUND", "EVALUATION_PERIOD_NOT_FOUND");
		if (target.isActive) return target;

		await tx
			.update(evaluationPeriods)
			.set({ isActive: false })
			.where(ne(evaluationPeriods.id, target.id));

		const [updated] = await tx
			.update(evaluationPeriods)
			.set({ isActive: true })
			.where(eq(evaluationPeriods.id, target.id))
			.returning();

		await tx.insert(evaluationAudits).values({
			evaluationPeriodId: target.id,
			entityType: "PERIOD",
			entityId: target.id,
			actorUserId: identity.userId,
			action: "PERIOD_ACTIVATED",
			reason: "Periode evaluasi ditetapkan sebagai periode aktif",
			beforeState: { isActive: false },
			afterState: { isActive: true },
		});

		return updated;
	});
}
