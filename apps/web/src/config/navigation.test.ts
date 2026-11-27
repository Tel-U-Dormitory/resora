import { expect, test } from "bun:test";
import {
	getAppItems,
	getPrimaryDestination,
	getSidebarGroups,
	isSidebarLinkActive,
	type NavigationItem,
} from "./navigation";

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
				const hasViolationsPreview =
					(process.env.NODE_ENV === "development" ||
						process.env.NODE_ENV === "test") &&
					(isSr || isSuperadmin);
				expect(groups[0]?.items.map((item) => item.href)).toEqual([
					"/dashboard",
					"/broadcasts",
					"/profile",
					...(isSr
						? (["/events", "/scan", "/attendance/history"] as const)
						: []),
					...(isSr || isSuperadmin ? (["/penilaian"] as const) : []),
					...(hasViolationsPreview ? (["/pelanggaran"] as const) : []),
				]);
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

test("points and committee links follow their own capabilities, including system actors", () => {
	for (const isSr of [false, true]) {
		for (const canReadAttendancePoints of [false, true]) {
			for (const canManageCommittee of [false, true]) {
				const items = getSidebarGroups({
					isSr,
					canManageEvents: false,
					isSuperadmin: false,
					canReadAttendancePoints,
					canManageCommittee,
				}).flatMap<NavigationItem>((group) => group.items);
				expect(items.some((item) => item.href === "/events/points")).toBe(
					canReadAttendancePoints,
				);
				expect(items.some((item) => item.href === "/committees")).toBe(
					canManageCommittee,
				);
				expect(items.some((item) => item.href === "/scan")).toBe(isSr);
			}
		}
	}
	for (const managementView of [false, true]) {
		expect(
			isSidebarLinkActive("/events", "/events/points", managementView),
		).toBe(false);
		expect(
			isSidebarLinkActive(
				"/events?view=manage",
				"/events/points",
				managementView,
			),
		).toBe(false);
		expect(
			isSidebarLinkActive("/events/points", "/events/points", managementView),
		).toBe(true);
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

test("Apps reuses sidebar capabilities and excludes primary destinations and QR", () => {
	const participant = getAppItems({
		isSr: true,
		canManageEvents: false,
		isSuperadmin: false,
	});
	expect(participant.map((item) => item.href)).toEqual([
		"/events",
		"/attendance/history",
		"/penilaian",
		...(process.env.NODE_ENV === "development" ||
		process.env.NODE_ENV === "test"
			? (["/pelanggaran"] as const)
			: []),
	]);
	const admin = getAppItems({
		isSr: false,
		canManageEvents: false,
		isSuperadmin: true,
	});
	expect(admin.map((item) => item.href)).toEqual([
		"/penilaian",
		...(process.env.NODE_ENV === "development" ||
		process.env.NODE_ENV === "test"
			? (["/pelanggaran"] as const)
			: []),
		"/admin/users",
		"/admin/periods",
	]);
	const empty = getAppItems({
		isSr: false,
		canManageEvents: false,
		isSuperadmin: false,
	});
	expect(empty).toEqual([]);
	for (const items of [participant, admin]) {
		expect(
			items.some((item) =>
				["/dashboard", "/broadcasts", "/profile", "/scan"].includes(item.href),
			),
		).toBe(false);
	}
});

test("primary destinations include Inbox history and personal attendance under Profil", () => {
	expect(getPrimaryDestination("/dashboard")).toBe("/dashboard");
	expect(getPrimaryDestination("/broadcasts/history")).toBe("/broadcasts");
	expect(getPrimaryDestination("/attendance/history")).toBe("/profile");
	for (const route of [
		"/events/item",
		"/events/points",
		"/admin/users/new",
		"/scan",
	])
		expect(getPrimaryDestination(route)).toBeNull();
});
