export type AccountStatus =
	| "active"
	| "inactive"
	| "archived"
	| "scheduled"
	| "unassigned";
export function jakartaToday() {
	return new Intl.DateTimeFormat("sv-SE", {
		timeZone: "Asia/Jakarta",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).format(new Date());
}
export function accountStatus(
	account: {
		isActive: boolean;
		periods: { startsOn: string; endsOn: string }[];
	},
	today: string,
): AccountStatus {
	if (!account.isActive) return "inactive";
	if (
		account.periods.some(
			(period) => period.startsOn <= today && period.endsOn >= today,
		)
	)
		return "active";
	if (account.periods.some((period) => period.endsOn < today))
		return "archived";
	return account.periods.length ? "scheduled" : "unassigned";
}
export const accountStatusLabels: Record<AccountStatus, string> = {
	active: "Aktif",
	inactive: "Diarsipkan manual",
	archived: "Diarsipkan · Purna",
	scheduled: "Belum mulai",
	unassigned: "Belum ada periode",
};
