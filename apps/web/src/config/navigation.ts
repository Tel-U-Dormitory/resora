// Presentational links only. Protected pages and Express enforce access.
export const MAIN_NAVIGATION = [
	{ title: "Beranda", href: "/dashboard", icon: "dashboard" },
	{ title: "Inbox", href: "/broadcasts", icon: "inbox" },
	{ title: "Profil", href: "/profile", icon: "profile" },
	{ title: "Event internal", href: "/events", icon: "events" },
	{ title: "Scan QR", href: "/scan", icon: "scan" },
	{ title: "Riwayat kehadiran", href: "/attendance/history", icon: "history" },
] as const;

export const HCO_NAVIGATION = [
	{ title: "Kelola event", href: "/events?view=manage", icon: "manage" },
] as const;

export const ADMIN_NAVIGATION = [
	{ title: "Kelola akun", href: "/admin/users", icon: "accounts" },
	{ title: "Periode menjabat", href: "/admin/periods", icon: "periods" },
] as const;

export type SidebarNavHref =
	| "/dashboard"
	| "/broadcasts"
	| "/profile"
	| "/events"
	| "/scan"
	| "/attendance/history"
	| "/events?view=manage"
	| "/committees"
	| "/penilaian"
	| "/pelanggaran"
	| "/dt"
	| "/admin/users"
	| "/admin/periods";

export type SidebarNavIcon =
	| "dashboard"
	| "inbox"
	| "profile"
	| "dt"
	| "events"
	| "scan"
	| "history"
	| "manage"
	| "accounts"
	| "committees"
	| "periods"
	| "points"
	| "violations"
	| "cleanliness"
	| "facilities";

export type SidebarNavItem =
	| {
			title: string;
			href: SidebarNavHref;
			icon: SidebarNavIcon;
			disabled?: false;
			badge?: undefined;
	  }
	| {
			title: string;
			href: `#${string}`;
			icon: SidebarNavIcon;
			disabled: true;
			badge: string;
	  };

export function getSidebarGroups({
	isSr,
	isDt = false,
	departmentCode = null,
	canManageEvents,
	canManageCommittee = false,
	canReadAttendancePoints = false,
	canAccessPenilaianWorkspace = false,
	canManageDt = false,
	isSuperadmin,
}: {
	isSr: boolean;
	isDt?: boolean;
	departmentCode?: string | null;
	canManageEvents: boolean;
	canManageCommittee?: boolean;
	canReadAttendancePoints?: boolean;
	canAccessPenilaianWorkspace?: boolean;
	canManageDt?: boolean;
	isSuperadmin: boolean;
}) {
	void canReadAttendancePoints;
	const showAdaptifGroup = canManageDt || isSuperadmin;
	const hasDepartmentAccess =
		canManageEvents || canManageCommittee || canAccessPenilaianWorkspace;
	const departmentTitle =
		departmentCode && departmentCode !== "ADAPTIF"
			? `Departemen · ${departmentCode}`
			: "Departemen · HCO";
	const srItems: SidebarNavItem[] = [
		...(isSr
			? ([
					{ title: "Event internal", href: "/events", icon: "events" },
					{ title: "Scan QR", href: "/scan", icon: "scan" },
					{
						title: "Riwayat kehadiran",
						href: "/attendance/history",
						icon: "history",
					},
				] as SidebarNavItem[])
			: []),
		...((process.env.NODE_ENV === "development" ||
			process.env.NODE_ENV === "test") &&
		(isSr || isSuperadmin)
			? ([
					{
						title: "Pelanggaran",
						href: "/pelanggaran",
						icon: "violations",
					},
				] as SidebarNavItem[])
			: []),
		...(isSr
			? ([
					{
						title: "Kebersihan Kamar",
						href: "#kebersihan-kamar",
						icon: "cleanliness",
						disabled: true,
						badge: "Segera hadir",
					},
					{
						title: "Keluhan Fasilitas",
						href: "#keluhan-fasilitas",
						icon: "facilities",
						disabled: true,
						badge: "Segera hadir",
					},
				] as SidebarNavItem[])
			: []),
	];
	const dtPersonalItems: SidebarNavItem[] = isDt
		? [
				{ title: "Portal DT", href: "/dt", icon: "dt" },
				{ title: "Kegiatan", href: "/events", icon: "events" },
				{ title: "Scan QR", href: "/scan", icon: "scan" },
				{
					title: "Riwayat kehadiran",
					href: "/attendance/history",
					icon: "history",
				},
			]
		: [];

	return [
		{
			id: "global",
			title: "Umum",
			items: [
				{ title: "Beranda", href: "/dashboard", icon: "dashboard" },
				...(isDt
					? []
					: ([
							{ title: "Inbox", href: "/broadcasts", icon: "inbox" },
						] as SidebarNavItem[])),
			] satisfies SidebarNavItem[],
		},
		...(dtPersonalItems.length > 0
			? [
					{
						id: "dt",
						title: "Dorm Team",
						items: dtPersonalItems,
					},
				]
			: []),
		...(srItems.length > 0
			? [
					{
						id: "sr",
						title: "Senior Resident",
						items: srItems,
					},
				]
			: []),
		...(showAdaptifGroup
			? [
					{
						id: "adaptif",
						title: "Departemen · ADAPTIF",
						items: [
							{ title: "Kelola DT", href: "/dt", icon: "dt" },
						] satisfies SidebarNavItem[],
					},
				]
			: []),
		...(hasDepartmentAccess
			? [
					{
						id: "hco",
						title: departmentTitle,
						items: [
							...(canAccessPenilaianWorkspace
								? ([
										{
											title: "Penilaian SR",
											href: "/penilaian",
											icon: "points",
										},
									] as SidebarNavItem[])
								: []),
							...(canManageEvents
								? ([...HCO_NAVIGATION] as SidebarNavItem[])
								: []),
							...(canManageCommittee
								? ([
										{
											title: "Kelola kepanitiaan",
											href: "/committees",
											icon: "committees",
										},
									] as SidebarNavItem[])
								: []),
						],
					},
				]
			: []),
		...(isSuperadmin
			? [
					{
						id: "administration",
						title: "Administrasi",
						items: [...ADMIN_NAVIGATION] as SidebarNavItem[],
					},
				]
			: []),
	];
}

export type NavigationItem = SidebarNavItem;

export function getAppItems(
	capabilities: Parameters<typeof getSidebarGroups>[0],
) {
	return getSidebarGroups(capabilities)
		.flatMap<NavigationItem>((group) => group.items)
		.filter(
			(item): item is Extract<NavigationItem, { disabled?: false }> =>
				!item.disabled &&
				!["/dashboard", "/broadcasts", "/profile", "/scan"].includes(item.href),
		);
}

export function getPrimaryDestination(pathname: string) {
	if (pathname === "/dashboard") return "/dashboard";
	if (pathname === "/broadcasts" || pathname.startsWith("/broadcasts/"))
		return "/broadcasts";
	if (
		pathname === "/profile" ||
		pathname.startsWith("/profile/") ||
		pathname === "/attendance/history"
	)
		return "/profile";
	return null;
}

export function isSidebarLinkActive(
	href: string,
	pathname: string,
	managementView: boolean,
	dtEventsView = false,
) {
	const managingEvents =
		pathname.startsWith("/events") &&
		pathname !== "/events/points" &&
		(managementView ||
			pathname === "/events/new" ||
			pathname.endsWith("/edit"));
	if (href === "/dt") {
		return dtEventsView || pathname === "/dt" || pathname.startsWith("/dt/");
	}
	if (href === "/events?view=manage") return managingEvents && !dtEventsView;
	if (href === "/events")
		return (
			pathname.startsWith("/events") &&
			pathname !== "/events/points" &&
			!managingEvents &&
			!dtEventsView
		);
	return pathname === href || pathname.startsWith(`${href}/`);
}
