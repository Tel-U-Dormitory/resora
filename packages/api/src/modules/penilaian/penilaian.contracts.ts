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
