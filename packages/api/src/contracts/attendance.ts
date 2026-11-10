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
		organizationContext: z.enum(["SR", "COMMITTEE"]).optional(),
		committeeId: z.uuid().nullable().optional(),
		session: sessionConfigSchema,
	})
	.strict()
	.refine(
		(input) =>
			(input.organizationContext ?? "SR") === "SR"
				? input.committeeId == null
				: Boolean(input.committeeId) &&
					!input.rosterCriteria.allSr &&
					!input.rosterCriteria.inti &&
					!input.rosterCriteria.kadep &&
					input.rosterCriteria.departments.length === 0,
		{ message: "EVENT_ORGANIZATION_CRITERIA_INVALID" },
	)
	.refine((input) => new Date(input.endsAt) > new Date(input.startsAt), {
		message: "Event end must follow start",
	});
export const eventIdSchema = z.object({ eventId: z.uuid() }).strict();
export const exportCsvSchema = eventIdSchema.extend({
	// Snapshot keys must match exactly, including historical spacing.
	division: z.string().max(150).optional(),
	position: z.string().max(50).optional(),
	participantType: z.enum(["ALL", "COMMITTEE", "GUEST"]).optional(),
	search: z.string().trim().max(150).optional(),
});
export const eventMetadataSchema = eventIdSchema.extend({
	title: z.string().trim().min(1).max(200),
	description: z.string().max(5000),
});
export type EventDraft = z.infer<typeof eventDraftSchema>;

export const checkInSchema = z
	.object({
		qrToken: z.string().min(1).max(256),
		location: z
			.object({
				latitude: z.number().finite().min(-90).max(90),
				longitude: z.number().finite().min(-180).max(180),
				accuracyMeters: z.number().finite().positive(),
			})
			.strict(),
	})
	.strict();
export type CheckInInput = z.infer<typeof checkInSchema>;

const reasonSchema = z.string().trim().min(1).max(2000);
export const visibilitySchema = z.enum(["VISIBLE", "HIDDEN", "ARCHIVED"]);
export const eventListSchema = z
	.object({
		visibility: z
			.union([visibilitySchema, z.literal("NON_ARCHIVED")])
			.default("NON_ARCHIVED"),
	})
	.strict()
	.default({ visibility: "NON_ARCHIVED" });
export type EventListInput = z.infer<typeof eventListSchema>;
export const eventVisibilitySchema = eventIdSchema.extend({
	action: z.enum(["HIDE", "UNHIDE", "ARCHIVE", "RESTORE"]),
	reason: reasonSchema,
});
export type VisibilityAction = z.infer<typeof eventVisibilitySchema>["action"];
export type EventVisibilityInput = z.infer<typeof eventVisibilitySchema>;
export const deleteDraftSchema = eventIdSchema.extend({ reason: reasonSchema });
export type DeleteDraftInput = z.infer<typeof deleteDraftSchema>;
export const advancedEventEditSchema = z.discriminatedUnion("mode", [
	eventIdSchema.extend({
		mode: z.literal("FULL"),
		reason: reasonSchema,
		draft: eventDraftSchema,
	}),
	eventMetadataSchema.extend({
		mode: z.literal("LIMITED"),
		reason: reasonSchema,
		endsAt: z.iso.datetime({ offset: true }).optional(),
	}),
]);
export type AdvancedEventEdit = z.infer<typeof advancedEventEditSchema>;
const attendanceTimeSchema = z.iso.datetime({ offset: true });
export const manualInsertSchema = eventIdSchema.extend({
	userId: z.string().min(1).max(128),
	attendanceAt: attendanceTimeSchema.optional(),
	reason: reasonSchema,
});
export const manualCorrectSchema = z
	.object({
		attendanceId: z.uuid(),
		attendanceAt: attendanceTimeSchema,
		reason: reasonSchema,
	})
	.strict();
export const auditHistorySchema = eventIdSchema.extend({
	userId: z.string().min(1).max(128),
	limit: z.number().int().min(1).max(100).default(50),
	offset: z.number().int().min(0).max(1_000_000).default(0),
});
export const ownHistorySchema = z
	.object({
		limit: z.number().int().min(1).max(100).default(25),
		offset: z.number().int().min(0).max(1_000_000).default(0),
	})
	.strict()
	.default({ limit: 25, offset: 0 });

export const administrativeHistorySchema = z
	.object({
		limit: z.number().int().min(1).max(50).default(20),
		offset: z.number().int().min(0).max(1_000_000).default(0),
	})
	.strict();
export const eventAuditHistorySchema = administrativeHistorySchema.extend({
	eventId: z.uuid(),
});
