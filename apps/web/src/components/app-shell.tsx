"use client";

import { SidebarProvider, SidebarTrigger } from "@resora/ui/components/sidebar";
import { TooltipProvider } from "@resora/ui/components/tooltip";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { AppSidebar } from "@/components/app-sidebar";
import { MobileQuickActions } from "./mobile-quick-actions";
import { ModeToggle } from "./mode-toggle";

export function AppShell({
	name,
	canManageEvents,
	isSuperadmin,
	isSr,
	children,
}: {
	name: string;
	canManageEvents: boolean;
	isSuperadmin: boolean;
	isSr: boolean;
	children: ReactNode;
}) {
	const pathname = usePathname();
	const sectionTitle = pathname.startsWith("/admin/users")
		? "Manajemen akun"
		: pathname.startsWith("/events")
			? "Kegiatan internal"
			: pathname.startsWith("/attendance")
				? "Riwayat kehadiran"
				: pathname === "/scan"
					? "Scan kehadiran"
					: pathname === "/profile"
						? "Profil saya"
						: "Dashboard";
	return (
		<TooltipProvider delay={150}>
			<SidebarProvider className="resora-workspace min-h-dvh">
				<a
					href="#workspace-content"
					className="focus-ring sr-only fixed top-4 left-4 z-50 rounded-xl bg-surface p-3 focus:not-sr-only"
				>
					Lewati navigasi
				</a>
				<AppSidebar
					name={name}
					canManageEvents={canManageEvents}
					isSuperadmin={isSuperadmin}
					isSr={isSr}
				/>
				<div className="min-w-0 flex-1">
					<header className="sticky top-0 z-20 flex min-h-16 items-center gap-3 border-border/70 border-b bg-surface/95 px-4 py-3 backdrop-blur-md sm:px-6 lg:px-8">
						<SidebarTrigger className="resora-sidebar-trigger size-11 cursor-pointer rounded-xl" />
						<p className="min-w-0 flex-1 truncate font-semibold text-sm">
							{sectionTitle}
						</p>
						<ModeToggle />
					</header>
					<main
						id="workspace-content"
						tabIndex={-1}
						className="mx-auto max-w-7xl p-4 pb-28 outline-none sm:p-6 sm:pb-28 lg:p-8"
					>
						{children}
					</main>
				</div>
				{isSr && <MobileQuickActions canManageEvents={canManageEvents} />}
			</SidebarProvider>
		</TooltipProvider>
	);
}
