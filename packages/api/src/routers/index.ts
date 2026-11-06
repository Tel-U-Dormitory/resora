import { protectedProcedure, publicProcedure, router } from "../index";
import { broadcastRouter } from "../modules/broadcast/broadcast.public";
import { committeeRouter } from "../modules/committee/committee.public";
import { identityRouter } from "../modules/identity/identity-transport.public";
import { attendanceRouter } from "../transport/attendance.router";

export const appRouter = router({
	identity: identityRouter,
	attendance: attendanceRouter,
	broadcast: broadcastRouter,
	committee: committeeRouter,
	healthCheck: publicProcedure.query(() => {
		return "OK";
	}),
	privateData: protectedProcedure.query(({ ctx }) => {
		return {
			message: "This is private",
			user: {
				id: ctx.identity.userId,
				name: ctx.session.user.name,
				...(ctx.identity.actor === "SR"
					? { actor: "SR" as const, nim: ctx.identity.nim }
					: {
							actor: "SYSTEM_ADMIN" as const,
							username: ctx.identity.username,
						}),
			},
		};
	}),
});
export type AppRouter = typeof appRouter;
