import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../../index";
import {
	advancedEventEditSchema,
	auditHistorySchema,
	checkInSchema,
	deleteDraftSchema,
	eventDraftSchema,
	eventIdSchema,
	eventListSchema,
	eventMetadataSchema,
	eventVisibilitySchema,
	manualCorrectSchema,
	manualInsertSchema,
	ownHistorySchema,
} from "./attendance.schema";
import * as attendance from "./attendance.service";
import { checkIn } from "./check-in";
import { manualCorrect, manualInsert } from "./manual-attendance";
import { auditHistory, exportCsv, ownHistory, recap } from "./reporting";

export const attendanceRouter = router({
	setVisibility: protectedProcedure
		.input(eventVisibilitySchema)
		.mutation(({ ctx, input }) =>
			attendance.setEventVisibility(ctx.db, ctx.identity, input),
		),
	deleteDraft: protectedProcedure
		.input(deleteDraftSchema)
		.mutation(({ ctx, input }) =>
			attendance.deleteEventDraft(ctx.db, ctx.identity, input),
		),
	advancedEdit: protectedProcedure
		.input(advancedEventEditSchema)
		.mutation(({ ctx, input }) =>
			attendance.advancedEditEvent(ctx.db, ctx.identity, input),
		),
	manualInsert: protectedProcedure
		.input(manualInsertSchema)
		.mutation(({ ctx, input }) => manualInsert(ctx.db, ctx.identity, input)),
	manualCorrect: protectedProcedure
		.input(manualCorrectSchema)
		.mutation(({ ctx, input }) => manualCorrect(ctx.db, ctx.identity, input)),
	auditHistory: protectedProcedure
		.input(auditHistorySchema)
		.query(({ ctx, input }) => auditHistory(ctx.db, ctx.identity, input)),
	recap: protectedProcedure
		.input(eventIdSchema)
		.query(({ ctx, input }) => recap(ctx.db, ctx.identity, input.eventId)),
	exportCsv: protectedProcedure
		.input(eventIdSchema)
		.query(({ ctx, input }) => exportCsv(ctx.db, ctx.identity, input.eventId)),
	ownHistory: protectedProcedure
		.input(ownHistorySchema)
		.query(({ ctx, input }) => ownHistory(ctx.db, ctx.identity, input)),
	checkIn: protectedProcedure
		.input(checkInSchema)
		.mutation(({ ctx, input }) => {
			if (!ctx.qrSigningSecret)
				throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
			return checkIn(ctx.db, ctx.identity, ctx.qrSigningSecret, input);
		}),
	list: protectedProcedure
		.input(eventListSchema)
		.query(({ ctx, input }) =>
			attendance.listEvents(ctx.db, ctx.identity, input),
		),
	detail: protectedProcedure
		.input(eventIdSchema)
		.query(({ ctx, input }) =>
			attendance.getEvent(ctx.db, ctx.identity, input.eventId),
		),
	directory: protectedProcedure.query(({ ctx }) =>
		attendance.getRosterDirectory(ctx.db, ctx.identity),
	),
	create: protectedProcedure
		.input(eventDraftSchema)
		.mutation(({ ctx, input }) =>
			attendance.createEvent(ctx.db, ctx.identity, input),
		),
	editDraft: protectedProcedure
		.input(eventIdSchema.extend({ draft: eventDraftSchema }))
		.mutation(({ ctx, input }) =>
			attendance.editDraft(ctx.db, ctx.identity, input.eventId, input.draft),
		),
	editMetadata: protectedProcedure
		.input(eventMetadataSchema)
		.mutation(({ ctx, input }) =>
			attendance.editMetadata(ctx.db, ctx.identity, input.eventId, {
				title: input.title,
				description: input.description,
			}),
		),
	preview: protectedProcedure
		.input(eventIdSchema)
		.query(({ ctx, input }) =>
			attendance.previewRoster(ctx.db, ctx.identity, input.eventId),
		),
	publish: protectedProcedure
		.input(eventIdSchema)
		.mutation(({ ctx, input }) =>
			attendance.publishEvent(ctx.db, ctx.identity, input.eventId),
		),
	activate: protectedProcedure
		.input(eventIdSchema)
		.mutation(({ ctx, input }) =>
			attendance.activateSession(ctx.db, ctx.identity, input.eventId),
		),
	revokeQr: protectedProcedure
		.input(eventIdSchema)
		.mutation(({ ctx, input }) =>
			attendance.changeQr(ctx.db, ctx.identity, input.eventId, "revoke"),
		),
	reissueQr: protectedProcedure
		.input(eventIdSchema)
		.mutation(({ ctx, input }) =>
			attendance.changeQr(ctx.db, ctx.identity, input.eventId, "reissue"),
		),
	close: protectedProcedure
		.input(eventIdSchema)
		.mutation(({ ctx, input }) =>
			attendance.closeEvent(ctx.db, ctx.identity, input.eventId),
		),
	qr: protectedProcedure.input(eventIdSchema).query(({ ctx, input }) => {
		if (!ctx.qrSigningSecret)
			throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
		return attendance.getQr(
			ctx.db,
			ctx.identity,
			input.eventId,
			ctx.qrSigningSecret,
		);
	}),
});
