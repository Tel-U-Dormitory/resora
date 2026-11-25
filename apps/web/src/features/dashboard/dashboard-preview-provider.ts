import "server-only";
import type { DashboardFixture, DashboardMode } from "./dashboard.contracts";

export async function getDashboardPreviewFixtures(
	canManage: boolean,
): Promise<Partial<Record<DashboardMode, DashboardFixture>> | null> {
	if (
		process.env.NODE_ENV !== "development" &&
		process.env.NODE_ENV !== "test"
	) {
		return null;
	}
	const { dashboardFixturesFor } = await import("./dashboard-fixtures");
	return dashboardFixturesFor(canManage);
}
