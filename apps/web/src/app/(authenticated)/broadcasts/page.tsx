import { redirect } from "next/navigation";
import { BroadcastFeed } from "@/features/broadcast/public";
import { getSrSession } from "@/features/identity/server";

export default async function BroadcastsPage() {
	const session = await getSrSession();
	if (!session) redirect("/login?reason=session");
	if (session.requiresPasswordChange) redirect("/change-password");
	return <BroadcastFeed view="ACTIVE" canManage={session.canManageBroadcast} />;
}
