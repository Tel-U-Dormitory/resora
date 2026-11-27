import type { ActiveIdentity } from "@resora/auth/sr-access";
import type { Database } from "@resora/db";
import {
	evaluationAudits,
	evaluationGformResponses,
	evaluationPeriods,
} from "@resora/db/schema/penilaian";
import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import type { z } from "zod";
import {
	getLiveOperationalIdentity,
	readOperationalIdentity,
	readSrPeriodEvaluationRoster,
} from "../identity/identity.public";
import {
	confirmGformImportSchema,
	type gformImportRowSchema,
	type gformSourceTypeSchema,
	listGformImportsSchema,
	previewGformImportSchema,
} from "./penilaian.contracts";
import {
	canManageRoutineEvaluation,
	canViewCommentsAndEvaluatorIdentity,
} from "./penilaian-policy";

type RosterMember = Awaited<
	ReturnType<typeof readSrPeriodEvaluationRoster>
>[number];

type EvaluatedImportRow = {
	rowNumber: number;
	status: "VALID" | "INVALID" | "DUPLICATE";
	errors: string[];
	normalizedRespondentKey: string;
	respondentRole: "SR" | "MABA" | "ASUS" | "DITMAWA";
	targetUserId: string | null;
	targetNim: string;
	targetName: string | null;
	buildingCode: string | null;
	answers: number[];
	totalScore: number | null;
	comment: string | null;
};

function fail(
	code: "FORBIDDEN" | "NOT_FOUND" | "BAD_REQUEST" | "CONFLICT",
	message: string,
): never {
	throw new TRPCError({ code, message });
}

function normalizeKey(value: string) {
	return value.trim().toLowerCase();
}

export function evaluateGformBatch(params: {
	sourceType: z.infer<typeof gformSourceTypeSchema>;
	rows: Array<z.infer<typeof gformImportRowSchema>>;
	roster: RosterMember[];
	existingKeys: Set<string>;
}) {
	const expectedQuestions = params.sourceType === "SR_MABA" ? 20 : 10;
	const allowedRoles =
		params.sourceType === "SR_MABA"
			? new Set(["SR", "MABA"])
			: new Set(["ASUS", "DITMAWA"]);
	const rosterByNim = new Map(
		params.roster
			.filter((member): member is RosterMember & { nim: string } =>
				Boolean(member.nim?.trim()),
			)
			.map((member) => [member.nim.trim(), member]),
	);
	const seenInBatch = new Set<string>();
	const evaluated: EvaluatedImportRow[] = [];

	for (const row of params.rows) {
		const errors: string[] = [];
		const normalizedRespondentKey = normalizeKey(row.respondentKey);
		const targetNim = row.targetNim.trim();
		const target = rosterByNim.get(targetNim) ?? null;

		if (!allowedRoles.has(row.respondentRole)) {
			errors.push(
				`Peran responden ${row.respondentRole} tidak sesuai untuk tipe ${params.sourceType}`,
			);
		}
		if (!target) {
			errors.push(`Target NIM ${targetNim} tidak terdaftar pada periode SR`);
		}
		if (row.answers.length !== expectedQuestions) {
			errors.push(
				`Jumlah jawaban harus tepat ${expectedQuestions} pertanyaan (diterima ${row.answers.length})`,
			);
		} else if (
			row.answers.some(
				(score) => !Number.isInteger(score) || score < 1 || score > 5,
			)
		) {
			errors.push("Setiap jawaban wajib berupa bilangan bulat skala 1–5");
		}

		let normalizedBuilding: string | null = row.buildingCode?.trim() ?? null;
		if (params.sourceType === "SR_MABA") {
			const targetBuilding = target?.currentBuildingCode?.trim() ?? null;
			if (!normalizedBuilding) {
				errors.push("Kode gedung wajib diisi untuk GForm SR/Maba");
			} else if (
				target &&
				(!targetBuilding ||
					normalizedBuilding.toUpperCase() !== targetBuilding.toUpperCase())
			) {
				errors.push(
					`Gedung responden (${normalizedBuilding}) tidak sama dengan gedung SR target (${targetBuilding ?? "TIDAK ADA"})`,
				);
			}
			if (
				row.respondentRole === "SR" &&
				target?.nim &&
				normalizedRespondentKey === normalizeKey(target.nim)
			) {
				errors.push("Responden SR tidak boleh menilai dirinya sendiri");
			}
		} else {
			normalizedBuilding = null;
		}

		const dedupKey = target
			? `${normalizedRespondentKey}::${target.userId}`
			: null;
		const isDuplicate =
			dedupKey !== null &&
			(params.existingKeys.has(dedupKey) || seenInBatch.has(dedupKey));
		if (dedupKey) seenInBatch.add(dedupKey);
		if (isDuplicate) {
			errors.push(
				"Respons duplikat untuk kombinasi periode, responden, dan target SR",
			);
		}

		const totalScore =
			errors.length === 0 && row.answers.length === expectedQuestions
				? row.answers.reduce((sum, val) => sum + val, 0)
				: null;

		const status: EvaluatedImportRow["status"] = isDuplicate
			? "DUPLICATE"
			: errors.length > 0
				? "INVALID"
				: "VALID";

		evaluated.push({
			rowNumber: row.rowNumber,
			status,
			errors,
			normalizedRespondentKey,
			respondentRole: row.respondentRole,
			targetUserId: target?.userId ?? null,
			targetNim,
			targetName: target?.name ?? null,
			buildingCode: target?.currentBuildingCode ?? normalizedBuilding,
			answers: row.answers,
			totalScore,
			comment: row.comment?.trim() ? row.comment.trim() : null,
		});
	}

	const validCount = evaluated.filter((r) => r.status === "VALID").length;
	const invalidCount = evaluated.filter((r) => r.status === "INVALID").length;
	const duplicateCount = evaluated.filter(
		(r) => r.status === "DUPLICATE",
	).length;

	return {
		totalRows: evaluated.length,
		validCount,
		invalidCount,
		duplicateCount,
		rows: evaluated,
	};
}

export async function previewGformImport(
	db: Database,
	identity: ActiveIdentity,
	input: z.input<typeof previewGformImportSchema>,
) {
	if (!canManageRoutineEvaluation(identity)) fail("FORBIDDEN", "HCO_REQUIRED");
	const data = previewGformImportSchema.parse(input);

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
				.where(eq(evaluationPeriods.id, data.evaluationPeriodId));
			if (!period) fail("NOT_FOUND", "EVALUATION_PERIOD_NOT_FOUND");

			const [roster, existing] = await Promise.all([
				readSrPeriodEvaluationRoster(tx, period.srPeriodId),
				tx
					.select({
						respondentKey: evaluationGformResponses.respondentKey,
						targetUserId: evaluationGformResponses.targetUserId,
					})
					.from(evaluationGformResponses)
					.where(
						and(
							eq(
								evaluationGformResponses.evaluationPeriodId,
								data.evaluationPeriodId,
							),
							eq(evaluationGformResponses.sourceType, data.sourceType),
							eq(evaluationGformResponses.cycleNumber, data.cycleNumber),
						),
					),
			]);

			const existingKeys = new Set(
				existing.map(
					(row) => `${normalizeKey(row.respondentKey)}::${row.targetUserId}`,
				),
			);
			const summary = evaluateGformBatch({
				sourceType: data.sourceType,
				rows: data.rows,
				roster,
				existingKeys,
			});

			const canSeeSensitive = canViewCommentsAndEvaluatorIdentity(live);
			return {
				...summary,
				canCommit:
					period.status !== "FINAL" &&
					summary.invalidCount === 0 &&
					summary.validCount > 0,
				rows: summary.rows.map((row) => ({
					...row,
					normalizedRespondentKey: canSeeSensitive
						? row.normalizedRespondentKey
						: "[TERLINDUNGI]",
					comment: canSeeSensitive ? row.comment : null,
				})),
			};
		},
		{ isolationLevel: "repeatable read", accessMode: "read only" },
	);
}

export async function confirmGformImport(
	db: Database,
	identity: ActiveIdentity,
	input: z.input<typeof confirmGformImportSchema>,
) {
	if (!canManageRoutineEvaluation(identity)) fail("FORBIDDEN", "HCO_REQUIRED");
	const data = confirmGformImportSchema.parse(input);

	return db.transaction(async (tx) => {
		const live = await getLiveOperationalIdentity(tx, identity.userId);
		if (!live || !canManageRoutineEvaluation(live))
			fail("FORBIDDEN", "HCO_REQUIRED");

		const [period] = await tx
			.select({
				id: evaluationPeriods.id,
				srPeriodId: evaluationPeriods.srPeriodId,
				status: evaluationPeriods.status,
			})
			.from(evaluationPeriods)
			.where(eq(evaluationPeriods.id, data.evaluationPeriodId))
			.for("update");
		if (!period) fail("NOT_FOUND", "EVALUATION_PERIOD_NOT_FOUND");
		if (period.status === "FINAL")
			fail("CONFLICT", "EVALUATION_PERIOD_FINALIZED");

		const [roster, existing] = await Promise.all([
			readSrPeriodEvaluationRoster(tx, period.srPeriodId),
			tx
				.select({
					respondentKey: evaluationGformResponses.respondentKey,
					targetUserId: evaluationGformResponses.targetUserId,
				})
				.from(evaluationGformResponses)
				.where(
					and(
						eq(
							evaluationGformResponses.evaluationPeriodId,
							data.evaluationPeriodId,
						),
						eq(evaluationGformResponses.sourceType, data.sourceType),
						eq(evaluationGformResponses.cycleNumber, data.cycleNumber),
					),
				),
		]);

		const existingKeys = new Set(
			existing.map(
				(row) => `${normalizeKey(row.respondentKey)}::${row.targetUserId}`,
			),
		);
		const summary = evaluateGformBatch({
			sourceType: data.sourceType,
			rows: data.rows,
			roster,
			existingKeys,
		});

		if (summary.invalidCount > 0)
			fail("BAD_REQUEST", "GFORM_IMPORT_HAS_INVALID_ROWS");
		if (summary.duplicateCount > 0 && !data.skipDuplicates)
			fail("CONFLICT", "GFORM_IMPORT_HAS_DUPLICATES");

		const rowsToInsert = summary.rows.filter(
			(
				row,
			): row is EvaluatedImportRow & {
				targetUserId: string;
				totalScore: number;
			} =>
				row.status === "VALID" &&
				row.targetUserId !== null &&
				row.totalScore !== null,
		);
		if (!rowsToInsert.length) fail("BAD_REQUEST", "GFORM_IMPORT_NO_VALID_ROWS");

		await tx.insert(evaluationGformResponses).values(
			rowsToInsert.map((row) => ({
				evaluationPeriodId: data.evaluationPeriodId,
				sourceType: data.sourceType,
				cycleNumber: data.cycleNumber,
				sourceReference: data.sourceReference,
				respondentKey: row.normalizedRespondentKey,
				respondentRole: row.respondentRole,
				targetUserId: row.targetUserId,
				buildingCode: row.buildingCode,
				answers: row.answers,
				totalScore: row.totalScore,
				comment: row.comment,
				importedByUserId: live.userId,
			})),
		);

		await tx.insert(evaluationAudits).values({
			evaluationPeriodId: data.evaluationPeriodId,
			entityType: "GFORM_IMPORT",
			actorUserId: live.userId,
			action: "GFORM_IMPORTED",
			reason: `Impor GForm ${data.sourceType} (${data.sourceReference})`,
			beforeState: null,
			afterState: {
				sourceType: data.sourceType,
				cycleNumber: data.cycleNumber,
				sourceReference: data.sourceReference,
				insertedCount: rowsToInsert.length,
				skippedDuplicates: summary.duplicateCount,
			},
		});

		return {
			insertedCount: rowsToInsert.length,
			skippedDuplicates: summary.duplicateCount,
			sourceType: data.sourceType,
			cycleNumber: data.cycleNumber,
		};
	});
}

export async function listGformImports(
	db: Database,
	identity: ActiveIdentity,
	input: z.input<typeof listGformImportsSchema>,
) {
	if (!canManageRoutineEvaluation(identity)) fail("FORBIDDEN", "HCO_REQUIRED");
	const data = listGformImportsSchema.parse(input);

	return db.transaction(
		async (tx) => {
			const live = await readOperationalIdentity(tx, identity.userId);
			if (!canManageRoutineEvaluation(live)) fail("FORBIDDEN", "HCO_REQUIRED");

			const canSeeSensitive = canViewCommentsAndEvaluatorIdentity(live);
			const rows = await tx
				.select({
					id: evaluationGformResponses.id,
					sourceType: evaluationGformResponses.sourceType,
					cycleNumber: evaluationGformResponses.cycleNumber,
					sourceReference: evaluationGformResponses.sourceReference,
					respondentKey: evaluationGformResponses.respondentKey,
					respondentRole: evaluationGformResponses.respondentRole,
					targetUserId: evaluationGformResponses.targetUserId,
					buildingCode: evaluationGformResponses.buildingCode,
					totalScore: evaluationGformResponses.totalScore,
					comment: evaluationGformResponses.comment,
					importedAt: evaluationGformResponses.importedAt,
				})
				.from(evaluationGformResponses)
				.where(
					and(
						eq(
							evaluationGformResponses.evaluationPeriodId,
							data.evaluationPeriodId,
						),
						data.sourceType
							? eq(evaluationGformResponses.sourceType, data.sourceType)
							: undefined,
					),
				)
				.orderBy(desc(evaluationGformResponses.importedAt));

			return rows.map((row) => ({
				...row,
				respondentKey: canSeeSensitive ? row.respondentKey : null,
				comment: canSeeSensitive ? row.comment : null,
			}));
		},
		{ isolationLevel: "repeatable read", accessMode: "read only" },
	);
}
