import { z } from "zod";

const plainText = (max: number) =>
	z
		.string()
		.trim()
		.min(1)
		.max(max)
		.refine(
			(value) => !/<\/?[a-z][^>]*>/i.test(value),
			"BROADCAST_PLAIN_TEXT_REQUIRED",
		);
const linkUrl = z
	.string()
	.trim()
	.max(2048)
	.url()
	.refine((value) => {
		return /^https?:\/\//i.test(value) && !/\s/.test(value);
	}, "BROADCAST_LINK_INVALID")
	.nullable()
	.optional();

export const broadcastIdSchema = z.object({ broadcastId: z.uuid() }).strict();
export const listBroadcastsSchema = z
	.object({
		view: z.enum(["ACTIVE", "HISTORY"]).default("ACTIVE"),
		limit: z.number().int().min(1).max(50).default(10),
		offset: z.number().int().min(0).max(1_000_000).default(0),
	})
	.strict();
export const broadcastFieldsSchema = z
	.object({
		title: plainText(150),
		content: plainText(5000),
		linkUrl,
		expiresAt: z.iso.datetime({ offset: true }).optional(),
	})
	.strict();
export const updateBroadcastSchema = broadcastFieldsSchema.extend({
	broadcastId: z.uuid(),
});
