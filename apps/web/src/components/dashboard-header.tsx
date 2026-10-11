"use client";

import { Logout } from "iconsax-react";
import { useState } from "react";
import { ModeToggle } from "@/components/mode-toggle";
import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useAuth } from "@/config/auth-context";

export function DashboardHeader() {
	const { user, logout } = useAuth();
	const [error, setError] = useState<string | null>(null);
	return (
		<header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-border border-b bg-surface/90 px-4 backdrop-blur-md sm:px-6">
			<div className="flex min-w-0 items-center gap-3">
				<SidebarTrigger />
				<div className="h-5 w-px bg-border" />
				<span className="truncate font-semibold text-sm">Dashboard</span>
			</div>
			<div className="flex shrink-0 items-center gap-3">
				{error && (
					<p role="alert" className="text-danger text-xs">
						{error}
					</p>
				)}
				<span className="hidden text-muted-foreground text-xs sm:block">
					{user?.departmentCode} · {user?.positionName}
				</span>
				<ModeToggle />
				<Button
					variant="ghost"
					size="icon"
					aria-label="Keluar"
					onClick={() => {
						void logout().catch(() => setError("Gagal keluar."));
					}}
				>
					<Logout size={18} />
				</Button>
			</div>
		</header>
	);
}
