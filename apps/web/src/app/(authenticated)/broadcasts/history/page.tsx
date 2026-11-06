import { redirect } from "next/navigation";
import { BroadcastFeed } from "@/features/broadcast/public";
import { getSrSession } from "@/features/identity/server";

export default async function BroadcastHistoryPage() {
	const session = await getSrSession();
	if (!session) redirect("/login?reason=session");
	if (session.requiresPasswordChange) redirect("/change-password");
	return (
		<BroadcastFeed view="HISTORY" canManage={session.canManageBroadcast} />
	);
}
