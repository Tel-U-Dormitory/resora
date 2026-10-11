import type { Route } from "next";
import type { UserRolePermissions } from "./auth-types";

export interface NavItem {
	title: string;
	href: Route;
	iconName: string;
	badge?: string;
	isVisible: (permissions: UserRolePermissions) => boolean;
}

export interface NavGroup {
	groupLabel: string;
	items: NavItem[];
}

// Add menus only when the feature is released. Visibility uses backend permissions.
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
		],
	},
];
