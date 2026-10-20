import { expect, test } from "bun:test";
import { getSidebarGroups, isSidebarLinkActive } from "./navigation";

test("global, HCO and administration groups follow independent backend capabilities", () => {
	for (const isSr of [false, true]) {
		for (const canManageEvents of [false, true]) {
			for (const isSuperadmin of [false, true]) {
				const groups = getSidebarGroups({
					isSr,
					canManageEvents,
					isSuperadmin,
				});
				expect(groups[0]?.id).toBe("global");
				expect(groups[0]?.items.map((item) => item.href)).toEqual(
					isSr
						? ["/dashboard", "/events", "/scan", "/attendance/history"]
						: ["/dashboard"],
				);
				expect(groups.some((group) => group.id === "hco")).toBe(
					canManageEvents,
				);
				expect(groups.some((group) => group.id === "administration")).toBe(
					isSuperadmin,
				);
				expect(
					groups
						.find((group) => group.id === "administration")
						?.items.map((item) => item.href) ?? [],
				).toEqual(isSuperadmin ? ["/admin/users", "/admin/periods"] : []);
				expect(groups.every((group) => group.items.length > 0)).toBe(true);
			}
		}
	}
});

test("event management and global event links never highlight simultaneously", () => {
	for (const [path, managementView, manages] of [
		["/events", false, false],
		["/events", true, true],
		["/events/new", false, true],
		["/events/id/edit", false, true],
		["/events/id", false, false],
		["/profile", false, false],
	] as const) {
		const global = isSidebarLinkActive("/events", path, managementView);
		const management = isSidebarLinkActive(
			"/events?view=manage",
			path,
			managementView,
		);
		expect(global && management).toBe(false);
		expect(management).toBe(manages);
	}
	expect(isSidebarLinkActive("/admin/users", "/admin/users/new", false)).toBe(
		true,
	);
	expect(isSidebarLinkActive("/scan", "/attendance/history", false)).toBe(
		false,
	);
});

test("period settings and accounts highlight independently", () => {
	expect(isSidebarLinkActive("/admin/periods", "/admin/periods", false)).toBe(
		true,
	);
	expect(isSidebarLinkActive("/admin/users", "/admin/periods", false)).toBe(
		false,
	);
	expect(isSidebarLinkActive("/admin/periods", "/admin/users", false)).toBe(
		false,
	);
});
