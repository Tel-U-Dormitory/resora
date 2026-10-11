"use client";

import {
	AddCircle,
	Calendar,
	Category,
	Logout,
	ScanBarcode,
} from "iconsax-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarGroupContent,
	SidebarGroupLabel,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuBadge,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarRail,
	useSidebar,
} from "@/components/ui/sidebar";
import { useAuth } from "@/config/auth-context";
import { MAIN_NAVIGATION } from "@/config/navigation";

// Helper to map icon name string to icon component
function getNavIcon(name: string, active: boolean) {
	const variant = active ? "Bold" : "Linear";
	switch (name) {
		case "Category":
			return <Category size={18} variant={variant} />;
		case "Calendar":
			return <Calendar size={18} variant={variant} />;
		case "AddCircle":
			return <AddCircle size={18} variant={variant} />;
		case "ScanBarcode":
			return <ScanBarcode size={18} variant={variant} />;
		default:
			return <Category size={18} variant={variant} />;
	}
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
	const pathname = usePathname();
	const { user, permissions, logout } = useAuth();
	const { setOpenMobile } = useSidebar();
	const [logoutError, setLogoutError] = React.useState<string | null>(null);
	if (!user || !permissions) return null;

	return (
		<Sidebar collapsible="icon" {...props}>
			{/* Sidebar Header — RESORA Brand */}
			<SidebarHeader>
				<div className="flex items-center gap-3 p-2 group-data-[collapsible=icon]/sidebar:justify-center">
					<div className="sidebar-brand-icon flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-primary to-primary-hover font-black text-sm text-white shadow-md shadow-primary/25">
						R
					</div>
					<div className="flex flex-col truncate group-data-[collapsible=icon]/sidebar:hidden">
						<span className="flex items-center gap-1.5 truncate font-extrabold text-foreground text-sm tracking-tight">
							RESORA
							<span className="rounded-full border border-primary/20 bg-primary/10 px-1.5 py-0.5 font-bold text-[10px] text-primary">
								SR XIV
							</span>
						</span>
						<span className="truncate font-medium text-[10px] text-muted-foreground">
							Dormitory Management System
						</span>
					</div>
				</div>
			</SidebarHeader>

			{/* Sidebar Content — Dynamic Navigation based on Role */}
			<SidebarContent>
				{MAIN_NAVIGATION.map((group) => {
					const visibleItems = group.items.filter((item) =>
						item.isVisible(permissions),
					);
					if (visibleItems.length === 0) return null;

					return (
						<SidebarGroup key={group.groupLabel}>
							<SidebarGroupLabel>{group.groupLabel}</SidebarGroupLabel>
							<SidebarGroupContent>
								<SidebarMenu>
									{visibleItems.map((item) => {
										const isActive =
											item.href === "/dashboard"
												? pathname === "/dashboard"
												: pathname.startsWith(item.href);

										return (
											<SidebarMenuItem key={item.href}>
												<SidebarMenuButton
													asChild
													isActive={isActive}
													tooltip={item.title}
												>
													<Link
														href={item.href}
														onClick={() => setOpenMobile(false)}
														aria-current={isActive ? "page" : undefined}
														className="flex w-full items-center gap-3"
													>
														{getNavIcon(item.iconName, isActive)}
														<span className="flex-1 truncate group-data-[collapsible=icon]/sidebar:hidden">
															{item.title}
														</span>
														{item.badge && (
															<SidebarMenuBadge>{item.badge}</SidebarMenuBadge>
														)}
													</Link>
												</SidebarMenuButton>
											</SidebarMenuItem>
										);
									})}
								</SidebarMenu>
							</SidebarGroupContent>
						</SidebarGroup>
					);
				})}
			</SidebarContent>

			{/* Sidebar Footer — User profile and logout */}
			<SidebarFooter>
				<div className="flex items-center gap-3 border-border border-t p-2 group-data-[collapsible=icon]/sidebar:justify-center">
					<div className="sidebar-user-avatar flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/80 to-amber-600 font-bold text-white text-xs shadow-xs">
						{user.name.charAt(0)}
					</div>
					<div className="flex min-w-0 flex-1 flex-col truncate group-data-[collapsible=icon]/sidebar:hidden">
						<span className="truncate font-bold text-foreground text-xs">
							{user.name}
						</span>
						<span className="flex items-center gap-1 truncate text-[10px] text-muted-foreground">
							<span className="font-semibold text-primary">
								{user.departmentCode}
							</span>{" "}
							• {user.positionName}
						</span>
					</div>
					<button
						type="button"
						onClick={() => {
							void logout().catch(() =>
								setLogoutError("Gagal keluar. Coba lagi."),
							);
						}}
						title="Keluar"
						aria-label="Keluar"
						className="focus-ring cursor-pointer rounded-lg p-2.5 text-muted-foreground transition-colors hover:bg-danger/10 hover:text-danger"
					>
						<Logout size={16} />
					</button>
				</div>
				{logoutError && (
					<p role="alert" className="px-2 text-danger text-xs">
						{logoutError}
					</p>
				)}
			</SidebarFooter>

			<SidebarRail />
		</Sidebar>
	);
}
