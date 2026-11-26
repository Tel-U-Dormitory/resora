"use client";

import {
	Grip,
	House,
	Inbox,
	QrCode,
	ShieldAlert,
	Sparkles,
	UserRound,
} from "lucide-react";
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
	const activeNavIndex =
		open || appsCurrent
			? 3
			: destination
				? destinations.findIndex((item) => item.href === destination)
				: -1;

	const close = useCallback(() => {
		setOpen(false);
		if (historyEntry.current && window.history.state?.resoraApps) {
			historyEntry.current = false;
			window.history.back();
		}
		requestAnimationFrame(() => {
			trigger.current?.focus();
		});
	}, []);

	useEffect(() => {
		const onPopState = () => {
			const nextOpen = Boolean(window.history.state?.resoraApps);
			historyEntry.current = nextOpen;
			setOpen(nextOpen);
		};
		const wide = window.matchMedia("(min-width: 1200px)");
		const onResize = () => {
			if (wide.matches) {
				setOpen(false);
				if (historyEntry.current && window.history.state?.resoraApps) {
					historyEntry.current = false;
					window.history.back();
				}
			}
		};
		window.addEventListener("popstate", onPopState);
		wide.addEventListener("change", onResize);
		onPopState();
		onResize();
		return () => {
			window.removeEventListener("popstate", onPopState);
			wide.removeEventListener("change", onResize);
		};
	}, []);

	useEffect(() => {
		if (!open) return;
		requestAnimationFrame(() => {
			title.current?.focus();
		});
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				event.preventDefault();
				close();
			}
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [open, close]);

	return (
		<>
			{open && (
				<div
					aria-hidden="true"
					className="resora-apps-backdrop fade-in-0 animate-in duration-150"
					onClick={close}
				/>
			)}
			<div className="resora-mobile-dock" data-mobile-navigation="">
				<div className="resora-nav-shell" data-open={open || undefined}>
					{open && (
						<div
							id="resora-apps"
							role="dialog"
							aria-modal="true"
							aria-labelledby="resora-apps-title"
							className="resora-apps-panel fade-in-0 slide-in-from-bottom-4 animate-in duration-200"
						>
							<h2
								id="resora-apps-title"
								ref={title}
								tabIndex={-1}
								className="sr-only"
							>
								Apps
							</h2>
							<button
								type="button"
								onClick={close}
								aria-label="Tutup Apps"
								className="focus-ring sr-only rounded-lg border border-border bg-surface px-2.5 py-1 font-semibold text-foreground text-xs focus:not-sr-only focus:mb-2 focus:self-end"
							>
								Tutup
							</button>
							<div className="resora-apps-grid">
								{items.map(({ title: label, href, icon }) => {
									const Icon = navigationIcons[icon];
									return (
										<Link
											key={href}
											href={href as Route}
											className="resora-app-item focus-ring"
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
													const state = { ...window.history.state };
													delete state.resoraApps;
													window.history.replaceState(state, "");
													router.replace(href as Route);
												} else {
													router.push(href as Route);
												}
											}}
										>
											<span className="resora-app-tile">
												<span className="resora-app-icon" data-icon={icon}>
													<Icon aria-hidden="true" />
												</span>
											</span>
											<span className="resora-app-label">{label}</span>
										</Link>
									);
								})}
								{[
									{
										id: "cleanliness",
										title: "Kebersihan Kamar",
										icon: Sparkles,
									},
									{
										id: "violations",
										title: "Pelanggaran",
										icon: ShieldAlert,
									},
								].map(({ id, title: upcomingTitle, icon: UpcomingIcon }) => (
									<div
										key={upcomingTitle}
										aria-disabled="true"
										className="resora-app-item resora-app-upcoming"
									>
										<span className="resora-app-tile">
											<span className="resora-app-icon" data-icon={id}>
												<UpcomingIcon aria-hidden="true" />
											</span>
										</span>
										<span className="resora-app-label">{upcomingTitle}</span>
										<span className="resora-app-soon">Segera</span>
									</div>
								))}
							</div>
						</div>
					)}
					<nav className="resora-bottom-nav" aria-label="Navigasi utama">
						<span
							aria-hidden="true"
							className="resora-nav-indicator"
							data-visible={activeNavIndex >= 0 ? "true" : "false"}
							style={{
								transform: `translateX(${Math.max(0, activeNavIndex) * 100}%)`,
							}}
						/>
						{destinations.map(({ label, href, icon: Icon }) => {
							const current = !open && destination === href;
							return (
								<Link
									key={href}
									href={href}
									aria-current={current ? "page" : undefined}
									className="resora-nav-item"
									onClick={() => {
										if (open) {
											setOpen(false);
											if (
												historyEntry.current &&
												window.history.state?.resoraApps
											) {
												const state = { ...window.history.state };
												delete state.resoraApps;
												window.history.replaceState(state, "");
												historyEntry.current = false;
											}
										}
									}}
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
							data-current={open || appsCurrent || undefined}
							onClick={() => {
								if (open) {
									close();
									return;
								}
								historyEntry.current = true;
								window.history.pushState(
									{ ...window.history.state, resoraApps: true },
									"",
								);
								setOpen(true);
							}}
						>
							<Grip aria-hidden="true" />
							<span>Apps</span>
						</button>
					</nav>
				</div>
				{isSr && (
					<Link
						href="/scan"
						className="resora-scan-action"
						aria-label="Scan QR"
					>
						<QrCode aria-hidden="true" />
					</Link>
				)}
			</div>
		</>
	);
}
