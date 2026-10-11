import { getActiveSr } from "@resora/auth/sr-access";

import { publicProcedure, router } from "../../index";

export const identityRouter = router({
	session: publicProcedure.query(async ({ ctx }) => {
		if (!ctx.session) return null;
		const identity = await getActiveSr(ctx.db, ctx.session.user.id);
		if (!identity) return null;
		return { ...identity, name: ctx.session.user.name };
	}),
});
