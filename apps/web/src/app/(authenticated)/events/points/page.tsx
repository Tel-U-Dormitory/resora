import { redirect } from "next/navigation";
import { getSrSession } from "@/features/identity/server";

export default async function PointsPage() {
	const session = await getSrSession();
	if (!session) redirect("/login?reason=session");
	if (session.requiresPasswordChange) redirect("/change-password");
	if (!session.canReadAttendancePoints) redirect("/dashboard");
	redirect("/penilaian?tab=points");
}
