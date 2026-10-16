"use client";

import { Button } from "@resora/ui/components/button";
import { Menu, PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { type ReactNode, useEffect, useRef, useState } from "react";
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
	const drawer = useRef<HTMLDialogElement>(null);
	const closeButton = useRef<HTMLButtonElement>(null);
	const [open, setOpen] = useState(false);
	const [collapsed, setCollapsed] = useState(false);
	useEffect(() => {
		if (pathname) drawer.current?.close();
	}, [pathname]);
	useEffect(() => {
		const desktop = window.matchMedia("(min-width: 1024px)");
		const handleResize = () => {
			if (desktop.matches) drawer.current?.close();
		};
		desktop.addEventListener("change", handleResize);
		return () => desktop.removeEventListener("change", handleResize);
	}, []);
	useEffect(() => {
		if (!open) return;
		const previous = document.body.style.overflow;
		document.body.style.overflow = "hidden";
		return () => {
			document.body.style.overflow = previous;
		};
	}, [open]);
	return (
		<div className="min-h-dvh lg:flex">
			<div
				className={`hidden overflow-hidden transition-[width] duration-300 motion-reduce:transition-none lg:sticky lg:top-0 lg:block lg:h-dvh lg:shrink-0 ${collapsed ? "lg:w-0" : "lg:w-64"}`}
			>
				<div className="h-full w-64" inert={collapsed}>
					<AppSidebar
						name={name}
						canManageEvents={canManageEvents}
						isSuperadmin={isSuperadmin}
						isSr={isSr}
					/>
				</div>
			</div>
			<div
				className="pointer-events-none fixed top-5 left-0 z-30 hidden transition-[left] duration-300 motion-reduce:transition-none lg:block"
				style={{ left: collapsed ? 8 : 236 }}
			>
				<Button
					variant="outline"
					size="icon"
					className="pointer-events-auto size-10 rounded-full bg-surface shadow-sm"
					aria-label={collapsed ? "Buka sidebar" : "Tutup sidebar"}
					aria-expanded={!collapsed}
					onClick={() => setCollapsed(!collapsed)}
				>
					{collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
				</Button>
			</div>

			<div className="min-w-0 flex-1">
				<div className="sticky top-0 z-20 flex items-center justify-between border-border border-b bg-surface/95 px-4 py-3 backdrop-blur-md">
					<Button
						className="rounded-full lg:hidden"
						variant="ghost"
						size="icon"
						aria-label="Buka navigasi"
						aria-expanded={open}
						aria-controls="app-navigation-drawer"
						onClick={() => {
							drawer.current?.showModal();
							setOpen(true);
							closeButton.current?.focus();
						}}
					>
						<Menu size={22} aria-hidden="true" />
					</Button>
					<div className="ml-auto flex items-center gap-2">
						<ModeToggle />
					</div>
				</div>
				<main className="mx-auto max-w-7xl p-4 pb-24 sm:p-6 sm:pb-24 lg:p-8">
					{children}
				</main>
			</div>
			{isSr && <MobileQuickActions canManageEvents={canManageEvents} />}

			<dialog
				ref={drawer}
				id="app-navigation-drawer"
				aria-label="Navigasi aplikasi"
				onClose={() => setOpen(false)}
				className="resora-navigation-drawer fixed inset-0 m-0 h-dvh max-h-none w-full max-w-none border-0 bg-transparent p-0 text-foreground backdrop:bg-ink/50 lg:hidden"
			>
				<button
					type="button"
					aria-label="Tutup navigasi"
					className="absolute inset-0 h-full w-full"
					tabIndex={-1}
					onClick={() => drawer.current?.close()}
				/>
				<div className="relative h-full w-72 max-w-[85vw] bg-surface shadow-xl">
					<button
						ref={closeButton}
						type="button"
						aria-label="Tutup navigasi"
						className="focus-ring absolute top-4 right-3 z-10 rounded-md p-2 hover:bg-muted"
						onClick={() => drawer.current?.close()}
					>
						<X size={20} aria-hidden="true" />
					</button>
					<AppSidebar
						name={name}
						canManageEvents={canManageEvents}
						isSuperadmin={isSuperadmin}
						isSr={isSr}
						menuContainer={drawer}
						onNavigate={() => drawer.current?.close()}
					/>
				</div>
			</dialog>
		</div>
	);
}
