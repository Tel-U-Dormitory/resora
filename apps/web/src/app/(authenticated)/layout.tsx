import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { getSrSession } from "@/features/identity/server-session";
export default async function AuthenticatedLayout({
	children,
}: {
	children: ReactNode;
}) {
	const session = await getSrSession();
	if (!session) redirect("/login?reason=session");
	if (session.requiresPasswordChange) redirect("/change-password");
	return (
		<AppShell
			name={session.name}
			canManageEvents={session.canManageInternalEvents}
			canManageCommittee={session.canManageCommittee}
			isSuperadmin={session.isSuperadmin}
			isSr={session.actor === "SR"}
		>
			{children}
		</AppShell>
	);
}
