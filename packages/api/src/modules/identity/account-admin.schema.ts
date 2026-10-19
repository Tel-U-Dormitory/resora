import { z } from "zod";

export const listAccountsSchema = z
	.object({
		search: z.string().trim().max(100).default(""),
		departmentCode: z.string().trim().min(1).max(30).optional(),
		isActive: z.boolean().optional(),
		page: z.number().int().min(1).max(1000000).default(1),
		pageSize: z.number().int().min(1).max(50).default(20),
	})
	.strict();

export const createAccountSchema = z
	.object({
		name: z.string().trim().min(1).max(200),
		periodId: z.uuid().optional(),
		nim: z
			.string()
			.trim()
			.min(3)
			.max(30)
			.regex(/^[a-zA-Z0-9_.]+$/),
		email: z
			.string()
			.trim()
			.pipe(z.email())
			.transform((value) => value.toLowerCase()),
		departmentCode: z.string().trim().min(1).max(30),
		positionCode: z.string().trim().min(1).max(30),
		buildingCode: z.string().trim().min(1).max(30),
	})
	.strict();

export const resetAccountPasswordSchema = z
	.object({
		userId: z.string().min(1).max(200),
	})
	.strict();
