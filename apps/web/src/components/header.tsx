"use client";
import Link from "next/link";
import UserMenu from "@/features/identity/user-menu";
import { ModeToggle } from "./mode-toggle";

export default function Header() {
	const links = [
		{ to: "/", label: "Home" },
		{ to: "/dashboard", label: "Dashboard" },
	] as const;

	return (
		<header className="sticky top-0 z-30 border-border border-b bg-surface/95 backdrop-blur-md">
			<div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
				<div className="flex items-center gap-4 sm:gap-8">
					<Link
						href="/"
						className="focus-ring flex items-center gap-2 rounded-md font-bold tracking-tight"
					>
						<span
							className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm"
							aria-hidden="true"
						>
							R
						</span>
						RESORA
					</Link>
					<nav
						aria-label="Navigasi utama"
						className="flex gap-4 font-medium text-muted-foreground text-sm"
					>
						{links.map(({ to, label }) => {
							return (
								<Link
									key={to}
									href={to}
									className="focus-ring rounded-md hover:text-primary"
								>
									{label}
								</Link>
							);
						})}
					</nav>
				</div>
				<div className="flex items-center gap-2">
					<ModeToggle />
					<UserMenu />
				</div>
			</div>
		</header>
	);
}
