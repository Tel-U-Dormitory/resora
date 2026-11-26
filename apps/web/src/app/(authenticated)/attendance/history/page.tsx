import { redirect } from "next/navigation";
import { OwnHistory } from "@/features/attendance/public";
import { getSrSession } from "@/features/identity/server";

export default async function AttendanceHistoryPage() {
	const session = await getSrSession();
	if (!session) redirect("/login?reason=session");
	if (session.requiresPasswordChange) redirect("/change-password");
	if (session.actor !== "SR") redirect("/profile");
	return <OwnHistory userId={session.userId} />;
}
