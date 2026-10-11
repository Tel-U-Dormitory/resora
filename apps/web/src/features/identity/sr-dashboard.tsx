"use client";

import { Button } from "@resora/ui/components/button";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

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
			<p role="status" className="p-6">
				Memuat dashboard…
			</p>
		);
	if (data.error)
		return (
			<div className="space-y-4 p-6">
				<p role="alert">Sesi atau layanan tidak tersedia.</p>
				<Button onClick={() => data.refetch()}>Coba kembali</Button>
			</div>
		);
	return (
		<div className="space-y-2 p-6">
			<h1 className="font-bold text-2xl">Dashboard SR</h1>
			<p>Selamat datang, {data.data.user.name}.</p>
			<p className="text-muted-foreground">NIM: {data.data.user.nim}</p>
		</div>
	);
}
