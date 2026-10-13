// Presentational links only. Protected pages and Express enforce access.
export const MAIN_NAVIGATION = [
	{ title: "Dashboard", href: "/dashboard", icon: "dashboard" },
	{ title: "Event internal", href: "/events", icon: "events" },
	{ title: "Scan QR", href: "/scan", icon: "scan" },
	{ title: "Riwayat kehadiran", href: "/attendance/history", icon: "history" },
] as const;

export const HCO_NAVIGATION = [
	{ title: "Kelola event", href: "/events?view=manage" },
	{ title: "Buat event", href: "/events/new" },
] as const;
