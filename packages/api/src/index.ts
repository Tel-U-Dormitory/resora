import { getActiveSr } from "@resora/auth/sr-access";
import { initTRPC, TRPCError } from "@trpc/server";

import type { Context } from "./context";

export const t = initTRPC.context<Context>().create({
	errorFormatter({ shape, error }) {
		return {
			...shape,
			message:
				error.code === "INTERNAL_SERVER_ERROR"
					? "Request could not be completed"
					: shape.message,
			data: { ...shape.data, stack: undefined },
		};
	},
});

export const router = t.router;

export const publicProcedure = t.procedure;

export const sessionProcedure = t.procedure.use(async ({ ctx, next }) => {
	const identity = ctx.session
		? await getActiveSr(ctx.db, ctx.session.user.id)
		: null;
	if (!ctx.session || !identity) {
		throw new TRPCError({
			code: "UNAUTHORIZED",
			message: "Authentication required",
		});
	}
	return next({
		ctx: {
			...ctx,
			session: ctx.session,
			identity,
		},
	});
});

export const protectedProcedure = sessionProcedure.use(({ ctx, next }) => {
	if (ctx.identity.mustChangePassword) {
		throw new TRPCError({
			code: "FORBIDDEN",
			message: "PASSWORD_CHANGE_REQUIRED",
		});
	}
	return next();
});
