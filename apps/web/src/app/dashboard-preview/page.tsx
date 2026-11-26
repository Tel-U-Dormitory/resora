import { notFound } from "next/navigation";
import { getDashboardPreviewFixtures } from "@/features/dashboard/public";

export default async function DashboardPreviewPage() {
	if (process.env.NODE_ENV !== "development" && process.env.NODE_ENV !== "test")
		notFound();
	const fixtures = await getDashboardPreviewFixtures(true);
	if (!fixtures) notFound();
	const { DashboardPreview } = await import("@/features/dashboard/public");
	return <DashboardPreview fixtures={fixtures} />;
}
