"use client";

import { Menu, X } from "lucide-react";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { AppSidebar } from "@/components/app-sidebar";
import { Button } from "@/components/ui/button";

export function AppShell({
	name,
	canManageEvents,
	isSuperadmin,
	children,
}: {
	name: string;
	canManageEvents: boolean;
	isSuperadmin: boolean;
	children: ReactNode;
}) {
	const pathname = usePathname();
	const drawer = useRef<HTMLDialogElement>(null);
	const closeButton = useRef<HTMLButtonElement>(null);
	const [open, setOpen] = useState(false);
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
			<div className="hidden lg:sticky lg:top-0 lg:block lg:h-dvh lg:w-64 lg:shrink-0">
				<AppSidebar
					name={name}
					canManageEvents={canManageEvents}
					isSuperadmin={isSuperadmin}
				/>
			</div>
			<div className="min-w-0 flex-1">
				<div className="sticky top-0 z-20 flex items-center justify-between border-border border-b bg-surface/95 px-4 py-3 backdrop-blur-md lg:hidden">
					<Button
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
					<span className="flex items-center gap-2 font-bold tracking-tight">
						<Image
							src="/Logo-Teldorm.png"
							alt=""
							width={937}
							height={1024}
							className="h-10 w-auto object-contain"
						/>
						RESORA
					</span>
					<span className="size-10" aria-hidden="true" />
				</div>
				<main className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">{children}</main>
			</div>
			<dialog
				ref={drawer}
				id="app-navigation-drawer"
				aria-label="Navigasi aplikasi"
				onClose={() => setOpen(false)}
				className="fixed inset-0 m-0 h-dvh max-h-none w-full max-w-none border-0 bg-transparent p-0 text-foreground backdrop:bg-ink/50 lg:hidden"
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
						menuContainer={drawer}
						onNavigate={() => drawer.current?.close()}
					/>
				</div>
			</dialog>
		</div>
	);
}
