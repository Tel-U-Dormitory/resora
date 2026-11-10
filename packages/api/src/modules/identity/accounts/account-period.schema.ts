import { z } from "zod";

const calendarDate = z.iso.date();
export const createPeriodSchema = z
	.object({
		name: z.string().trim().min(1).max(100),
		startsOn: calendarDate,
		endsOn: calendarDate,
	})
	.strict()
	.refine((data) => data.endsOn >= data.startsOn, {
		message: "INVALID_PERIOD_DATES",
	});
export const extendPeriodSchema = z
	.object({ periodId: z.uuid(), endsOn: calendarDate })
	.strict();
export const assignPeriodSchema = z
	.object({
		periodId: z.uuid(),
		userIds: z.array(z.string().min(1).max(200)).min(1).max(200),
	})
	.strict();
