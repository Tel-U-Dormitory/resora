import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getSrSession } from "@/features/identity/server-session";

export default async function AccountAdminLayout({
	children,
}: {
	children: ReactNode;
}) {
	const session = await getSrSession();
	if (!session) redirect("/login?reason=session");
	if (session.requiresPasswordChange) redirect("/change-password");
	if (!session.isSuperadmin) redirect("/dashboard");
	return children;
}
