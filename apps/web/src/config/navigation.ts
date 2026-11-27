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

export function getSidebarGroups({
	isSr,
	canManageEvents,
	canManageCommittee = false,
	canReadAttendancePoints = false,
	isSuperadmin,
}: {
	isSr: boolean;
	canManageEvents: boolean;
	canManageCommittee?: boolean;
	canReadAttendancePoints?: boolean;
	isSuperadmin: boolean;
}) {
	return [
		{
			id: "global",
			title: "Umum",
			items: [
				...MAIN_NAVIGATION.filter(
					({ href }) =>
						isSr || ["/dashboard", "/broadcasts", "/profile"].includes(href),
				),
				...(isSr || isSuperadmin
					? [
							{
								title: "Penilaian SR",
								href: "/penilaian",
								icon: "manage",
							} as const,
						]
					: []),
				...((process.env.NODE_ENV === "development" ||
					process.env.NODE_ENV === "test") &&
				(isSr || isSuperadmin)
					? [
							{
								title: "Pelanggaran",
								href: "/pelanggaran",
								icon: "violations",
							} as const,
						]
					: []),
				...(canReadAttendancePoints
					? [
							{
								title: "Rekap poin kehadiran",
								href: "/events/points",
								icon: "points",
							} as const,
						]
					: []),
			],
		},
		...(canManageEvents || canManageCommittee
			? [
					{
						id: "hco",
						title: "Departemen · HCO",
						items: [
							...(canManageEvents ? HCO_NAVIGATION : []),
							...(canManageCommittee
								? [
										{
											title: "Kelola kepanitiaan",
											href: "/committees",
											icon: "committees",
										} as const,
									]
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
						items: ADMIN_NAVIGATION,
					},
				]
			: []),
	];
}

export type NavigationItem = ReturnType<
	typeof getSidebarGroups
>[number]["items"][number];

export function getAppItems(
	capabilities: Parameters<typeof getSidebarGroups>[0],
) {
	return getSidebarGroups(capabilities)
		.flatMap<NavigationItem>((group) => group.items)
		.filter(
			({ href }) =>
				!["/dashboard", "/broadcasts", "/profile", "/scan"].includes(href),
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
) {
	const managingEvents =
		pathname.startsWith("/events") &&
		pathname !== "/events/points" &&
		(managementView ||
			pathname === "/events/new" ||
			pathname.endsWith("/edit"));
	if (href === "/events?view=manage") return managingEvents;
	if (href === "/events")
		return (
			pathname.startsWith("/events") &&
			pathname !== "/events/points" &&
			!managingEvents
		);
	return pathname === href || pathname.startsWith(`${href}/`);
}
