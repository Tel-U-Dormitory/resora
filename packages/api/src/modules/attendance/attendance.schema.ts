import { officialDepartments } from "@resora/db/organization";
import { z } from "zod";

const ids = z.array(z.string().min(1).max(128)).max(5000).default([]);
export const rosterSchema = z
	.object({
		allSr: z.boolean().default(false),
		departments: z
			.array(z.enum(officialDepartments.map((row) => row.code)))
			.max(8)
			.default([]),
		inti: z.boolean().default(false),
		kadep: z.boolean().default(false),
		individuals: ids,
		include: ids,
		exclude: ids,
	})
	.strict();
export const sessionConfigSchema = z
	.object({
		centerLat: z.number().finite().min(-90).max(90),
		centerLng: z.number().finite().min(-180).max(180),
		geofenceRadiusM: z.number().int().positive().max(2147483647).default(20),
		lateGraceMinutes: z
			.number()
			.int()
			.nonnegative()
			.max(2147483647)
			.default(15),
		qrTtlMinutes: z.number().int().positive().max(2147483647).default(360),
	})
	.strict();
export const eventDraftSchema = z
	.object({
		title: z.string().trim().min(1).max(200),
		description: z.string().max(5000).default(""),
		startsAt: z.iso.datetime({ offset: true }),
		endsAt: z.iso.datetime({ offset: true }),
		rosterCriteria: rosterSchema,
		session: sessionConfigSchema,
	})
	.strict()
	.refine((input) => new Date(input.endsAt) > new Date(input.startsAt), {
		message: "Event end must follow start",
	});
export const eventIdSchema = z.object({ eventId: z.uuid() }).strict();
export const eventMetadataSchema = eventIdSchema.extend({
	title: z.string().trim().min(1).max(200),
	description: z.string().max(5000),
});
export type EventDraft = z.infer<typeof eventDraftSchema>;
