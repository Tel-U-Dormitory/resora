import { protectedProcedure, router } from "../../index";
import {
	createViolationSchema,
	updateViolationSchema,
	violationBuildingOptionsSchema,
	violationDeleteSchema,
	violationIdSchema,
	violationsHistorySchema,
	violationsListSchema,
	violationsStatisticsSchema,
	violationUploadIntentSchema,
} from "./violations.contracts";
import {
	createViolation,
	createViolationUploadIntent,
	deleteViolation,
	listViolations,
	updateViolation,
	violationBuildingOptions,
	violationDetail,
	violationHistory,
	violationsStatistics,
} from "./violations.service";

export const violationsRouter = router({
	activeBuildings: protectedProcedure
		.input(violationBuildingOptionsSchema)
		.query(({ ctx }) => violationBuildingOptions(ctx.db, ctx.identity)),
	createUploadIntent: protectedProcedure
		.input(violationUploadIntentSchema)
		.mutation(({ ctx, input }) =>
			createViolationUploadIntent(ctx.db, ctx.storage, ctx.identity, input),
		),
	create: protectedProcedure
		.input(createViolationSchema)
		.mutation(({ ctx, input }) =>
			createViolation(ctx.db, ctx.storage, ctx.identity, input),
		),
	list: protectedProcedure
		.input(violationsListSchema)
		.query(({ ctx, input }) => listViolations(ctx.db, ctx.identity, input)),
	detail: protectedProcedure
		.input(violationIdSchema)
		.query(({ ctx, input }) =>
			violationDetail(ctx.db, ctx.storage, ctx.identity, input.reportId),
		),
	history: protectedProcedure
		.input(violationsHistorySchema)
		.query(({ ctx, input }) => violationHistory(ctx.db, ctx.identity, input)),
	remove: protectedProcedure
		.input(violationDeleteSchema)
		.mutation(({ ctx, input }) => deleteViolation(ctx.db, ctx.identity, input)),
	update: protectedProcedure
		.input(updateViolationSchema)
		.mutation(({ ctx, input }) =>
			updateViolation(ctx.db, ctx.storage, ctx.identity, input),
		),
	statistics: protectedProcedure
		.input(violationsStatisticsSchema)
		.query(({ ctx, input }) =>
			violationsStatistics(ctx.db, ctx.identity, input),
		),
});
