"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

import { DashboardHeader } from "@/components/dashboard-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { queryClient, trpc } from "@/utils/trpc";

export default function SrDashboard() {
	const router = useRouter();
	const redirected = useRef(false);
	const data = useQuery({
		...trpc.privateData.queryOptions(),
		retry: false,
		refetchInterval: 30_000,
	});
	useEffect(() => {
		if (!data.error || redirected.current) return;
		if (
			data.error.data?.code === "UNAUTHORIZED" ||
			data.error.message === "PASSWORD_CHANGE_REQUIRED"
		) {
			redirected.current = true;
			queryClient.clear();
			router.replace(
				data.error.message === "PASSWORD_CHANGE_REQUIRED"
					? "/change-password"
					: "/login?reason=session",
			);
			router.refresh();
		}
	}, [data.error, router]);
	if (data.isPending)
		return (
			<div role="status" className="mx-auto max-w-7xl space-y-4 p-6">
				<p>Memuat dashboard…</p>
				<Skeleton className="h-8 w-48" />
				<Skeleton className="h-40 w-full" />
			</div>
		);
	if (data.error)
		return (
			<Card className="mx-auto my-6 max-w-md space-y-4 p-6">
				<p role="alert">Sesi atau layanan tidak tersedia.</p>
				<Button onClick={() => data.refetch()}>Coba kembali</Button>
			</Card>
		);
	return (
		<section className="space-y-6">
			<DashboardHeader />
			<Card>
				<CardContent className="space-y-2">
					<h2 className="font-semibold text-lg">
						Selamat datang, {data.data.user.name}.
					</h2>
					<p className="text-muted-foreground text-sm">
						NIM: {data.data.user.nim}
					</p>
				</CardContent>
			</Card>
		</section>
	);
}
