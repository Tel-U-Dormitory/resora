import { z } from "zod";
import {
	getDtMemberDetail,
	getDtParticipationRecap,
	getMyDtPortal,
} from "../application/dt";
import { protectedProcedure, router } from "../index";
import {
	activateDtMembershipSchema,
	archiveDtMembershipSchema,
	dtMembershipIdSchema,
	endDtMembershipSchema,
	extendDtPeriodSchema,
	listDtMembersSchema,
	registerDtCandidateSchema,
	rejectDtCandidateSchema,
	updateDtAssignmentSchema,
} from "../modules/dt/dt.contracts";
import {
	activateDtMembership,
	archiveDtMembership,
	authorizeDtManager,
	authorizeDtPersonal,
	endDtMembership,
	extendDtPeriod,
	getDtReferences,
	listDtMembers,
	registerDtCandidate,
	rejectDtCandidate,
	resetDtPassword,
	updateDtAssignment,
} from "../modules/dt/dt.public";

export const dtRouter = router({
	myCapabilities: protectedProcedure.input(z.void()).query(({ ctx }) => ({
		canManageDt: authorizeDtManager(ctx.identity),
		isDtMember: authorizeDtPersonal(ctx.identity),
	})),
	references: protectedProcedure
		.input(z.void())
		.query(({ ctx }) => getDtReferences(ctx.db, ctx.identity)),
	list: protectedProcedure
		.input(listDtMembersSchema)
		.query(({ ctx, input }) => listDtMembers(ctx.db, ctx.identity, input)),
	detail: protectedProcedure
		.input(dtMembershipIdSchema)
		.query(({ ctx, input }) =>
			getDtMemberDetail(ctx.db, ctx.identity, input.membershipId),
		),
	participationRecap: protectedProcedure
		.input(listDtMembersSchema)
		.query(({ ctx, input }) =>
			getDtParticipationRecap(ctx.db, ctx.identity, input),
		),
	myPortal: protectedProcedure
		.input(z.void())
		.query(({ ctx }) => getMyDtPortal(ctx.db, ctx.identity)),
	registerCandidate: protectedProcedure
		.input(registerDtCandidateSchema)
		.mutation(({ ctx, input }) =>
			registerDtCandidate(ctx.db, ctx.identity, ctx.authConfig, input),
		),
	activate: protectedProcedure
		.input(activateDtMembershipSchema)
		.mutation(({ ctx, input }) =>
			activateDtMembership(ctx.db, ctx.identity, ctx.authConfig, input),
		),
	reject: protectedProcedure
		.input(rejectDtCandidateSchema)
		.mutation(({ ctx, input }) =>
			rejectDtCandidate(ctx.db, ctx.identity, input),
		),
	extendPeriod: protectedProcedure
		.input(extendDtPeriodSchema)
		.mutation(({ ctx, input }) => extendDtPeriod(ctx.db, ctx.identity, input)),
	endMembership: protectedProcedure
		.input(endDtMembershipSchema)
		.mutation(({ ctx, input }) => endDtMembership(ctx.db, ctx.identity, input)),
	archive: protectedProcedure
		.input(archiveDtMembershipSchema)
		.mutation(({ ctx, input }) =>
			archiveDtMembership(ctx.db, ctx.identity, input),
		),
	updateAssignment: protectedProcedure
		.input(updateDtAssignmentSchema)
		.mutation(({ ctx, input }) =>
			updateDtAssignment(ctx.db, ctx.identity, input),
		),
	resetPassword: protectedProcedure
		.input(dtMembershipIdSchema)
		.mutation(({ ctx, input }) =>
			resetDtPassword(ctx.db, ctx.identity, ctx.authConfig, input.membershipId),
		),
});
