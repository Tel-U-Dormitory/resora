import { protectedProcedure, router } from "../../index";
import {
	addMembersSchema,
	candidateSchema,
	committeeFieldsSchema,
	committeeIdSchema,
	divisionIdSchema,
	divisionSchema,
	listCommitteesSchema,
	memberIdSchema,
	memberSchema,
	updateCommitteeSchema,
	updateDivisionSchema,
} from "./committee.schema";
import {
	addMembers,
	committeeCandidates,
	committeeDetail,
	createCommittee,
	deleteCommittee,
	deleteDivision,
	listCommittees,
	removeMember,
	saveDivision,
	saveMember,
	updateCommittee,
} from "./committee.service";

export const committeeRouter = router({
	list: protectedProcedure
		.input(listCommitteesSchema)
		.query(({ ctx, input }) => listCommittees(ctx.db, ctx.identity, input)),
	detail: protectedProcedure
		.input(committeeIdSchema)
		.query(({ ctx, input }) =>
			committeeDetail(ctx.db, ctx.identity, input.committeeId),
		),
	candidates: protectedProcedure
		.input(candidateSchema)
		.query(({ ctx, input }) =>
			committeeCandidates(
				ctx.db,
				ctx.identity,
				input.committeeId,
				input.search,
			),
		),
	create: protectedProcedure
		.input(committeeFieldsSchema)
		.mutation(({ ctx, input }) => createCommittee(ctx.db, ctx.identity, input)),
	update: protectedProcedure
		.input(updateCommitteeSchema)
		.mutation(({ ctx, input: { committeeId, ...fields } }) =>
			updateCommittee(ctx.db, ctx.identity, committeeId, fields),
		),
	delete: protectedProcedure
		.input(committeeIdSchema)
		.mutation(({ ctx, input }) =>
			deleteCommittee(ctx.db, ctx.identity, input.committeeId),
		),
	createDivision: protectedProcedure
		.input(divisionSchema)
		.mutation(({ ctx, input }) => saveDivision(ctx.db, ctx.identity, input)),
	updateDivision: protectedProcedure
		.input(updateDivisionSchema)
		.mutation(({ ctx, input }) => saveDivision(ctx.db, ctx.identity, input)),
	deleteDivision: protectedProcedure
		.input(divisionIdSchema)
		.mutation(({ ctx, input }) => deleteDivision(ctx.db, ctx.identity, input)),
	addMember: protectedProcedure
		.input(memberSchema)
		.mutation(({ ctx, input }) => saveMember(ctx.db, ctx.identity, input)),
	addMembers: protectedProcedure
		.input(addMembersSchema)
		.mutation(({ ctx, input }) => addMembers(ctx.db, ctx.identity, input)),
	updateMember: protectedProcedure
		.input(memberSchema)
		.mutation(({ ctx, input }) =>
			saveMember(ctx.db, ctx.identity, input, true),
		),
	removeMember: protectedProcedure
		.input(memberIdSchema)
		.mutation(({ ctx, input }) => removeMember(ctx.db, ctx.identity, input)),
});
