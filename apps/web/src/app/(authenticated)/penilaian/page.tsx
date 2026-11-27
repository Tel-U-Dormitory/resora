import { redirect } from "next/navigation";
import { getSrSession } from "@/features/identity/server";
import { PenilaianWorkspace } from "@/features/penilaian/public";

export default async function PenilaianPage() {
	const session = await getSrSession();
	if (!session) redirect("/login?reason=session");
	if (session.requiresPasswordChange) redirect("/change-password");
	if (session.actor !== "SR" && !session.isSuperadmin) {
		redirect("/dashboard");
	}
	return <PenilaianWorkspace />;
}
