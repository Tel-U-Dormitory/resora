import { getActiveSr } from "@resora/auth/sr-access";
import { user } from "@resora/db/schema/auth";
import {
	buildings,
	departments,
	positions,
	srProfiles,
} from "@resora/db/schema/identity";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";

import { protectedProcedure, publicProcedure, router } from "../../index";
import {
	accountReferences,
	createAccount,
	listAccounts,
} from "./account-admin";
import {
	createAccountSchema,
	listAccountsSchema,
} from "./account-admin.schema";
import {
	canManageInternalAttendanceManually,
	canManageInternalEvent,
	canOperateGeneralActivity,
	hasSuperadminPrivilege,
} from "./identity-policy";

export const identityRouter = router({
	listAccounts: protectedProcedure
		.input(listAccountsSchema)
		.query(({ ctx, input }) => listAccounts(ctx.db, ctx.identity, input)),
	accountReferences: protectedProcedure.query(({ ctx }) =>
		accountReferences(ctx.db, ctx.identity),
	),
	createAccount: protectedProcedure
		.input(createAccountSchema)
		.mutation(({ ctx, input }) =>
			createAccount(ctx.db, ctx.identity, ctx.authConfig, input),
		),
	profile: protectedProcedure.query(async ({ ctx }) => {
		const [profile] = await ctx.db
			.select({
				name: user.name,
				email: user.email,
				department: departments.name,
				position: positions.name,
				building: buildings.name,
			})
			.from(user)
			.innerJoin(srProfiles, eq(srProfiles.userId, user.id))
			.leftJoin(departments, eq(departments.code, srProfiles.departmentCode))
			.leftJoin(positions, eq(positions.code, srProfiles.positionCode))
			.leftJoin(buildings, eq(buildings.id, srProfiles.buildingId))
			.where(eq(user.id, ctx.session.user.id));
		if (!profile)
			throw new TRPCError({
				code: "UNAUTHORIZED",
				message: "Authentication required",
			});
		return {
			...profile,
			nim: ctx.identity.nim,
			isActive: ctx.identity.isActive,
		};
	}),
	session: publicProcedure.query(async ({ ctx }) => {
		if (!ctx.session) return null;
		const identity = await getActiveSr(ctx.db, ctx.session.user.id);
		if (!identity) return null;
		return {
			userId: identity.userId,
			nim: identity.nim,
			mustChangePassword: identity.mustChangePassword,
			name: ctx.session.user.name,
			canManageInternalEvents: canManageInternalEvent(identity),
			canManageInternalAttendanceManually:
				canManageInternalAttendanceManually(identity),
			canOperateGeneralActivity: canOperateGeneralActivity(identity),
			isSuperadmin: hasSuperadminPrivilege(identity),
		};
	}),
});
