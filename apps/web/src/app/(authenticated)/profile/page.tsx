import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SrProfile } from "@/features/identity/public";
import { getSrSession } from "@/features/identity/server";

export const metadata: Metadata = { title: "Profil Saya | RESORA" };

export default async function ProfilePage() {
	const session = await getSrSession();
	if (!session) redirect("/login?reason=session");
	if (session.requiresPasswordChange) redirect("/change-password");
	return <SrProfile userId={session.userId} />;
}
