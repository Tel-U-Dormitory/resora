import { redirect } from "next/navigation";

import { DashboardHeader } from "@/components/dashboard-header";
import { Card, CardContent } from "@/components/ui/card";
import { getSrSession } from "./server-session";

export default async function SrDashboard() {
	const session = await getSrSession();
	if (!session) redirect("/login?reason=session");
	if (session.requiresPasswordChange) redirect("/change-password");
	return (
		<section className="space-y-6">
			<DashboardHeader isSystem={session.actor === "SYSTEM_ADMIN"} />
			<Card>
				<CardContent className="space-y-2">
					<h2 className="font-semibold text-lg">
						Selamat datang, {session.name}.
					</h2>
					<p className="text-muted-foreground text-sm">
						{session.actor === "SR"
							? `NIM: ${session.nim}`
							: `Username: ${session.username}`}
					</p>
				</CardContent>
			</Card>
		</section>
	);
}
