import { z } from "zod";
import { protectedProcedure, router } from "../../index";
import {
	broadcastFieldsSchema,
	broadcastIdSchema,
	listBroadcastsSchema,
	updateBroadcastSchema,
} from "./broadcast.schema";
import {
	archiveBroadcast,
	broadcastDetail,
	createBroadcast,
	latestBroadcasts,
	listBroadcasts,
	updateBroadcast,
} from "./broadcast.service";

export const broadcastRouter = router({
	list: protectedProcedure
		.input(listBroadcastsSchema)
		.query(({ ctx, input }) => listBroadcasts(ctx.db, ctx.identity, input)),
	latest: protectedProcedure
		.input(z.void())
		.query(({ ctx }) => latestBroadcasts(ctx.db, ctx.identity)),
	detail: protectedProcedure
		.input(broadcastIdSchema)
		.query(({ ctx, input }) =>
			broadcastDetail(ctx.db, ctx.identity, input.broadcastId),
		),
	create: protectedProcedure
		.input(broadcastFieldsSchema)
		.mutation(({ ctx, input }) => createBroadcast(ctx.db, ctx.identity, input)),
	update: protectedProcedure
		.input(updateBroadcastSchema)
		.mutation(({ ctx, input: { broadcastId, ...fields } }) =>
			updateBroadcast(ctx.db, ctx.identity, broadcastId, fields),
		),
	archive: protectedProcedure
		.input(broadcastIdSchema)
		.mutation(({ ctx, input }) =>
			archiveBroadcast(ctx.db, ctx.identity, input.broadcastId),
		),
});
