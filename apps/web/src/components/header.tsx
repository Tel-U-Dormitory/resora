"use client";
import Link from "next/link";
import UserMenu from "@/features/identity/user-menu";
import { authClient } from "@/lib/auth-client";
import { ModeToggle } from "./mode-toggle";

export default function Header() {
	const { data: session } = authClient.useSession();

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
						<a
							href="#fitur"
							className="focus-ring hidden rounded-md hover:text-primary md:inline"
						>
							Fitur
						</a>
						{session && (
							<Link
								href="/dashboard"
								className="focus-ring rounded-md hover:text-primary"
							>
								Dashboard
							</Link>
						)}
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
