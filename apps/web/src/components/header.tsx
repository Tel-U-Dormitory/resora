"use client";
import { Button } from "@resora/ui/components/button";
import Image from "next/image";
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
						<Image
							src="/Logo-Teldorm.png"
							alt=""
							width={937}
							height={1024}
							className="h-10 w-auto shrink-0 object-contain sm:h-12"
						/>
						RESORA
					</Link>
					<nav
						aria-label="Navigasi utama"
						className="flex gap-4 font-medium text-muted-foreground text-sm"
					>
						<Button
							render={<a href="#fitur" />}
							variant="ghost"
							className="hidden rounded-full md:inline-flex"
						>
							Fitur
						</Button>
						{session && (
							<Button
								render={<Link href="/dashboard" />}
								variant="secondary"
								className="rounded-full"
							>
								Dashboard
							</Button>
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
