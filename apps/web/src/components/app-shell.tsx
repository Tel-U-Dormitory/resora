"use client";

import { SidebarProvider, SidebarTrigger } from "@resora/ui/components/sidebar";
import { TooltipProvider } from "@resora/ui/components/tooltip";
import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";
import { AppSidebar } from "@/components/app-sidebar";
import { AppNavigation } from "./app-navigation";
import { ModeToggle } from "./mode-toggle";

function nameInitials(name: string) {
	return (
		name
			.trim()
			.split(/\s+/)
			.filter(Boolean)
			.slice(0, 2)
			.map((part) => part[0]?.toUpperCase() ?? "")
			.join("") || "SR"
	);
}

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
	const [detailMetricTitle, setDetailMetricTitle] = useState<string | null>(
		null,
	);
	useEffect(() => {
		try {
			setSidebarOpen(
				localStorage.getItem("resora-sidebar-collapsed") !== "true",
			);
		} catch {
			/* Storage is optional. */
		}
	}, []);
	useEffect(() => {
		const metricTitles: Record<string, string> = {
			assessment: "Penilaian",
			attendance: "Kehadiran",
			violations: "Pelanggaran aktif",
			cleanliness: "Kebersihan Kamar",
		};
		const syncDetailFromUrl = () => {
			if (pathname !== "/dashboard") {
				setDetailMetricTitle(null);
				return;
			}
			const param = new URLSearchParams(window.location.search).get("detail");
			const stateId = window.history.state?.resoraMetricDetail as
				| string
				| undefined;
			const id = param ?? stateId ?? null;
			setDetailMetricTitle(id && metricTitles[id] ? metricTitles[id] : null);
		};
		syncDetailFromUrl();
		const onCustomDetail = (event: Event) => {
			const detailId = (event as CustomEvent<string | null>).detail;
			setDetailMetricTitle(
				detailId && metricTitles[detailId] ? metricTitles[detailId] : null,
			);
		};
		window.addEventListener("popstate", syncDetailFromUrl);
		window.addEventListener("resora:metric-detail", onCustomDetail);
		return () => {
			window.removeEventListener("popstate", syncDetailFromUrl);
			window.removeEventListener("resora:metric-detail", onCustomDetail);
		};
	}, [pathname]);
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
									: pathname.startsWith("/penilaian")
										? "Penilaian SR"
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
	if (pathname === "/scan") {
		return (
			<div className="resora-workspace resora-scanner-workspace min-h-dvh">
				<main id="workspace-content" tabIndex={-1}>
					{children}
				</main>
			</div>
		);
	}
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
						<SidebarTrigger className="resora-sidebar-trigger hidden size-10 cursor-pointer rounded-[10px] border border-border bg-surface-subtle min-[1200px]:inline-flex" />
						<Link
							href="/profile"
							aria-label={`Profil ${name}`}
							className="focus-ring flex min-w-0 flex-1 items-center gap-2.5 rounded-xl py-1 min-[1200px]:hidden"
						>
							<span className="relative flex size-9 shrink-0 items-center justify-center rounded-full bg-accent font-extrabold text-accent-foreground text-xs">
								{nameInitials(name)}
							</span>
							<div className="min-w-0">
								<p className="truncate font-bold text-foreground text-sm leading-tight tracking-tight">
									{name}
								</p>
								<p className="truncate text-muted-foreground text-xs leading-tight">
									{isSr ? "Senior Resident" : "Administrator"}
								</p>
							</div>
						</Link>
						<nav
							aria-label="Breadcrumb"
							className="hidden min-w-0 flex-1 text-sm min-[1200px]:block"
						>
							<ol className="flex min-w-0 items-center gap-2">
								<li className="flex items-center gap-2">
									<Link
										href="/dashboard"
										className="focus-ring rounded-lg py-2 font-semibold text-muted-foreground hover:text-foreground"
									>
										RESORA
									</Link>
									<ChevronRight
										size={16}
										aria-hidden="true"
										className="text-muted-foreground"
									/>
								</li>
								{detailMetricTitle ? (
									<>
										<li className="flex items-center gap-2">
											<button
												type="button"
												onClick={() =>
													window.dispatchEvent(
														new CustomEvent("resora:metric-detail-close"),
													)
												}
												className="focus-ring cursor-pointer rounded-lg py-2 font-semibold text-muted-foreground hover:text-foreground"
											>
												{sectionTitle}
											</button>
											<ChevronRight
												size={16}
												aria-hidden="true"
												className="text-muted-foreground"
											/>
										</li>
										<li
											aria-current="page"
											className="truncate font-semibold text-foreground"
										>
											{detailMetricTitle}
										</li>
									</>
								) : (
									<li
										aria-current="page"
										className="truncate font-semibold text-foreground"
									>
										{sectionTitle}
									</li>
								)}
							</ol>
						</nav>
						<ModeToggle allowSystem={false} />
						<Link
							href="/profile"
							className="resora-utility-profile focus-ring"
							aria-label={`Profil ${name}`}
						>
							<span className="relative flex size-8 shrink-0 items-center justify-center rounded-full bg-accent font-extrabold text-accent-foreground text-xs">
								{nameInitials(name)}
							</span>
							<span className="hidden max-w-40 truncate font-semibold text-sm min-[1200px]:block">
								{name}
							</span>
						</Link>
					</header>
					<main
						id="workspace-content"
						tabIndex={-1}
						className="resora-shell-content outline-none"
					>
						{children}
					</main>
				</div>
				<AppNavigation {...capabilities} />
			</SidebarProvider>
		</TooltipProvider>
	);
}
