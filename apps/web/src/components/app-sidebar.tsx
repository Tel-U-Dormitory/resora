"use client";

import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarGroupContent,
	SidebarGroupLabel,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	useSidebar,
} from "@resora/ui/components/sidebar";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { getSidebarGroups, isSidebarLinkActive } from "@/config/navigation";
import { UserMenu } from "@/features/identity/public";

import { navigationIcons as icons } from "./navigation-icons";

export function AppSidebar({
	name,
	departmentCode,
	canManageEvents,
	canManageCommittee,
	canReadAttendancePoints,
	canAccessPenilaianWorkspace,
	canManageDt,
	isSuperadmin,
	isSr,
	isDt = false,
}: {
	name: string;
	departmentCode?: string | null;
	canManageEvents: boolean;
	canManageCommittee?: boolean;
	canReadAttendancePoints?: boolean;
	canAccessPenilaianWorkspace?: boolean;
	canManageDt?: boolean;
	isSuperadmin: boolean;
	isSr: boolean;
	isDt?: boolean;
}) {
	const pathname = usePathname();
	const params = useSearchParams();
	const { state, isMobile, setOpenMobile } = useSidebar();
	const compact = state === "collapsed" && !isMobile;
	const groups = getSidebarGroups({
		isSr,
		isDt,
		departmentCode,
		canManageEvents,
		canManageCommittee,
		canReadAttendancePoints,
		canAccessPenilaianWorkspace,
		canManageDt,
		isSuperadmin,
	});
	const routeKey = `${pathname}?${params.toString()}`;
	useEffect(() => {
		if (routeKey) setOpenMobile(false);
	}, [routeKey, setOpenMobile]);
	useEffect(() => {
		if (!isMobile) setOpenMobile(false);
	}, [isMobile, setOpenMobile]);
	return (
		<Sidebar id="resora-sidebar" collapsible="icon" className="border-border">
			<SidebarHeader className="h-16 justify-center border-border border-b px-3">
				<Link
					href="/dashboard"
					onClick={() => setOpenMobile(false)}
					aria-label="RESORA · Beranda"
					className="focus-ring flex h-12 items-center gap-2.5 overflow-hidden rounded-xl px-1 font-extrabold text-lg tracking-tight group-data-[collapsible=icon]:justify-center"
				>
					<Image
						src="/Logo-Teldorm.png"
						alt=""
						width={937}
						height={1024}
						className="h-9 w-9 shrink-0 object-contain"
					/>
					<span className={compact ? "sr-only" : "truncate"}>
						RESORA<span className="text-primary">.</span>
					</span>
				</Link>
			</SidebarHeader>
			<SidebarContent>
				{groups.map(({ id, title, items }) => (
					<SidebarGroup
						key={id}
						className="resora-sidebar-group"
						aria-label={title}
						role="navigation"
					>
						<SidebarGroupLabel className="font-semibold text-[11px] tracking-wide">
							{title}
						</SidebarGroupLabel>
						<SidebarGroupContent>
							<SidebarMenu className="gap-1 group-data-[collapsible=icon]:items-center">
								{items.map((item) => {
									const Icon = icons[item.icon] ?? icons.dashboard;
									if (item.disabled) {
										const { title: label, href, badge } = item;
										return (
											<SidebarMenuItem key={href}>
												<SidebarMenuButton
													disabled
													aria-disabled="true"
													aria-label={badge ? `${label} (${badge})` : label}
													tooltip={{
														children: badge ? `${label} · ${badge}` : label,
														className: "rounded-lg",
													}}
													className="resora-sidebar-link h-11 cursor-not-allowed rounded-xl px-3 text-muted-foreground text-sm opacity-75 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
												>
													<Icon aria-hidden="true" />
													<span
														className={
															compact
																? "sr-only"
																: "flex min-w-0 flex-1 items-center justify-between gap-2"
														}
													>
														<span className="truncate">{label}</span>
														{badge && (
															<span className="shrink-0 rounded-md border border-border bg-surface-subtle px-1.5 py-0.5 font-medium text-[10px] text-muted-foreground">
																{badge}
															</span>
														)}
													</span>
												</SidebarMenuButton>
											</SidebarMenuItem>
										);
									}
									const { title: label, href } = item;
									const active = isSidebarLinkActive(
										href,
										pathname,
										canManageEvents && params.get("view") === "manage",
									);
									return (
										<SidebarMenuItem key={href}>
											<SidebarMenuButton
												render={<Link href={href} />}
												isActive={active}
												aria-current={active ? "page" : undefined}
												aria-label={label}
												tooltip={{ children: label, className: "rounded-lg" }}
												onClick={() => setOpenMobile(false)}
												className="resora-sidebar-link h-11 rounded-xl px-3 text-sm group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
											>
												<Icon aria-hidden="true" />
												<span className={compact ? "sr-only" : ""}>
													{label}
												</span>
											</SidebarMenuButton>
										</SidebarMenuItem>
									);
								})}
							</SidebarMenu>
						</SidebarGroupContent>
					</SidebarGroup>
				))}
			</SidebarContent>
			<SidebarFooter className="border-border border-t p-3 group-data-[collapsible=icon]:items-center">
				<UserMenu
					name={name}
					compact={compact}
					accountLabel={
						isSr
							? "Senior Resident"
							: isDt
								? "Dorm Team"
								: "Administrator Sistem"
					}
					onNavigate={() => setOpenMobile(false)}
				/>
			</SidebarFooter>
		</Sidebar>
	);
}
