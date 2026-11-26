"use client";

import { SidebarProvider, SidebarTrigger } from "@resora/ui/components/sidebar";
import { TooltipProvider } from "@resora/ui/components/tooltip";
import { ChevronRight, UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";
import { AppSidebar } from "@/components/app-sidebar";
import { AppNavigation } from "./app-navigation";
import { ModeToggle } from "./mode-toggle";

export function AppShell({
	name,
	canManageEvents,
	canManageCommittee,
	canReadAttendancePoints,
	isSuperadmin,
	isSr,
	children,
}: {
	name: string;
	canManageEvents: boolean;
	canManageCommittee?: boolean;
	canReadAttendancePoints?: boolean;
	isSuperadmin: boolean;
	isSr: boolean;
	children: ReactNode;
}) {
	const pathname = usePathname();
	const [sidebarOpen, setSidebarOpen] = useState(true);
	useEffect(() => {
		try {
			setSidebarOpen(
				localStorage.getItem("resora-sidebar-collapsed") !== "true",
			);
		} catch {
			/* Storage is optional. */
		}
	}, []);
	const sectionTitle = pathname.startsWith("/committees")
		? "Kepanitiaan"
		: pathname.startsWith("/admin/users")
			? "Kelola akun"
			: pathname.startsWith("/admin/periods")
				? "Periode menjabat"
				: pathname === "/events/points"
					? "Rekap poin kehadiran"
					: pathname.startsWith("/events")
						? "Kegiatan"
						: pathname.startsWith("/attendance")
							? "Riwayat kehadiran"
							: pathname === "/scan"
								? "Scan QR"
								: pathname.startsWith("/broadcasts")
									? "Inbox"
									: pathname === "/profile"
										? "Profil"
										: "Beranda";
	const capabilities = {
		isSr,
		canManageEvents,
		canManageCommittee,
		canReadAttendancePoints,
		isSuperadmin,
	};
	return (
		<TooltipProvider delay={150}>
			<SidebarProvider
				className="resora-workspace min-h-dvh"
				open={sidebarOpen}
				onOpenChange={(next) => {
					setSidebarOpen(next);
					try {
						localStorage.setItem("resora-sidebar-collapsed", String(!next));
					} catch {
						/* Keep navigation usable without storage. */
					}
				}}
			>
				<a
					href="#workspace-content"
					className="focus-ring sr-only fixed top-4 left-4 z-50 rounded-xl bg-surface p-3 focus:not-sr-only"
				>
					Lewati navigasi
				</a>
				<AppSidebar name={name} {...capabilities} />
				<div className="min-w-0 flex-1">
					<header className="resora-utility-bar">
						<SidebarTrigger className="resora-sidebar-trigger hidden size-11 cursor-pointer rounded-xl min-[1200px]:inline-flex" />
						<nav aria-label="Breadcrumb" className="min-w-0 flex-1 text-sm">
							<ol className="flex min-w-0 items-center gap-2">
								{pathname !== "/dashboard" && (
									<li className="hidden items-center gap-2 min-[768px]:flex">
										<Link
											href="/dashboard"
											className="focus-ring rounded-lg py-3 text-muted-foreground"
										>
											Beranda
										</Link>
										<ChevronRight size={16} aria-hidden="true" />
									</li>
								)}
								<li aria-current="page" className="truncate font-semibold">
									{sectionTitle}
								</li>
							</ol>
						</nav>
						<ModeToggle allowSystem={false} />
						<Link
							href="/profile"
							className="resora-utility-profile focus-ring"
							aria-label={`Profil ${name}`}
						>
							<UserRound size={20} aria-hidden="true" />
							<span className="hidden max-w-40 truncate min-[1200px]:block">
								{name}
							</span>
						</Link>
					</header>
					<main
						id="workspace-content"
						tabIndex={-1}
						className="resora-shell-content mx-auto p-4 outline-none"
					>
						{children}
					</main>
				</div>
				<AppNavigation {...capabilities} />
			</SidebarProvider>
		</TooltipProvider>
	);
}
