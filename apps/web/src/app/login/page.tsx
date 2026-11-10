import { redirect } from "next/navigation";

import { LoginForm } from "@/features/identity/public";
import { getSrSession } from "@/features/identity/server";

export default async function LoginPage({
	searchParams,
}: {
	searchParams: Promise<{ reason?: string }>;
}) {
	const session = await getSrSession();
	if (session)
		redirect(
			session.requiresPasswordChange ? "/change-password" : "/dashboard",
		);
	return <LoginForm expired={(await searchParams).reason === "session"} />;
}
