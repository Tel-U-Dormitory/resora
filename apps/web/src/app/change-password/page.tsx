import { redirect } from "next/navigation";

import PasswordChangeForm from "@/features/identity/password-change-form";
import { getSrSession } from "@/features/identity/server-session";

export default async function PasswordChangePage() {
	const session = await getSrSession();
	if (!session) redirect("/login?reason=session");
	return <PasswordChangeForm />;
}
