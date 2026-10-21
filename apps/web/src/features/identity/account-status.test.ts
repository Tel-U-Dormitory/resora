import { expect, test } from "bun:test";
import { accountStatus } from "./account-status";

test("cached account status follows inclusive dates, renewal gaps and manual deactivation", () => {
	const today = "2026-10-19";
	const old = { startsOn: "2025-01-01", endsOn: "2025-12-31" };
	const current = { startsOn: today, endsOn: today };
	const future = { startsOn: "2027-01-01", endsOn: "2027-12-31" };
	expect(accountStatus({ isActive: true, periods: [current] }, today)).toBe(
		"active",
	);
	expect(accountStatus({ isActive: true, periods: [old] }, today)).toBe(
		"archived",
	);
	expect(accountStatus({ isActive: true, periods: [old, future] }, today)).toBe(
		"archived",
	);
	expect(
		accountStatus({ isActive: true, periods: [old, current] }, today),
	).toBe("active");
	expect(accountStatus({ isActive: false, periods: [current] }, today)).toBe(
		"inactive",
	);
	expect(accountStatus({ isActive: true, periods: [future] }, today)).toBe(
		"scheduled",
	);
	expect(accountStatus({ isActive: true, periods: [] }, today)).toBe(
		"unassigned",
	);
});
