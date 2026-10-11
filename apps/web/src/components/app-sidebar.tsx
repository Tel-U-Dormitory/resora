"use client";

import { CalendarDays, LayoutDashboard, LockKeyhole } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { Avatar } from "@/components/ui/avatar";
import { MAIN_NAVIGATION } from "@/config/navigation";

export function AppSidebar({ name }: { name: string }) {
	const pathname = usePathname();
	return (
		<aside className="rounded-xl border border-border bg-surface p-4 shadow-xs lg:w-60 lg:shrink-0">
			<p className="mb-3 px-3 font-semibold text-muted-foreground text-xs uppercase tracking-wider">
				Menu utama
			</p>
			<nav
				aria-label="Navigasi dashboard"
				className="flex flex-wrap gap-1 lg:flex-col"
			>
				{MAIN_NAVIGATION.map(({ title, href, icon }) => {
					const active = pathname === href;
					const Icon =
						icon === "dashboard"
							? LayoutDashboard
							: icon === "events"
								? CalendarDays
								: LockKeyhole;
					return (
						<Link
							key={href}
							href={href}
							aria-current={active ? "page" : undefined}
							className={`focus-ring flex items-center gap-3 rounded-md px-3 py-2.5 font-semibold text-sm transition-colors ${active ? "bg-primary-soft text-primary-soft-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
						>
							<Icon size={18} aria-hidden="true" />
							{title}
						</Link>
					);
				})}
			</nav>
			<div className="mt-5 hidden items-center gap-3 border-border border-t px-3 pt-4 lg:flex">
				<Avatar name={name} shape="squircle" />
				<div className="min-w-0">
					<p className="truncate font-semibold text-sm">{name}</p>
					<p className="text-muted-foreground text-xs">Akun SR</p>
				</div>
			</div>
		</aside>
	);
}
