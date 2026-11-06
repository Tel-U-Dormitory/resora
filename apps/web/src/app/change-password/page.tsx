import { redirect } from "next/navigation";

import { PasswordChangeForm } from "@/features/identity/public";
import { getSrSession } from "@/features/identity/server";

export default async function PasswordChangePage() {
	const session = await getSrSession();
	if (!session) redirect("/login?reason=session");
	if (!session.requiresPasswordChange) redirect("/profile");
	return <PasswordChangeForm />;
}
