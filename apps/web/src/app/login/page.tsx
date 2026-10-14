import { redirect } from "next/navigation";

import LoginForm from "@/features/identity/login-form";
import { getSrSession } from "@/features/identity/server-session";

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
