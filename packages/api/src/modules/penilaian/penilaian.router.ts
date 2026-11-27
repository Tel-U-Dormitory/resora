import { z } from "zod";
import { protectedProcedure, router } from "../../index";
import {
	createEvaluationPeriodSchema,
	setActiveEvaluationPeriodSchema,
	updateEvaluationPeriodConfigSchema,
} from "./penilaian.contracts";
import {
	createEvaluationPeriod,
	listEvaluationPeriods,
	listSrTenureOptions,
	setActiveEvaluationPeriod,
	updateEvaluationPeriodConfig,
} from "./penilaian-periods.service";

export const penilaianRouter = router({
	srTenureOptions: protectedProcedure
		.input(z.void())
		.query(({ ctx }) => listSrTenureOptions(ctx.db, ctx.identity)),
	listPeriods: protectedProcedure
		.input(z.void())
		.query(({ ctx }) => listEvaluationPeriods(ctx.db, ctx.identity)),
	createPeriod: protectedProcedure
		.input(createEvaluationPeriodSchema)
		.mutation(({ ctx, input }) =>
			createEvaluationPeriod(ctx.db, ctx.identity, input),
		),
	updatePeriodConfig: protectedProcedure
		.input(updateEvaluationPeriodConfigSchema)
		.mutation(({ ctx, input }) =>
			updateEvaluationPeriodConfig(ctx.db, ctx.identity, input),
		),
	setActivePeriod: protectedProcedure
		.input(setActiveEvaluationPeriodSchema)
		.mutation(({ ctx, input }) =>
			setActiveEvaluationPeriod(ctx.db, ctx.identity, input),
		),
});
