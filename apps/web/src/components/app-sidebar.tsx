"use client";

import {
	CalendarDays,
	History,
	LayoutDashboard,
	LockKeyhole,
	ScanLine,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ModeToggle } from "@/components/mode-toggle";
import { Avatar } from "@/components/ui/avatar";
import { MAIN_NAVIGATION } from "@/config/navigation";
import UserMenu from "@/features/identity/user-menu";

export function AppSidebar({
	name,
	onNavigate,
}: {
	name: string;
	onNavigate?: () => void;
}) {
	const pathname = usePathname();
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
					const active = pathname === href || pathname.startsWith(`${href}/`);
					const Icon =
						icon === "dashboard"
							? LayoutDashboard
							: icon === "events"
								? CalendarDays
								: icon === "scan"
									? ScanLine
									: icon === "history"
										? History
										: LockKeyhole;
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
			<div className="mt-auto space-y-4 border-border border-t px-3 pt-5">
				<div className="mt-5 flex items-center gap-3">
					<Avatar name={name} shape="squircle" />
					<div className="min-w-0">
						<p className="truncate font-semibold text-sm">{name}</p>
						<p className="text-muted-foreground text-xs">Akun SR</p>
					</div>
				</div>
				<div className="hidden lg:block">
					<ModeToggle />
				</div>
				<UserMenu inline />
			</div>
		</aside>
	);
}
