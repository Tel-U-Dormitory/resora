"use client";

import {
	CalendarDays,
	ChevronDown,
	History,
	LayoutDashboard,
	ScanLine,
	UserRound,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { RefObject } from "react";
import { HCO_NAVIGATION, MAIN_NAVIGATION } from "@/config/navigation";
import UserMenu from "@/features/identity/user-menu";

export function AppSidebar({
	name,
	canManageEvents,
	onNavigate,
	menuContainer,
}: {
	name: string;
	canManageEvents: boolean;
	onNavigate?: () => void;
	menuContainer?: RefObject<HTMLDialogElement | null>;
}) {
	const pathname = usePathname();
	const params = useSearchParams();
	const hcoArea =
		canManageEvents &&
		pathname.startsWith("/events") &&
		(params.get("view") === "manage" ||
			pathname === "/events/new" ||
			pathname.endsWith("/edit"));
	return (
		<aside className="flex h-full flex-col overflow-y-auto border-border border-r bg-surface p-4">
			<Link
				href="/dashboard"
				onClick={onNavigate}
				className="focus-ring mb-8 flex items-center gap-3 rounded-md px-3 py-2 font-bold tracking-tight"
			>
				<span
					className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground"
					aria-hidden="true"
				>
					R
				</span>
				RESORA
			</Link>
			<p className="mb-3 px-3 font-semibold text-muted-foreground text-xs uppercase tracking-wider">
				Menu utama
			</p>
			<nav aria-label="Navigasi aplikasi" className="flex flex-col gap-1">
				{MAIN_NAVIGATION.map(({ title, href, icon }) => {
					const active =
						(pathname === href || pathname.startsWith(`${href}/`)) &&
						!(href === "/events" && hcoArea);
					const Icon =
						icon === "dashboard"
							? LayoutDashboard
							: icon === "events"
								? CalendarDays
								: icon === "scan"
									? ScanLine
									: icon === "history"
										? History
										: UserRound;
					return (
						<Link
							key={href}
							href={href}
							onClick={onNavigate}
							aria-current={active ? "page" : undefined}
							className={`focus-ring flex items-center gap-3 rounded-md px-3 py-2.5 font-semibold text-sm transition-colors ${active ? "bg-primary-soft text-primary-soft-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
						>
							<Icon size={18} aria-hidden="true" />
							{title}
						</Link>
					);
				})}
			</nav>
			{canManageEvents && (
				<details className="group mt-6" open={hcoArea || undefined}>
					<summary className="focus-ring flex cursor-pointer list-none items-center justify-between rounded-md px-3 py-2.5 font-semibold text-sm hover:bg-muted [&::-webkit-details-marker]:hidden">
						HCO
						<ChevronDown
							size={16}
							className="transition-transform group-open:rotate-180"
							aria-hidden="true"
						/>
					</summary>
					<nav
						aria-label="Pengelolaan HCO"
						className="mt-1 space-y-1 border-border border-l pl-3"
					>
						{HCO_NAVIGATION.map(({ title, href }) => {
							const active =
								href === "/events/new"
									? pathname === href
									: hcoArea && pathname !== "/events/new";
							return (
								<Link
									key={href}
									href={href}
									onClick={onNavigate}
									aria-current={active ? "page" : undefined}
									className={`focus-ring block rounded-md px-3 py-2.5 text-sm ${active ? "bg-primary-soft font-semibold text-primary-soft-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
								>
									{title}
								</Link>
							);
						})}
					</nav>
				</details>
			)}
			<div className="mt-auto space-y-4 border-border border-t px-3 pt-5">
				<UserMenu
					name={name}
					onNavigate={onNavigate}
					container={menuContainer}
				/>
			</div>
		</aside>
	);
}
