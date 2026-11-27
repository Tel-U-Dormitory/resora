import { z } from "zod";

export const EVALUATION_WEIGHTS = {
	ANNUAL: 0.25,
	MONTHLY: 0.1,
	WEEKLY: 0.1,
	DEPARTMENT: 0.25,
	GFORM: 0.5,
} as const;

export const EVALUATION_INDICATORS = [
	"Komitmen",
	"Teamwork",
	"Sikap",
	"Kontribusi",
] as const;

export const EVALUATION_STATUS_LABELS = {
	BELUM_TERSEDIA: "Belum tersedia",
	BELUM_LENGKAP: "Belum lengkap",
	SIAP_DIFINALISASI: "Siap difinalisasi",
	FINAL: "Final",
} as const;

export type EvaluationReadinessStatus = keyof typeof EVALUATION_STATUS_LABELS;

function containsForbiddenControls(value: string) {
	return [...value].some((character) => {
		const codePoint = character.codePointAt(0) ?? 0;
		return (
			(codePoint < 32 && ![9, 10, 13].includes(codePoint)) || codePoint === 127
		);
	});
}

export function plainEvaluationText(
	minimum: number,
	maximum: number,
	multiline = false,
) {
	return z
		.string()
		.trim()
		.min(minimum)
		.max(maximum)
		.refine(
			(value) =>
				!containsForbiddenControls(value) &&
				(multiline || !/[\r\n\t]/.test(value)),
			{ message: "EVALUATION_TEXT_INVALID" },
		);
}

const isoDate = z.iso.date();

export const scheduleWindowSchema = z
	.object({
		startsOn: isoDate.nullable().default(null),
		endsOn: isoDate.nullable().default(null),
		cadenceNote: plainEvaluationText(1, 160).nullable().default(null),
	})
	.strict()
	.refine(
		(value) =>
			!value.startsOn || !value.endsOn || value.startsOn <= value.endsOn,
		{ message: "EVALUATION_SCHEDULE_RANGE_INVALID" },
	);

export const evaluationSchedulesSchema = z
	.object({
		annualEvent: scheduleWindowSchema.default({
			startsOn: null,
			endsOn: null,
			cadenceNote: "Evaluasi setiap 3 bulan",
		}),
		monthlyEvent: scheduleWindowSchema.default({
			startsOn: null,
			endsOn: null,
			cadenceNote: "Evaluasi setiap 3 bulan",
		}),
		weeklyEvent: scheduleWindowSchema.default({
			startsOn: null,
			endsOn: null,
			cadenceNote: "Evaluasi setiap 2 minggu",
		}),
		department: scheduleWindowSchema.default({
			startsOn: null,
			endsOn: null,
			cadenceNote: "Evaluasi setiap 3 bulan",
		}),
		gform: scheduleWindowSchema.default({
			startsOn: null,
			endsOn: null,
			cadenceNote: "Evaluasi setiap 3 bulan",
		}),
		external: scheduleWindowSchema.default({
			startsOn: null,
			endsOn: null,
			cadenceNote: "Jadwal evaluasi eksternal belum ditentukan",
		}),
	})
	.strict();

export const createEvaluationPeriodSchema = z
	.object({
		srPeriodId: z.uuid(),
		name: plainEvaluationText(1, 120),
		isActive: z.boolean().default(true),
		sidakMaxPoints: z.number().finite().positive().max(100).default(10),
		performanceThreshold: z
			.number()
			.finite()
			.min(0)
			.max(1000)
			.nullable()
			.default(null),
		schedules: evaluationSchedulesSchema.optional(),
	})
	.strict();

export const updateEvaluationPeriodConfigSchema = z
	.object({
		evaluationPeriodId: z.uuid(),
		name: plainEvaluationText(1, 120).optional(),
		sidakMaxPoints: z.number().finite().positive().max(100).optional(),
		performanceThreshold: z
			.number()
			.finite()
			.min(0)
			.max(1000)
			.nullable()
			.optional(),
		schedules: evaluationSchedulesSchema.optional(),
		reason: plainEvaluationText(1, 500).default(
			"Pembaruan konfigurasi periode",
		),
	})
	.strict()
	.refine(
		(value) =>
			value.name !== undefined ||
			value.sidakMaxPoints !== undefined ||
			value.performanceThreshold !== undefined ||
			value.schedules !== undefined,
		{ message: "EVALUATION_PERIOD_UPDATE_EMPTY" },
	);

export const setActiveEvaluationPeriodSchema = z
	.object({
		evaluationPeriodId: z.uuid(),
	})
	.strict();

export const evaluationPeriodIdSchema = z
	.object({
		evaluationPeriodId: z.uuid(),
	})
	.strict();

export const eventEvaluationTaskSchema = z
	.object({
		eventId: z.uuid(),
	})
	.strict();

export const evaluationEventCategorySchema = z.enum([
	"ANNUAL",
	"MONTHLY",
	"WEEKLY",
]);

export const indicatorScoreSchema = z.number().finite().min(0).max(100);

export const configurePeriodEventSchema = z
	.object({
		evaluationPeriodId: z.uuid(),
		eventId: z.uuid(),
		category: evaluationEventCategorySchema,
		isMandatory: z.boolean().default(true),
		reason: plainEvaluationText(1, 500).default(
			"Penetapan event penilaian periode",
		),
	})
	.strict();

export const submitEventEvaluationSchema = z
	.object({
		evaluationPeriodId: z.uuid(),
		periodEventId: z.uuid(),
		targetUserId: z.string().trim().min(1).max(128),
		commitment: indicatorScoreSchema,
		teamwork: indicatorScoreSchema,
		attitude: indicatorScoreSchema,
		contribution: indicatorScoreSchema,
		comment: plainEvaluationText(1, 2000, true).nullable().optional(),
	})
	.strict();

export const listDepartmentTasksSchema = z
	.object({
		evaluationPeriodId: z.uuid(),
		quarterNumber: z.number().int().min(1).max(4).default(1),
	})
	.strict();

export const submitDepartmentEvaluationSchema = z
	.object({
		evaluationPeriodId: z.uuid(),
		quarterNumber: z.number().int().min(1).max(4).default(1),
		targetUserId: z.string().trim().min(1).max(128),
		commitment: indicatorScoreSchema,
		teamwork: indicatorScoreSchema,
		attitude: indicatorScoreSchema,
		contribution: indicatorScoreSchema,
		comment: plainEvaluationText(1, 2000, true).nullable().optional(),
	})
	.strict();

export const gformSourceTypeSchema = z.enum([
	"SR_MABA",
	"EXTERNAL_ASUS_DITMAWA",
]);

export const gformImportRowSchema = z
	.object({
		rowNumber: z.number().int().min(1).max(10_000),
		respondentKey: plainEvaluationText(1, 160),
		respondentRole: z.enum(["SR", "MABA", "ASUS", "DITMAWA"]),
		targetNim: plainEvaluationText(1, 64),
		buildingCode: plainEvaluationText(1, 32).nullable().optional(),
		answers: z.array(z.number().finite()).min(1).max(20),
		comment: plainEvaluationText(1, 2000, true).nullable().optional(),
	})
	.strict();

export const previewGformImportSchema = z
	.object({
		evaluationPeriodId: z.uuid(),
		sourceType: gformSourceTypeSchema,
		cycleNumber: z.number().int().min(1).max(12).default(1),
		sourceReference: plainEvaluationText(1, 160),
		rows: z.array(gformImportRowSchema).min(1).max(2000),
	})
	.strict();

export const confirmGformImportSchema = previewGformImportSchema
	.extend({
		skipDuplicates: z.boolean().default(false),
	})
	.strict();

export const listGformImportsSchema = z
	.object({
		evaluationPeriodId: z.uuid(),
		sourceType: gformSourceTypeSchema.optional(),
	})
	.strict();

export const attendanceActivityTypeSchema = z.enum([
	"RAPAT_ALL_PANITIA",
	"EVENT_BESAR",
	"EVENT_SEBAGIAN",
	"SIDAK",
]);

// IZIN_5K intentionally omitted until 5K definition is approved (FR-EVAL-008/034).
export const attendanceFallbackStatusSchema = z.enum([
	"HADIR_TEPAT_WAKTU",
	"TERLAMBAT_DENGAN_IZIN",
	"TERLAMBAT_TANPA_IZIN_MAX_15",
	"TERLAMBAT_DENGAN_IZIN_LEBIH_15",
	"TERLAMBAT_TANPA_IZIN_LEBIH_15",
	"IZIN_DI_LUAR_5K",
	"ALFA",
]);

export const ATTENDANCE_STATUS_BASE_10: Record<
	z.infer<typeof attendanceFallbackStatusSchema>,
	number
> = {
	HADIR_TEPAT_WAKTU: 10,
	TERLAMBAT_DENGAN_IZIN: 8,
	TERLAMBAT_TANPA_IZIN_MAX_15: 7,
	TERLAMBAT_DENGAN_IZIN_LEBIH_15: 6,
	TERLAMBAT_TANPA_IZIN_LEBIH_15: 5,
	IZIN_DI_LUAR_5K: 3,
	ALFA: 0,
};

export function calculateFallbackAttendancePoints(
	activityType: z.infer<typeof attendanceActivityTypeSchema>,
	status: z.infer<typeof attendanceFallbackStatusSchema>,
	sidakMaxPoints: number,
) {
	const maxPoints =
		activityType === "EVENT_SEBAGIAN"
			? 6
			: activityType === "SIDAK"
				? sidakMaxPoints
				: 10;
	const base = ATTENDANCE_STATUS_BASE_10[status];
	return {
		maxPoints,
		earnedPoints: Math.round((base / 10) * maxPoints * 100) / 100,
	};
}

export const recordAttendanceFallbackSchema = z
	.object({
		evaluationPeriodId: z.uuid(),
		targetUserId: z.string().trim().min(1).max(128),
		activityType: attendanceActivityTypeSchema,
		activityTitle: plainEvaluationText(1, 160),
		activityDate: isoDate,
		attendanceStatus: attendanceFallbackStatusSchema,
		sourceKind: z
			.enum(["MANUAL_FALLBACK", "IMPORT_FALLBACK"])
			.default("MANUAL_FALLBACK"),
		sourceReference: plainEvaluationText(1, 160).nullable().optional(),
		notes: plainEvaluationText(1, 500, true),
	})
	.strict();

export const listAttendancePointsSchema = z
	.object({
		evaluationPeriodId: z.uuid(),
		targetUserId: z.string().trim().min(1).max(128).optional(),
	})
	.strict();

export const proposePointTransactionSchema = z
	.object({
		evaluationPeriodId: z.uuid(),
		targetUserId: z.string().trim().min(1).max(128),
		transactionType: z.enum(["ADDITION", "DEDUCTION"]),
		points: z.number().finite().positive().max(1000),
		category: plainEvaluationText(1, 100),
		reason: plainEvaluationText(1, 1000, true),
		occurredOn: isoDate,
	})
	.strict();

export const decidePointTransactionSchema = z
	.object({
		evaluationPeriodId: z.uuid(),
		transactionId: z.uuid(),
		decision: z.enum(["APPROVED", "REJECTED"]),
		decisionNote: plainEvaluationText(1, 500, true).nullable().optional(),
	})
	.strict();

export const listPointTransactionsSchema = z
	.object({
		evaluationPeriodId: z.uuid(),
		targetUserId: z.string().trim().min(1).max(128).optional(),
		status: z.enum(["PENDING", "APPROVED", "REJECTED"]).optional(),
	})
	.strict();

export const finalizeEvaluationPeriodSchema = z
	.object({
		evaluationPeriodId: z.uuid(),
		reason: plainEvaluationText(1, 500).default(
			"Finalisasi hasil penilaian KPI periode",
		),
	})
	.strict();

export const openEvaluationRevisionSchema = z
	.object({
		evaluationPeriodId: z.uuid(),
		reason: plainEvaluationText(1, 1000, true),
	})
	.strict();

export const correctEvaluationScoreSchema = z
	.object({
		evaluationPeriodId: z.uuid(),
		scoreType: z.enum(["EVENT_SCORE", "DEPARTMENT_SCORE"]),
		scoreId: z.uuid(),
		commitment: indicatorScoreSchema,
		teamwork: indicatorScoreSchema,
		attitude: indicatorScoreSchema,
		contribution: indicatorScoreSchema,
		reason: plainEvaluationText(1, 1000, true),
	})
	.strict();

export const recapFilterSchema = z
	.object({
		evaluationPeriodId: z.uuid(),
		query: plainEvaluationText(1, 120).optional(),
		departmentCode: plainEvaluationText(1, 32).optional(),
		buildingCode: plainEvaluationText(1, 32).optional(),
		aggregateOnly: z.boolean().default(false),
	})
	.strict();

export const memberDetailSchema = z
	.object({
		evaluationPeriodId: z.uuid(),
		targetUserId: z.string().trim().min(1).max(128),
	})
	.strict();

export const ownRecapSchema = z
	.object({
		evaluationPeriodId: z.uuid().optional(),
	})
	.strict();

export const evaluationDashboardSummarySchema = z
	.object({
		mode: z.enum(["personal", "management"]).default("personal"),
	})
	.strict();

export const evaluationAuditHistorySchema = z
	.object({
		evaluationPeriodId: z.uuid(),
		targetUserId: z.string().trim().min(1).max(128).optional(),
	})
	.strict();

export function parseCsvLine(line: string): string[] {
	const cells: string[] = [];
	let current = "";
	let inQuotes = false;
	for (let i = 0; i < line.length; i++) {
		const ch = line[i];
		if (ch === '"') {
			if (inQuotes && line[i + 1] === '"') {
				current += '"';
				i++;
			} else {
				inQuotes = !inQuotes;
			}
		} else if (ch === "," && !inQuotes) {
			cells.push(current.trim());
			current = "";
		} else {
			current += ch;
		}
	}
	cells.push(current.trim());
	return cells;
}

export function parseGformCsv(
	csvText: string,
	sourceType: z.infer<typeof gformSourceTypeSchema>,
): Array<z.input<typeof gformImportRowSchema>> {
	const lines = csvText
		.replace(/\r\n/g, "\n")
		.replace(/\r/g, "\n")
		.split("\n")
		.filter((line) => line.trim().length > 0);
	if (lines.length < 2) return [];
	const header = parseCsvLine(lines[0] ?? "").map((h) => h.toLowerCase());
	const col = (names: string[]) =>
		names.map((n) => header.indexOf(n)).find((idx) => idx >= 0) ?? -1;
	const respondentIdx = col([
		"respondent_id",
		"respondent_key",
		"responden",
		"email",
	]);
	const roleIdx = col(["respondent_role", "role", "peran"]);
	const targetIdx = col(["target_nim", "nim_target", "nim"]);
	const buildingIdx = col(["building_code", "gedung"]);
	const commentIdx = col(["comment", "komentar", "feedback"]);
	const questionCount = sourceType === "SR_MABA" ? 20 : 10;
	const qIndices = Array.from({ length: questionCount }, (_, idx) =>
		col([`q${idx + 1}`, `p${idx + 1}`]),
	);

	return lines.slice(1).map((line, index) => {
		const cells = parseCsvLine(line);
		const rawRole = (cells[roleIdx] ?? "").toUpperCase();
		const role = (
			["SR", "MABA", "ASUS", "DITMAWA"].includes(rawRole)
				? rawRole
				: sourceType === "SR_MABA"
					? "MABA"
					: "ASUS"
		) as "SR" | "MABA" | "ASUS" | "DITMAWA";
		const answers = qIndices
			.map((idx) => (idx >= 0 ? Number(cells[idx]) : Number.NaN))
			.filter((n) => Number.isFinite(n));
		const comment = commentIdx >= 0 ? (cells[commentIdx] ?? "").trim() : "";
		const buildingCode =
			buildingIdx >= 0 ? (cells[buildingIdx] ?? "").trim() : "";
		return {
			rowNumber: index + 2,
			respondentKey: cells[respondentIdx] ?? "",
			respondentRole: role,
			targetNim: cells[targetIdx] ?? "",
			buildingCode: buildingCode || null,
			answers,
			comment: comment || null,
		};
	});
}
