import { z } from "zod";

const date = z.iso.date();

function containsForbiddenControls(value: string) {
	return [...value].some((character) => {
		const codePoint = character.codePointAt(0) ?? 0;
		return (
			(codePoint < 32 && ![9, 10, 13].includes(codePoint)) || codePoint === 127
		);
	});
}

function plainText(minimum: number, maximum: number, multiline = false) {
	return z
		.string()
		.trim()
		.min(minimum)
		.max(maximum)
		.refine(
			(value) =>
				!containsForbiddenControls(value) &&
				(multiline || !/[\r\n\t]/.test(value)),
			{ message: "VIOLATIONS_TEXT_INVALID" },
		);
}

function jakartaToday() {
	const parts = new Intl.DateTimeFormat("en-CA", {
		timeZone: "Asia/Jakarta",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).formatToParts(new Date());
	const value = Object.fromEntries(
		parts.map(({ type, value }) => [type, value]),
	);
	return `${value.year}-${value.month}-${value.day}`;
}

export const violationsListSchema = z
	.object({
		view: z.enum(["ACTIVE", "DELETED"]).default("ACTIVE"),
		query: plainText(1, 160).optional(),
		buildingId: z.uuid().optional(),
		dateFrom: date.optional(),
		dateTo: date.optional(),
		limit: z.number().int().min(1).max(50).default(20),
		offset: z.number().int().min(0).max(1_000_000).default(0),
	})
	.strict()
	.refine(
		(value) =>
			!value.dateFrom || !value.dateTo || value.dateFrom <= value.dateTo,
		{
			message: "VIOLATIONS_DATE_RANGE_INVALID",
		},
	)
	.refine(
		(value) =>
			value.view !== "DELETED" ||
			(!value.query && !value.dateFrom && !value.dateTo),
		{
			message: "VIOLATIONS_DELETED_VIEW_FILTERS_UNSUPPORTED",
		},
	);

export const violationIdSchema = z.object({ reportId: z.uuid() }).strict();
export const violationsHistorySchema = z
	.object({ reportId: z.uuid() })
	.strict();

export const violationDeleteSchema = z
	.object({
		reportId: z.uuid(),
		reason: plainText(1, 1000),
	})
	.strict();

export const violationUploadIntentSchema = z
	.object({ contentType: z.enum(["image/jpeg", "image/png", "image/webp"]) })
	.strict();
export const violationBuildingOptionsSchema = z.object({}).strict();

export const createViolationSchema = z
	.object({
		studentName: plainText(1, 200),
		studentNim: plainText(1, 40),
		incidentDate: date,
		description: plainText(1, 5000, true),
		uploadIntentId: z.uuid(),
		idempotencyKey: z.uuid(),
		confirmedBuildingId: z.uuid(),
	})
	.strict()
	.refine((value) => value.incidentDate <= jakartaToday(), {
		message: "VIOLATIONS_FUTURE_DATE_NOT_ALLOWED",
	});

export const updateViolationSchema = z
	.object({
		reportId: z.uuid(),
		expectedVersion: z.number().int().min(1),
		reason: plainText(1, 1000),
		studentName: plainText(1, 200).optional(),
		studentNim: plainText(1, 40).optional(),
		incidentDate: date.optional(),
		description: plainText(1, 5000, true).optional(),
		uploadIntentId: z.uuid().optional(),
	})
	.strict()
	.refine(
		(value) =>
			value.studentName !== undefined ||
			value.studentNim !== undefined ||
			value.incidentDate !== undefined ||
			value.description !== undefined ||
			value.uploadIntentId !== undefined,
		{ message: "VIOLATION_UPDATE_EMPTY" },
	)
	.refine(
		(value) => !value.incidentDate || value.incidentDate <= jakartaToday(),
		{ message: "VIOLATIONS_FUTURE_DATE_NOT_ALLOWED" },
	);

export const violationsStatisticsSchema = z
	.object({
		dateFrom: date,
		dateTo: date,
		buildingId: z.uuid().optional(),
	})
	.strict()
	.refine((value) => value.dateFrom <= value.dateTo, {
		message: "VIOLATIONS_DATE_RANGE_INVALID",
	});
