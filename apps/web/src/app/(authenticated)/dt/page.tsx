import { redirect } from "next/navigation";
import { DtWorkspace } from "@/features/dt/public";
import { getSrSession } from "@/features/identity/server";

export default async function DtPage() {
	const session = await getSrSession();
	if (!session) redirect("/login?reason=session");
	if (session.requiresPasswordChange) redirect("/change-password");
	const isDtMember = session.actor === "DT";
	if (!session.canManageDt && !isDtMember) {
		redirect("/dashboard");
	}
	return (
		<DtWorkspace canManageDt={session.canManageDt} isDtMember={isDtMember} />
	);
}
