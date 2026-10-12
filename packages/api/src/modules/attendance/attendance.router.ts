import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../../index";
import {
	checkInSchema,
	eventDraftSchema,
	eventIdSchema,
	eventMetadataSchema,
} from "./attendance.schema";
import * as attendance from "./attendance.service";
import { checkIn } from "./check-in";

export const attendanceRouter = router({
	checkIn: protectedProcedure
		.input(checkInSchema)
		.mutation(({ ctx, input }) => {
			if (!ctx.qrSigningSecret)
				throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
			return checkIn(ctx.db, ctx.identity, ctx.qrSigningSecret, input);
		}),
	list: protectedProcedure.query(({ ctx }) =>
		attendance.listEvents(ctx.db, ctx.identity),
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
