import { eq, inArray } from "drizzle-orm";
import type { Database } from "./index";
import { srPeriodMemberships, srPeriods, srProfiles } from "./schema/identity";

// Explicit fixture setup for older opt-in suites; production provisioning never calls this.
export async function assignSyntheticSrTenure(
	db: Database,
	userIds: readonly string[],
) {
	const target = new URL(db.$client.options.connectionString ?? "");
	if (
		!["postgres:", "postgresql:"].includes(target.protocol) ||
		!["localhost", "127.0.0.1", "[::1]"].includes(target.hostname) ||
		!/^\/resora_identity_test_[a-z0-9_]+$/.test(target.pathname) ||
		target.search ||
		target.hash
	)
		throw new Error(
			"Synthetic tenure requires a guarded local scratch database",
		);
	if (!userIds.length) return;
	await db.transaction(async (tx) => {
		const name = "RESORA_SYNTHETIC_TEST_TENURE";
		await tx
			.insert(srPeriods)
			.values({ name, startsOn: "1900-01-01", endsOn: "2999-12-31" })
			.onConflictDoNothing();
		const [period] = await tx
			.select()
			.from(srPeriods)
			.where(eq(srPeriods.name, name));
		if (!period) throw new Error("Missing synthetic test period");
		const residents = await tx
			.select({ userId: srProfiles.userId })
			.from(srProfiles)
			.where(inArray(srProfiles.userId, [...userIds]));
		if (residents.length)
			await tx
				.insert(srPeriodMemberships)
				.values(
					residents.map((row) => ({ userId: row.userId, periodId: period.id })),
				)
				.onConflictDoNothing();
	});
}
