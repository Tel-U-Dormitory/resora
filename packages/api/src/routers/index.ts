import { protectedProcedure, publicProcedure, router } from "../index";
import { attendanceRouter } from "../modules/attendance/attendance.router";
import { identityRouter } from "../modules/identity/identity.router";

export const appRouter = router({
	identity: identityRouter,
	attendance: attendanceRouter,
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
