import { committeePositionCodes } from "@resora/db/schema/committee";
import { z } from "zod";

const name = z.string().trim().min(1).max(150);
export const committeeIdSchema = z.object({ committeeId: z.uuid() }).strict();
export const committeeFieldsSchema = z
	.object({
		name,
		description: z.string().trim().max(2000).default(""),
	})
	.strict();
export const updateCommitteeSchema = committeeFieldsSchema.extend({
	committeeId: z.uuid(),
});
export const listCommitteesSchema = z
	.object({
		search: z.string().trim().max(150).default(""),
		limit: z.number().int().min(1).max(50).default(20),
		offset: z.number().int().min(0).max(100000).default(0),
	})
	.strict();
export const divisionSchema = committeeIdSchema.extend({ name });
export const divisionIdSchema = committeeIdSchema.extend({
	divisionId: z.uuid(),
});
export const updateDivisionSchema = divisionIdSchema.extend({ name });
export const memberIdSchema = committeeIdSchema.extend({
	userId: z.string().min(1).max(128),
});
export const memberSchema = memberIdSchema.extend({
	divisionId: z.uuid(),
	positionCode: z.enum(committeePositionCodes),
});
export const candidateSchema = committeeIdSchema.extend({
	search: z.string().trim().min(2).max(100),
});
