import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getSrSession } from "@/features/identity/server-session";
export default async function EventsLayout({
	children,
}: {
	children: ReactNode;
}) {
	const session = await getSrSession();
	if (!session) redirect("/login?reason=session");
	if (session.mustChangePassword) redirect("/change-password");
	return children;
}
