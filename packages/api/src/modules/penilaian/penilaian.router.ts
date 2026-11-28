import { z } from "zod";
import { protectedProcedure, router } from "../../index";
import {
	configurePeriodEventSchema,
	confirmGformImportSchema,
	correctEvaluationScoreSchema,
	createEvaluationPeriodSchema,
	decidePointTransactionSchema,
	evaluationAuditHistorySchema,
	evaluationDashboardSummarySchema,
	evaluationPeriodIdSchema,
	eventEvaluationTaskSchema,
	finalizeEvaluationPeriodSchema,
	listAttendancePointsSchema,
	listDepartmentTasksSchema,
	listGformImportsSchema,
	listPointTransactionsSchema,
	memberDetailSchema,
	openEvaluationRevisionSchema,
	ownRecapSchema,
	previewGformImportSchema,
	proposePointTransactionSchema,
	recapFilterSchema,
	recordAttendanceFallbackSchema,
	setActiveEvaluationPeriodSchema,
	submitDepartmentEvaluationSchema,
	submitEventEvaluationSchema,
	updateEvaluationPeriodConfigSchema,
} from "./penilaian.contracts";
import {
	exportEvaluationRecapCsv,
	getEvaluationAnalytics,
	getEvaluationDashboardSummary,
	getEvaluationMemberDetail,
	getEvaluationRecapList,
	getOwnEvaluationRecap,
	listEvaluationAudits,
} from "./penilaian-analytics.service";
import {
	confirmGformImport,
	listGformImports,
	previewGformImport,
} from "./penilaian-import.service";
import {
	createEvaluationPeriod,
	getPenilaianCapabilities,
	listEvaluationPeriods,
	listSrTenureOptions,
	setActiveEvaluationPeriod,
	updateEvaluationPeriodConfig,
} from "./penilaian-periods.service";
import {
	decidePointTransaction,
	listAttendancePointsSummary,
	listPointProposalTargets,
	listPointTransactions,
	proposePointTransaction,
	recordAttendanceFallback,
} from "./penilaian-points.service";
import {
	correctEvaluationScore,
	finalizeEvaluationPeriod,
	getPeriodCompletenessStatus,
	listCorrectableScores,
	openEvaluationRevision,
} from "./penilaian-recap.service";
import {
	configurePeriodEvent,
	getEventEvaluationTaskForEvent,
	listCandidateEventsForPeriod,
	listMyDepartmentEvaluationTasks,
	listMyEventEvaluationTasks,
	submitDepartmentEvaluation,
	submitEventEvaluation,
} from "./penilaian-scoring.service";

export const penilaianRouter = router({
	myCapabilities: protectedProcedure
		.input(z.void())
		.query(({ ctx }) => getPenilaianCapabilities(ctx.db, ctx.identity)),
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
	eventEvaluationTask: protectedProcedure
		.input(eventEvaluationTaskSchema)
		.query(({ ctx, input }) =>
			getEventEvaluationTaskForEvent(ctx.db, ctx.identity, input),
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
	listPointProposalTargets: protectedProcedure
		.input(evaluationPeriodIdSchema)
		.query(({ ctx, input }) =>
			listPointProposalTargets(ctx.db, ctx.identity, input),
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
	completenessStatus: protectedProcedure
		.input(evaluationPeriodIdSchema)
		.query(({ ctx, input }) =>
			getPeriodCompletenessStatus(ctx.db, ctx.identity, input),
		),
	finalizePeriod: protectedProcedure
		.input(finalizeEvaluationPeriodSchema)
		.mutation(({ ctx, input }) =>
			finalizeEvaluationPeriod(ctx.db, ctx.identity, input),
		),
	openRevision: protectedProcedure
		.input(openEvaluationRevisionSchema)
		.mutation(({ ctx, input }) =>
			openEvaluationRevision(ctx.db, ctx.identity, input),
		),
	listCorrectableScores: protectedProcedure
		.input(evaluationPeriodIdSchema)
		.query(({ ctx, input }) =>
			listCorrectableScores(ctx.db, ctx.identity, input),
		),
	correctScore: protectedProcedure
		.input(correctEvaluationScoreSchema)
		.mutation(({ ctx, input }) =>
			correctEvaluationScore(ctx.db, ctx.identity, input),
		),
	recapList: protectedProcedure
		.input(recapFilterSchema)
		.query(({ ctx, input }) =>
			getEvaluationRecapList(ctx.db, ctx.identity, input),
		),
	memberDetail: protectedProcedure
		.input(memberDetailSchema)
		.query(({ ctx, input }) =>
			getEvaluationMemberDetail(ctx.db, ctx.identity, input),
		),
	ownRecap: protectedProcedure
		.input(ownRecapSchema)
		.query(({ ctx, input }) =>
			getOwnEvaluationRecap(ctx.db, ctx.identity, input),
		),
	analytics: protectedProcedure
		.input(recapFilterSchema)
		.query(({ ctx, input }) =>
			getEvaluationAnalytics(ctx.db, ctx.identity, input),
		),
	exportRecapCsv: protectedProcedure
		.input(recapFilterSchema)
		.query(({ ctx, input }) =>
			exportEvaluationRecapCsv(ctx.db, ctx.identity, input),
		),
	dashboardSummary: protectedProcedure
		.input(evaluationDashboardSummarySchema)
		.query(({ ctx, input }) =>
			getEvaluationDashboardSummary(ctx.db, ctx.identity, input),
		),
	auditHistory: protectedProcedure
		.input(evaluationAuditHistorySchema)
		.query(({ ctx, input }) =>
			listEvaluationAudits(ctx.db, ctx.identity, input),
		),
});
