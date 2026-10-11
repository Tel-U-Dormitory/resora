"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AppSidebar } from "@/components/app-sidebar";
import { DashboardHeader } from "@/components/dashboard-header";
import { Button } from "@/components/ui/button";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { useAuth } from "@/config/auth-context";

export function DashboardShell({ children }: { children: React.ReactNode }) {
	const { user, isLoading, isUnauthenticated, error, retry, logout } =
		useAuth();
	const router = useRouter();
	const [logoutError, setLogoutError] = useState<string | null>(null);
	useEffect(() => {
		if (isUnauthenticated) router.replace("/login");
	}, [isUnauthenticated, router]);

	if (isLoading || isUnauthenticated)
		return (
			<div
				role="status"
				className="flex min-h-dvh items-center justify-center text-muted-foreground text-sm"
			>
				Memuat dashboard…
			</div>
		);
	if (error || !user)
		return (
			<main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
				<p role="alert">
					{logoutError ?? error ?? "Profil akun belum tersedia."}
				</p>
				<div className="flex gap-3">
					<Button onClick={retry}>Coba lagi</Button>
					<Button
						variant="outline"
						onClick={() => {
							void logout().catch(() =>
								setLogoutError("Gagal keluar. Silakan coba lagi."),
							);
						}}
					>
						Keluar
					</Button>
				</div>
			</main>
		);

	return (
		<SidebarProvider className="min-h-dvh">
			<a
				href="#dashboard-content"
				className="focus-ring sr-only fixed top-2 left-2 z-[60] rounded-md bg-surface p-3 focus:not-sr-only"
			>
				Lewati ke konten
			</a>
			<AppSidebar />
			<SidebarInset className="min-w-0">
				<DashboardHeader />
				<main id="dashboard-content" className="flex-1" tabIndex={-1}>
					{children}
				</main>
			</SidebarInset>
		</SidebarProvider>
	);
}
