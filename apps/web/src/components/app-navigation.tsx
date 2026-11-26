"use client";

import { Button } from "@resora/ui/components/button";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@resora/ui/components/sheet";
import { Grid2X2, House, Inbox, ScanLine, UserRound, X } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { getAppItems, getPrimaryDestination } from "@/config/navigation";
import { navigationIcons } from "./navigation-icons";

export function AppNavigation({
	isSr,
	canManageEvents,
	canManageCommittee,
	canReadAttendancePoints,
	isSuperadmin,
}: Parameters<typeof getAppItems>[0]) {
	const pathname = usePathname();
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const trigger = useRef<HTMLButtonElement>(null);
	const title = useRef<HTMLHeadingElement>(null);
	const historyEntry = useRef(false);
	const items = getAppItems({
		isSr,
		canManageEvents,
		canManageCommittee,
		canReadAttendancePoints,
		isSuperadmin,
	});
	const destinations = [
		{ label: "Beranda", href: "/dashboard", icon: House },
		{ label: "Inbox", href: "/broadcasts", icon: Inbox },
		{ label: "Profil", href: "/profile", icon: UserRound },
	] as const;
	const destination = getPrimaryDestination(pathname);
	const appsCurrent = !destination && pathname !== "/scan";
	const close = useCallback(() => {
		setOpen(false);
		if (historyEntry.current && window.history.state?.resoraApps) {
			historyEntry.current = false;
			window.history.back();
		}
	}, []);
	useEffect(() => {
		const onPopState = () => {
			historyEntry.current = Boolean(window.history.state?.resoraApps);
			setOpen(historyEntry.current);
		};
		const wide = window.matchMedia("(min-width: 1200px)");
		const onResize = () => {
			if (wide.matches) close();
		};
		window.addEventListener("popstate", onPopState);
		wide.addEventListener("change", onResize);
		onPopState();
		onResize();
		return () => {
			window.removeEventListener("popstate", onPopState);
			wide.removeEventListener("change", onResize);
		};
	}, [close]);
	return (
		<>
			<div className="resora-mobile-dock" data-mobile-navigation="">
				<nav className="resora-bottom-nav" aria-label="Navigasi utama">
					{destinations.map(({ label, href, icon: Icon }) => {
						const current = destination === href;
						return (
							<Link
								key={href}
								href={href}
								aria-current={current ? "page" : undefined}
								className="resora-nav-item"
							>
								<Icon aria-hidden="true" />
								<span>{label}</span>
							</Link>
						);
					})}
					<button
						ref={trigger}
						type="button"
						className="resora-nav-item"
						aria-expanded={open}
						aria-controls="resora-apps"
						aria-haspopup="dialog"
						data-current={appsCurrent || undefined}
						onClick={() => {
							if (open) return;
							historyEntry.current = true;
							window.history.pushState(
								{ ...window.history.state, resoraApps: true },
								"",
							);
							setOpen(true);
						}}
					>
						<Grid2X2 aria-hidden="true" />
						<span>Apps</span>
					</button>
				</nav>
				{isSr && (
					<Link
						href="/scan"
						className="resora-scan-action"
						aria-label="Scan QR"
					>
						<ScanLine aria-hidden="true" />
					</Link>
				)}
			</div>
			<Sheet
				open={open}
				onOpenChange={(next) => {
					if (!next) close();
				}}
			>
				<SheetContent
					id="resora-apps"
					side="bottom"
					showCloseButton={false}
					initialFocus={title}
					finalFocus={trigger}
					className="resora-apps-sheet"
				>
					<SheetHeader className="flex-row items-start justify-between gap-4 p-0">
						<div className="space-y-1">
							<SheetTitle ref={title} tabIndex={-1} className="text-xl">
								Apps
							</SheetTitle>
							<SheetDescription>
								Pilih modul yang tersedia untuk kamu.
							</SheetDescription>
						</div>
						<Button
							variant="ghost"
							size="icon"
							aria-label="Tutup Apps"
							onClick={close}
						>
							<X aria-hidden="true" />
						</Button>
					</SheetHeader>
					{items.length ? (
						<div className="resora-apps-grid">
							{items.map(({ title: label, href, icon }) => {
								const Icon = navigationIcons[icon];
								return (
									<Link
										key={href}
										href={href as Route}
										onClick={(event) => {
											if (
												event.metaKey ||
												event.ctrlKey ||
												event.shiftKey ||
												event.altKey
											)
												return;
											event.preventDefault();
											setOpen(false);
											historyEntry.current = false;
											if (window.history.state?.resoraApps) {
												// Convert the temporary overlay entry into the destination;
												// Back then returns directly to the page behind Apps.
												const state = { ...window.history.state };
												delete state.resoraApps;
												window.history.replaceState(state, "");
												router.replace(href as Route);
											} else {
												router.push(href as Route);
											}
										}}
									>
										<span className="resora-app-icon">
											<Icon aria-hidden="true" />
										</span>
										<span>{label}</span>
									</Link>
								);
							})}
						</div>
					) : (
						<p role="status" className="py-6 text-sm">
							Belum ada modul lain yang tersedia untuk akun kamu.
						</p>
					)}
				</SheetContent>
			</Sheet>
		</>
	);
}
