import { z } from "zod";
import { protectedProcedure, router } from "../../index";
import {
	configurePeriodEventSchema,
	confirmGformImportSchema,
	createEvaluationPeriodSchema,
	decidePointTransactionSchema,
	evaluationPeriodIdSchema,
	listAttendancePointsSchema,
	listDepartmentTasksSchema,
	listGformImportsSchema,
	listPointTransactionsSchema,
	previewGformImportSchema,
	proposePointTransactionSchema,
	recordAttendanceFallbackSchema,
	setActiveEvaluationPeriodSchema,
	submitDepartmentEvaluationSchema,
	submitEventEvaluationSchema,
	updateEvaluationPeriodConfigSchema,
} from "./penilaian.contracts";
import {
	confirmGformImport,
	listGformImports,
	previewGformImport,
} from "./penilaian-import.service";
import {
	createEvaluationPeriod,
	listEvaluationPeriods,
	listSrTenureOptions,
	setActiveEvaluationPeriod,
	updateEvaluationPeriodConfig,
} from "./penilaian-periods.service";
import {
	decidePointTransaction,
	listAttendancePointsSummary,
	listPointTransactions,
	proposePointTransaction,
	recordAttendanceFallback,
} from "./penilaian-points.service";
import {
	configurePeriodEvent,
	listCandidateEventsForPeriod,
	listMyDepartmentEvaluationTasks,
	listMyEventEvaluationTasks,
	submitDepartmentEvaluation,
	submitEventEvaluation,
} from "./penilaian-scoring.service";

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
	candidateEvents: protectedProcedure
		.input(evaluationPeriodIdSchema)
		.query(({ ctx, input }) =>
			listCandidateEventsForPeriod(ctx.db, ctx.identity, input),
		),
	configurePeriodEvent: protectedProcedure
		.input(configurePeriodEventSchema)
		.mutation(({ ctx, input }) =>
			configurePeriodEvent(ctx.db, ctx.identity, input),
		),
	myEventTasks: protectedProcedure
		.input(evaluationPeriodIdSchema)
		.query(({ ctx, input }) =>
			listMyEventEvaluationTasks(ctx.db, ctx.identity, input),
		),
	submitEventScore: protectedProcedure
		.input(submitEventEvaluationSchema)
		.mutation(({ ctx, input }) =>
			submitEventEvaluation(ctx.db, ctx.identity, input),
		),
	myDepartmentTasks: protectedProcedure
		.input(listDepartmentTasksSchema)
		.query(({ ctx, input }) =>
			listMyDepartmentEvaluationTasks(ctx.db, ctx.identity, input),
		),
	submitDepartmentScore: protectedProcedure
		.input(submitDepartmentEvaluationSchema)
		.mutation(({ ctx, input }) =>
			submitDepartmentEvaluation(ctx.db, ctx.identity, input),
		),
	previewGformImport: protectedProcedure
		.input(previewGformImportSchema)
		.mutation(({ ctx, input }) =>
			previewGformImport(ctx.db, ctx.identity, input),
		),
	confirmGformImport: protectedProcedure
		.input(confirmGformImportSchema)
		.mutation(({ ctx, input }) =>
			confirmGformImport(ctx.db, ctx.identity, input),
		),
	listGformImports: protectedProcedure
		.input(listGformImportsSchema)
		.query(({ ctx, input }) => listGformImports(ctx.db, ctx.identity, input)),
	recordAttendanceFallback: protectedProcedure
		.input(recordAttendanceFallbackSchema)
		.mutation(({ ctx, input }) =>
			recordAttendanceFallback(ctx.db, ctx.identity, input),
		),
	attendancePointsSummary: protectedProcedure
		.input(listAttendancePointsSchema)
		.query(({ ctx, input }) =>
			listAttendancePointsSummary(ctx.db, ctx.identity, input),
		),
	proposePointTransaction: protectedProcedure
		.input(proposePointTransactionSchema)
		.mutation(({ ctx, input }) =>
			proposePointTransaction(ctx.db, ctx.identity, input),
		),
	decidePointTransaction: protectedProcedure
		.input(decidePointTransactionSchema)
		.mutation(({ ctx, input }) =>
			decidePointTransaction(ctx.db, ctx.identity, input),
		),
	listPointTransactions: protectedProcedure
		.input(listPointTransactionsSchema)
		.query(({ ctx, input }) =>
			listPointTransactions(ctx.db, ctx.identity, input),
		),
});
