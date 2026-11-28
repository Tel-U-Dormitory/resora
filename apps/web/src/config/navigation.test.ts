import { expect, test } from "bun:test";
import {
	getAppItems,
	getPrimaryDestination,
	getSidebarGroups,
	getUpcomingAppItems,
	isSidebarLinkActive,
	type NavigationItem,
} from "./navigation";

const UPCOMING_SR_HREFS = [
	"#kebersihan-kamar",
	"#keluhan-fasilitas",
	"#pendaftaran-event",
	"#manajemen-prestasi",
	"#penilaian-sesama-sr",
	"#berita-acara-harian",
	"#aspirasi-anonim",
	"#proyek-event",
] as const;

test("global, senior-resident, department and administration groups follow backend capabilities", () => {
	const hasViolations = (isSr: boolean, isSuperadmin: boolean) =>
		(process.env.NODE_ENV === "development" ||
			process.env.NODE_ENV === "test") &&
		(isSr || isSuperadmin);

	for (const isSr of [false, true]) {
		for (const canManageEvents of [false, true]) {
			for (const canAccessPenilaianWorkspace of [false, true]) {
				for (const isSuperadmin of [false, true]) {
					const groups = getSidebarGroups({
						isSr,
						departmentCode: isSr ? "RND" : null,
						canManageEvents,
						canAccessPenilaianWorkspace,
						isSuperadmin,
					});
					expect(groups[0]?.id).toBe("global");
					expect(groups[0]?.title).toBe("Umum");
					expect(groups[0]?.items.map((item) => item.href)).toEqual([
						"/dashboard",
						"/broadcasts",
					]);

					const srGroup = groups.find((group) => group.id === "sr");
					const hasSrGroup =
						isSr || isSuperadmin || hasViolations(isSr, isSuperadmin);
					expect(srGroup?.title).toBe(
						hasSrGroup ? "Senior Resident" : undefined,
					);
					expect(srGroup?.items.map((item) => item.href) ?? []).toEqual([
						...(isSr
							? (["/events", "/scan", "/attendance/history"] as const)
							: []),
						...(hasViolations(isSr, isSuperadmin)
							? (["/pelanggaran"] as const)
							: []),
						...(isSr || isSuperadmin ? UPCOMING_SR_HREFS : []),
					]);

					const hasDept = canManageEvents || canAccessPenilaianWorkspace;
					const deptGroup = groups.find((group) => group.id === "hco");
					expect(Boolean(deptGroup)).toBe(hasDept);
					if (deptGroup) {
						expect(deptGroup.title).toBe(
							isSr ? "Departemen · RND" : "Departemen · HCO",
						);
						expect(deptGroup.items.map((item) => item.href)).toEqual([
							...(canAccessPenilaianWorkspace ? (["/penilaian"] as const) : []),
							...(canManageEvents ? (["/events?view=manage"] as const) : []),
							"#penilaian-maba",
						]);
					}

					expect(
						groups
							.find((group) => group.id === "adaptif")
							?.items.map((item) => item.href) ?? [],
					).toEqual(isSuperadmin ? ["/dt"] : []);

					expect(groups.some((group) => group.id === "administration")).toBe(
						isSuperadmin,
					);
					expect(
						groups
							.find((group) => group.id === "administration")
							?.items.map((item) => item.href) ?? [],
					).toEqual(
						isSuperadmin ? ["/admin/users", "/admin/periods", "#cms-website"] : [],
					);
					expect(groups.every((group) => group.items.length > 0)).toBe(true);
				}
			}
		}
	}
});

test("penilaian and committee links follow department access without legacy /events/points", () => {
	for (const canAccessPenilaianWorkspace of [false, true]) {
		for (const canManageCommittee of [false, true]) {
			const items = getSidebarGroups({
				isSr: true,
				departmentCode: "HCO",
				canManageEvents: false,
				canManageCommittee,
				canAccessPenilaianWorkspace,
				isSuperadmin: false,
			}).flatMap<NavigationItem>((group) => group.items);
			expect(
				items.some((item) => (item.href as string) === "/events/points"),
			).toBe(false);
			expect(items.some((item) => item.href === "/penilaian")).toBe(
				canAccessPenilaianWorkspace,
			);
			expect(items.some((item) => item.href === "/committees")).toBe(
				canManageCommittee,
			);
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

test("Apps reuses sidebar capabilities and excludes primary destinations, disabled items, and QR", () => {
	const participant = getAppItems({
		isSr: true,
		departmentCode: "RND",
		canManageEvents: false,
		canAccessPenilaianWorkspace: false,
		isSuperadmin: false,
	});
	expect(participant.map((item) => item.href)).toEqual([
		"/events",
		"/attendance/history",
		...(process.env.NODE_ENV === "development" ||
		process.env.NODE_ENV === "test"
			? (["/pelanggaran"] as const)
			: []),
	]);
	const hcoMember = getAppItems({
		isSr: true,
		departmentCode: "HCO",
		canManageEvents: false,
		canAccessPenilaianWorkspace: true,
		isSuperadmin: false,
	});
	expect(hcoMember.map((item) => item.href)).toContain("/penilaian");
	const admin = getAppItems({
		isSr: false,
		canManageEvents: false,
		canAccessPenilaianWorkspace: true,
		isSuperadmin: true,
	});
	expect(admin.map((item) => item.href)).toEqual([
		...(process.env.NODE_ENV === "development" ||
		process.env.NODE_ENV === "test"
			? (["/pelanggaran"] as const)
			: []),
		"/dt",
		"/penilaian",
		"/admin/users",
		"/admin/periods",
	]);
	const empty = getAppItems({
		isSr: false,
		canManageEvents: false,
		isSuperadmin: false,
	});
	expect(empty).toEqual([]);
	for (const items of [participant, hcoMember, admin]) {
		expect(
			items.some((item) =>
				["/dashboard", "/broadcasts", "/profile", "/scan"].includes(item.href),
			),
		).toBe(false);
		expect(items.some((item) => item.disabled)).toBe(false);
	}
	expect(
		getUpcomingAppItems({
			isSr: true,
			departmentCode: "HCO",
			canManageEvents: true,
			canAccessPenilaianWorkspace: true,
			isSuperadmin: false,
		}).map((item) => item.href),
	).toEqual([...UPCOMING_SR_HREFS, "#penilaian-maba"]);
	expect(
		getUpcomingAppItems({
			isSr: true,
			departmentCode: "MEDIA",
			canManageEvents: false,
			isSuperadmin: false,
		}).map((item) => item.href),
	).toEqual([...UPCOMING_SR_HREFS, "#cms-website"]);
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
