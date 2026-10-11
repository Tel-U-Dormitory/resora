import { findIdentityProfile } from "@resora/db/identity-profile";
import { protectedProcedure, router } from "../../index";
import {
	getAttendancePermissions,
	requirePilotProfile,
} from "./identity.policy";

export const identityRouter = router({
	me: protectedProcedure.query(async ({ ctx }) => {
		const user = requirePilotProfile(
			await findIdentityProfile(ctx.db, ctx.session.user.id),
		);
		return { user, permissions: getAttendancePermissions(user) };
	}),
});
