import { notFound, redirect } from "next/navigation";
import { getSrSession } from "@/features/identity/server";
import { ViolationsWorkspace } from "@/features/violations/workspace";

export default async function ViolationsPage() {
	if (process.env.NODE_ENV !== "development" && process.env.NODE_ENV !== "test")
		notFound();

	const session = await getSrSession();
	if (!session) redirect("/login?reason=session");
	if (session.requiresPasswordChange) redirect("/change-password");
	if (session.actor !== "SR" && !session.isSuperadmin) redirect("/dashboard");

	return <ViolationsWorkspace fixedAdmin={session.isSuperadmin} />;
}
