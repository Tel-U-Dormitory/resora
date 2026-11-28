import type { Viewport } from "next";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { getSrSession } from "@/features/identity/server";
export const viewport: Viewport = {
	width: "device-width",
	initialScale: 1,
	viewportFit: "cover",
};
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
			departmentCode={session.departmentCode}
			canManageEvents={session.canManageInternalEvents}
			canManageCommittee={session.canManageCommittee}
			canReadAttendancePoints={session.canReadAttendancePoints}
			canAccessPenilaianWorkspace={session.canAccessPenilaianWorkspace}
			canManageDt={session.canManageDt}
			isSuperadmin={session.isSuperadmin}
			isSr={session.actor === "SR"}
			isDt={session.actor === "DT"}
		>
			{children}
		</AppShell>
	);
}
