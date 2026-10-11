import { protectedProcedure, publicProcedure, router } from "../index";
import { identityRouter } from "../modules/identity/identity.router";

export const appRouter = router({
	identity: identityRouter,
	healthCheck: publicProcedure.query(() => {
		return "OK";
	}),
	privateData: protectedProcedure.query(({ ctx }) => {
		return {
			message: "This is private",
			user: {
				id: ctx.identity.userId,
				name: ctx.session.user.name,
				nim: ctx.identity.nim,
			},
		};
	}),
});
export type AppRouter = typeof appRouter;
