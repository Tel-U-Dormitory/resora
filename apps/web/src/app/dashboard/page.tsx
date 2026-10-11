import { redirect } from "next/navigation";

import { getSrSession } from "@/features/identity/server-session";
import SrDashboard from "@/features/identity/sr-dashboard";

export default async function DashboardPage() {
	const session = await getSrSession();
	if (!session) redirect("/login?reason=session");
	if (session.mustChangePassword) redirect("/change-password");
	return <SrDashboard />;
}
