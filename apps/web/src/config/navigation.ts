import type { UserRolePermissions } from "./auth-types";

export interface NavItem {
  title: string;
  href: string;
  iconName: string;
  badge?: string;
  isNew?: boolean;
  isVisible: (permissions: UserRolePermissions) => boolean;
}

export interface NavGroup {
  groupLabel: string;
  items: NavItem[];
}

export const MAIN_NAVIGATION: NavGroup[] = [
  {
    groupLabel: "Menu Utama",
    items: [
      {
        title: "Dashboard",
        href: "/dashboard",
        iconName: "Category",
        isVisible: () => true,
      },
      {
        title: "Scan Kehadiran",
        href: "/attendance/scan",
        iconName: "ScanBarcode",
        isVisible: () => true,
      },
    ],
  },
  {
    groupLabel: "Presensi Internal SR (MOD-03)",
    items: [
      {
        title: "Manajemen Kegiatan",
        href: "/attendance",
        iconName: "Calendar",
        isVisible: (p) => p.isHCO,
      },
      {
        title: "Jadwal & Riwayat Presensi",
        href: "/attendance",
        iconName: "Calendar",
        isVisible: (p) => !p.isHCO,
      },
      {
        title: "Buat Event Baru",
        href: "/attendance/events/new",
        iconName: "AddCircle",
        badge: "HCO",
        isVisible: (p) => p.canCreateEvent,
      },
    ],
  },
];
