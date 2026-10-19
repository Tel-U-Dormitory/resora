import {
	getActiveIdentity,
	requiresPasswordChange,
} from "@resora/auth/sr-access";
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
	resetAccountPassword,
} from "./account-admin";
import {
	createAccountSchema,
	listAccountsSchema,
	resetAccountPasswordSchema,
} from "./account-admin.schema";
import {
	canManageInternalAttendanceManually,
	canManageInternalEvent,
	canOperateGeneralActivity,
	hasSuperadminPrivilege,
} from "./identity-policy";

export const identityRouter = router({
	resetAccountPassword: protectedProcedure
		.input(resetAccountPasswordSchema)
		.mutation(({ ctx, input }) =>
			resetAccountPassword(ctx.db, ctx.identity, ctx.authConfig, input),
		),
	accountSnapshot: protectedProcedure.query(({ ctx }) =>
		listAccounts(ctx.db, ctx.identity, {}, true),
	),
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
		if (ctx.identity.actor === "SYSTEM_ADMIN") {
			const [profile] = await ctx.db
				.select({ name: user.name, email: user.email })
				.from(user)
				.where(eq(user.id, ctx.identity.userId));
			if (!profile) throw new TRPCError({ code: "UNAUTHORIZED" });
			return {
				...profile,
				actor: "SYSTEM_ADMIN" as const,
				username: ctx.identity.username,
				isActive: ctx.identity.isActive,
			};
		}
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
			actor: "SR" as const,
			nim: ctx.identity.nim,
			isActive: ctx.identity.isActive,
		};
	}),
	session: publicProcedure.query(async ({ ctx }) => {
		if (!ctx.session) return null;
		const identity = await getActiveIdentity(ctx.db, ctx.session.user.id);
		if (!identity) return null;
		return {
			userId: identity.userId,
			...(identity.actor === "SR"
				? { actor: "SR" as const, nim: identity.nim }
				: { actor: "SYSTEM_ADMIN" as const, username: identity.username }),
			mustChangePassword: identity.mustChangePassword,
			requiresPasswordChange: requiresPasswordChange(identity),
			name: ctx.session.user.name,
			canManageInternalEvents: canManageInternalEvent(identity),
			canManageInternalAttendanceManually:
				canManageInternalAttendanceManually(identity),
			canOperateGeneralActivity: canOperateGeneralActivity(identity),
			isSuperadmin: hasSuperadminPrivilege(identity),
		};
	}),
});
