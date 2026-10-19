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
import {
	CalendarDays,
	History,
	LayoutDashboard,
	ListChecks,
	ScanLine,
	Users,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { getSidebarGroups, isSidebarLinkActive } from "@/config/navigation";
import UserMenu from "@/features/identity/user-menu";

const icons = {
	dashboard: LayoutDashboard,
	events: CalendarDays,
	scan: ScanLine,
	history: History,
	manage: ListChecks,
	accounts: Users,
};

export function AppSidebar({
	name,
	canManageEvents,
	isSuperadmin,
	isSr,
}: {
	name: string;
	canManageEvents: boolean;
	isSuperadmin: boolean;
	isSr: boolean;
}) {
	const pathname = usePathname();
	const params = useSearchParams();
	const { state, isMobile, setOpenMobile } = useSidebar();
	const compact = state === "collapsed" && !isMobile;
	const groups = getSidebarGroups({ isSr, canManageEvents, isSuperadmin });
	const routeKey = `${pathname}?${params.toString()}`;
	useEffect(() => {
		if (routeKey) setOpenMobile(false);
	}, [routeKey, setOpenMobile]);
	useEffect(() => {
		if (!isMobile) setOpenMobile(false);
	}, [isMobile, setOpenMobile]);
	return (
		<Sidebar id="resora-sidebar" collapsible="icon" className="border-border">
			<SidebarHeader className="h-20 justify-center px-3">
				<Link
					href="/dashboard"
					onClick={() => setOpenMobile(false)}
					aria-label="RESORA · Dashboard"
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
								{items.map(({ title: label, href, icon }) => {
									const Icon = icons[icon];
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
					accountLabel={isSr ? "Senior Resident" : "Administrator Sistem"}
					onNavigate={() => setOpenMobile(false)}
				/>
			</SidebarFooter>
		</Sidebar>
	);
}
