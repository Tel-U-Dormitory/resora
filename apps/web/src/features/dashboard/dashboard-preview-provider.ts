import "server-only";
import type { DashboardFixture, DashboardMode } from "./dashboard.contracts";

export async function getDashboardPreviewFixtures(): Promise<Record<
	DashboardMode,
	DashboardFixture
> | null> {
	if (
		process.env.NODE_ENV !== "development" &&
		process.env.NODE_ENV !== "test"
	) {
		return null;
	}
	const { dashboardFixtures } = await import("./dashboard-fixtures");
	return dashboardFixtures;
}
