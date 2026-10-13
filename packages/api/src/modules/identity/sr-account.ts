import type { Auth } from "@resora/auth";
import type { DatabaseTransaction } from "@resora/db";
import { srProfiles, userProfiles } from "@resora/db/schema/identity";

export type SrAccountAuth = Pick<
	Awaited<Auth["$context"]>,
	"internalAdapter" | "password"
>;

// Shared internal creation only; public signup remains disabled.
export async function createSrAccount(
	tx: DatabaseTransaction,
	context: SrAccountAuth,
	input: {
		name: string;
		nim: string;
		email: string;
		departmentCode: string;
		positionCode: string;
		buildingId: string;
		isActive: boolean;
	},
	passwordHash: string,
	method: "sr-admin" | "sr-csv" = "sr-admin",
) {
	const created = await context.internalAdapter.createUser(
		{
			name: input.name,
			email: input.email,
			emailVerified: false,
			username: input.nim,
			displayUsername: input.nim,
		},
		{ method },
	);
	if (!created?.id) throw new Error("AUTH_ACCOUNT_CREATION_FAILED");
	const linked = await context.internalAdapter.linkAccount({
		userId: created.id,
		accountId: created.id,
		providerId: "credential",
		password: passwordHash,
	});
	if (!linked?.id) throw new Error("AUTH_ACCOUNT_CREATION_FAILED");
	await tx.insert(userProfiles).values({
		userId: created.id,
		actor: "SR",
		isActive: input.isActive,
		mustChangePassword: true,
	});
	await tx.insert(srProfiles).values({
		userId: created.id,
		departmentCode: input.departmentCode,
		positionCode: input.positionCode,
		buildingId: input.buildingId,
	});
	return created.id;
}
