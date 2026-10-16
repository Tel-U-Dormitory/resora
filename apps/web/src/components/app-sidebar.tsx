"use client";

import { Button } from "@resora/ui/components/button";
import {
	CalendarDays,
	ChevronDown,
	History,
	LayoutDashboard,
	ListChecks,
	Plus,
	ScanLine,
	UserPlus,
	Users,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { RefObject } from "react";
import {
	ADMIN_NAVIGATION,
	HCO_NAVIGATION,
	MAIN_NAVIGATION,
} from "@/config/navigation";
import UserMenu from "@/features/identity/user-menu";

export function AppSidebar({
	name,
	canManageEvents,
	isSuperadmin,
	isSr,
	onNavigate,
	menuContainer,
}: {
	name: string;
	canManageEvents: boolean;
	isSuperadmin: boolean;
	isSr: boolean;
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
				className="focus-ring mb-6 flex items-center gap-2.5 rounded-md px-3 py-2 font-bold tracking-tight"
			>
				<Image
					src="/Logo-Teldorm.png"
					alt=""
					width={937}
					height={1024}
					className="h-12 w-auto shrink-0 object-contain"
				/>
				RESORA
			</Link>
			<p className="mb-2 px-3 font-semibold text-muted-foreground text-xs uppercase tracking-wider">
				Menu utama
			</p>
			<nav aria-label="Navigasi aplikasi" className="flex flex-col gap-1">
				{MAIN_NAVIGATION.filter(
					({ href }) => href !== "/scan" && href !== "/attendance/history",
				).map(({ title, href, icon }) => {
					const active =
						(pathname === href || pathname.startsWith(`${href}/`)) &&
						!(href === "/events" && hcoArea);
					const Icon =
						icon === "dashboard"
							? LayoutDashboard
							: icon === "events"
								? CalendarDays
								: History;
					return (
						<Link
							key={href}
							href={href}
							onClick={onNavigate}
							aria-current={active ? "page" : undefined}
							className={`focus-ring flex min-h-10 items-center gap-2.5 rounded-xl px-3 py-2 text-[13px] leading-5 transition-colors ${active ? "bg-primary-soft font-semibold text-primary-soft-foreground" : "font-medium text-muted-foreground hover:bg-muted hover:text-foreground"}`}
						>
							<Icon size={16} aria-hidden="true" />
							{title}
						</Link>
					);
				})}
			</nav>
			{isSr && (
				<details
					className="group mt-1"
					open={pathname === "/scan" || undefined}
				>
					<summary className="focus-ring flex min-h-11 cursor-pointer list-none items-center gap-2.5 rounded-xl px-3 font-medium text-sm hover:bg-muted [&::-webkit-details-marker]:hidden">
						<ScanLine size={16} aria-hidden="true" /> Absensi
						<ChevronDown
							size={16}
							className="ml-auto transition-transform group-open:rotate-180"
							aria-hidden="true"
						/>
					</summary>
					<Button
						render={<Link href="/scan" onClick={onNavigate} />}
						variant="ghost"
						className={`my-1 flex min-h-10 w-full justify-start gap-2.5 rounded-xl pr-3 pl-9 text-[13px] ${pathname === "/scan" ? "bg-primary-soft font-semibold text-primary-soft-foreground hover:bg-primary-soft hover:text-primary-soft-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
						aria-current={pathname === "/scan" ? "page" : undefined}
					>
						<ScanLine size={16} aria-hidden="true" /> Scan kehadiran
					</Button>
				</details>
			)}
			<p className="mt-7 mb-2 px-3 font-semibold text-muted-foreground text-xs uppercase tracking-wider">
				Aktivitas & riwayat
			</p>
			{isSr && (
				<Button
					render={<Link href="/attendance/history" onClick={onNavigate} />}
					variant="ghost"
					className={`min-h-10 w-full justify-start gap-2.5 rounded-xl px-3 text-[13px] ${pathname === "/attendance/history" ? "bg-primary-soft font-semibold text-primary-soft-foreground hover:bg-primary-soft hover:text-primary-soft-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
					aria-current={pathname === "/attendance/history" ? "page" : undefined}
				>
					<History size={16} aria-hidden="true" /> Riwayat kehadiran
				</Button>
			)}

			{canManageEvents && (
				<details className="group mt-5" open={hcoArea || undefined}>
					<summary className="focus-ring flex min-h-10 cursor-pointer list-none items-center justify-between rounded-md px-3 py-2 font-semibold text-[13px] leading-5 transition-colors hover:bg-muted [&::-webkit-details-marker]:hidden">
						<span className="flex items-center gap-2.5">
							<CalendarDays size={16} aria-hidden="true" />
							HCO
						</span>
						<ChevronDown
							size={16}
							className="transition-transform group-open:rotate-180"
							aria-hidden="true"
						/>
					</summary>
					<nav aria-label="Pengelolaan HCO" className="mt-1 space-y-1">
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
									className={`focus-ring flex min-h-10 w-full items-center gap-2.5 rounded-xl py-2 pr-3 pl-9 text-[13px] leading-5 transition-colors ${active ? "bg-primary-soft font-semibold text-primary-soft-foreground" : "font-medium text-muted-foreground hover:bg-muted hover:text-foreground"}`}
								>
									{href === "/events/new" ? (
										<Plus size={16} aria-hidden="true" />
									) : (
										<ListChecks size={16} aria-hidden="true" />
									)}
									{title}
								</Link>
							);
						})}
					</nav>
				</details>
			)}
			{isSuperadmin && (
				<details
					className="group mt-5"
					open={pathname.startsWith("/admin/users") || undefined}
				>
					<summary className="focus-ring flex min-h-10 cursor-pointer list-none items-center justify-between rounded-md px-3 py-2 font-semibold text-[13px] leading-5 transition-colors hover:bg-muted [&::-webkit-details-marker]:hidden">
						<span className="flex items-center gap-2.5">
							<Users size={16} aria-hidden="true" />
							Administrasi
						</span>
						<ChevronDown
							size={16}
							className="transition-transform group-open:rotate-180"
							aria-hidden="true"
						/>
					</summary>
					<nav aria-label="Administrasi akun" className="mt-1 space-y-1">
						{ADMIN_NAVIGATION.map(({ title, href }) => (
							<Link
								key={href}
								href={href}
								onClick={onNavigate}
								aria-current={pathname === href ? "page" : undefined}
								className={`focus-ring flex min-h-10 w-full items-center gap-2.5 rounded-xl py-2 pr-3 pl-9 text-[13px] leading-5 transition-colors ${pathname === href ? "bg-primary-soft font-semibold text-primary-soft-foreground" : "font-medium text-muted-foreground hover:bg-muted hover:text-foreground"}`}
							>
								{href === "/admin/users/new" ? (
									<UserPlus size={16} aria-hidden="true" />
								) : (
									<Users size={16} aria-hidden="true" />
								)}
								{title}
							</Link>
						))}
					</nav>
				</details>
			)}
			<div className="mt-auto space-y-4 border-border border-t px-3 pt-5">
				<UserMenu
					name={name}
					accountLabel={isSr ? "Senior Resident" : "Administrator Sistem"}
					onNavigate={onNavigate}
					container={menuContainer}
				/>
			</div>
		</aside>
	);
}
