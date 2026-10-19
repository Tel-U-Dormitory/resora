// Presentational links only. Protected pages and Express enforce access.
export const MAIN_NAVIGATION = [
	{ title: "Dashboard", href: "/dashboard", icon: "dashboard" },
	{ title: "Event internal", href: "/events", icon: "events" },
	{ title: "Scan QR", href: "/scan", icon: "scan" },
	{ title: "Riwayat kehadiran", href: "/attendance/history", icon: "history" },
] as const;

export const HCO_NAVIGATION = [
	{ title: "Kelola event", href: "/events?view=manage", icon: "manage" },
] as const;

export const ADMIN_NAVIGATION = [
	{ title: "Kelola akun", href: "/admin/users", icon: "accounts" },
] as const;

export function getSidebarGroups({
	isSr,
	canManageEvents,
	isSuperadmin,
}: {
	isSr: boolean;
	canManageEvents: boolean;
	isSuperadmin: boolean;
}) {
	return [
		{
			id: "global",
			title: "Umum",
			items: MAIN_NAVIGATION.filter(
				({ href }) => isSr || href === "/dashboard",
			),
		},
		...(canManageEvents
			? [
					{
						id: "hco",
						title: "Departemen · HCO",
						items: HCO_NAVIGATION,
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

export function isSidebarLinkActive(
	href: string,
	pathname: string,
	managementView: boolean,
) {
	const managingEvents =
		pathname.startsWith("/events") &&
		(managementView ||
			pathname === "/events/new" ||
			pathname.endsWith("/edit"));
	if (href === "/events?view=manage") return managingEvents;
	if (href === "/events")
		return pathname.startsWith("/events") && !managingEvents;
	return pathname === href || pathname.startsWith(`${href}/`);
}
