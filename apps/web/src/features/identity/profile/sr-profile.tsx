"use client";

import { Avatar, AvatarFallback } from "@resora/ui/components/avatar";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Moon, Sun } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { queryErrorMessage } from "@/utils/request-error";
import { getPersonalTrpc, queryClient } from "@/utils/trpc";
import PasswordChangeForm from "../auth/password-change-form";

const themes = [
	{ value: "light", label: "Terang", icon: Sun },
	{ value: "dark", label: "Gelap", icon: Moon },
] as const;

export default function SrProfile({ userId }: { userId: string }) {
	const router = useRouter();
	const options = getPersonalTrpc(userId).identity.profile.queryOptions();
	const profile = useQuery({
		...options,
		retry: false,
		staleTime: 0,
		refetchOnMount: "always",
		placeholderData: undefined,
		meta: { errorHandledLocally: true },
	});
	const { theme, setTheme } = useTheme();
	const [mounted, setMounted] = useState(false);
	useEffect(() => setMounted(true), []);
	useEffect(() => {
		if (!profile.error) return;
		if (
			profile.error.data?.code === "UNAUTHORIZED" ||
			profile.error.message === "PASSWORD_CHANGE_REQUIRED"
		) {
			queryClient.clear();
			router.replace(
				profile.error.message === "PASSWORD_CHANGE_REQUIRED"
					? "/change-password"
					: "/login?reason=session",
			);
			router.refresh();
		}
	}, [profile.error, router]);
	if (profile.isPending)
		return (
			<div role="status" className="min-w-0 space-y-4">
				<p className="text-muted-foreground text-sm">Memuat profil…</p>
				{profile.fetchStatus === "paused" && (
					<p role="status">
						Koneksi terputus. Sambungkan internet untuk memuat profil.
					</p>
				)}
				<Skeleton className="h-28 w-full rounded-xl" />
				<Skeleton className="h-64 w-full rounded-xl" />
			</div>
		);
	if (profile.error)
		return (
			<Card>
				<CardContent className="space-y-4">
					<p role="alert" className="text-destructive text-sm">
						{queryErrorMessage(profile.error)}
					</p>
					<Button onClick={() => profile.refetch()}>Coba kembali</Button>
				</CardContent>
			</Card>
		);
	const info = profile.data;
	const fields =
		info.actor === "SR"
			? ([
					["Nama lengkap", info.name],
					["NIM", info.nim],
					["Email", info.email],
					["Departemen", info.department],
					["Jabatan", info.position],
					["Gedung", info.building],
				] as const)
			: ([
					["Nama lengkap", info.name],
					["Username", info.username],
					["Email", info.email],
				] as const);
	return (
		<section className="resora-page resora-profile min-w-0 space-y-6">
			{profile.fetchStatus === "paused" && (
				<p role="status">
					Koneksi terputus. Informasi yang sudah dimuat bisa belum terbaru.
				</p>
			)}
			<div>
				<p className="font-semibold text-primary text-xs uppercase tracking-wider">
					{info.actor === "SR" ? "Akun SR" : "Akun Sistem / SUPERADMIN"}
				</p>
				<h1 className="mt-2 font-bold text-2xl tracking-tight">Profil</h1>
				<p className="mt-2 text-muted-foreground text-sm">
					Informasi akun, keamanan, dan tampilan RESORA kamu.
				</p>
			</div>
			<Card>
				<CardContent className="flex items-center gap-4">
					<Avatar className="size-14">
						<AvatarFallback
							className="bg-primary-soft font-semibold text-lg text-primary-soft-foreground"
							aria-label={info.name}
						>
							{info.name
								.split(/\s+/)
								.filter(Boolean)
								.slice(0, 2)
								.map((part) => part[0]?.toUpperCase())
								.join("")}
						</AvatarFallback>
					</Avatar>
					<div className="min-w-0">
						<h2 className="break-words font-bold text-xl">{info.name}</h2>
						<p className="mt-1 text-muted-foreground text-sm">
							{info.actor === "SR"
								? "Akun Senior Resident"
								: "Akun Sistem / SUPERADMIN"}
						</p>
					</div>
				</CardContent>
			</Card>
			<Card>
				<CardHeader>
					<h2 className="font-bold text-lg">Informasi pribadi</h2>
				</CardHeader>
				<CardContent>
					<dl className="grid gap-5 sm:grid-cols-2">
						{fields.map(([label, value]) => (
							<div key={label}>
								<dt className="text-muted-foreground text-sm">{label}</dt>
								<dd className="mt-1 break-words font-medium">
									{value || "Belum tersedia"}
								</dd>
							</div>
						))}
						<div>
							<dt className="text-muted-foreground text-sm">Status akun</dt>
							<dd className="mt-1 inline-flex rounded-full bg-primary-soft px-3 py-1 font-semibold text-primary-soft-foreground text-sm">
								{info.isActive ? "Aktif" : "Nonaktif"}
							</dd>
						</div>
					</dl>
				</CardContent>
			</Card>
			{info.actor === "SR" && (
				<section aria-label="Kehadiran pribadi" className="space-y-3">
					<h2 className="font-bold text-lg">Kehadiran pribadi</h2>
					<Card className="resora-profile-attendance">
						<CardContent className="space-y-3">
							<div className="space-y-1">
								<h3 className="font-semibold text-base">Ringkasan kehadiran</h3>
								<p className="text-muted-foreground text-sm">
									Cakupan: pribadi · Periode belum tersedia
								</p>
							</div>
							<p>Ringkasan kehadiran belum tersedia.</p>
							<p className="text-muted-foreground text-sm">
								Kamu tetap bisa melihat status dan waktu kehadiran pada setiap
								kegiatan.
							</p>
							<Link
								href="/attendance/history"
								className="focus-ring inline-flex min-h-11 items-center gap-2 rounded-lg py-2 font-semibold text-primary text-sm"
							>
								Lihat riwayat kehadiran{" "}
								<ArrowRight size={18} aria-hidden="true" />
							</Link>
						</CardContent>
					</Card>
				</section>
			)}
			<Card>
				<CardHeader>
					<h2 className="font-bold text-lg">Pengaturan tampilan</h2>
					<p className="mt-1 text-muted-foreground text-sm">
						Pilih tampilan yang nyaman. Preferensi disimpan di perangkat ini.
					</p>
				</CardHeader>
				<CardContent>
					<fieldset className="grid gap-3 sm:grid-cols-3">
						<legend className="sr-only">Tema tampilan</legend>
						{themes.map(({ value, label, icon: Icon }) => (
							<button
								type="button"
								key={value}
								disabled={!mounted}
								aria-pressed={mounted && theme === value}
								onClick={() => setTheme(value)}
								className={`focus-ring flex items-center gap-3 rounded-lg border p-4 text-left font-semibold text-sm transition-colors disabled:opacity-50 ${mounted && theme === value ? "border-primary bg-primary-soft text-primary-soft-foreground" : "border-border hover:bg-muted"}`}
							>
								<Icon size={20} aria-hidden="true" />
								{label}
							</button>
						))}
					</fieldset>
				</CardContent>
			</Card>
			<details className="resora-profile-security rounded-2xl border border-border bg-surface p-4">
				<summary className="focus-ring cursor-pointer rounded-lg py-2 font-semibold">
					Ganti password
				</summary>
				<div className="mt-3">
					<PasswordChangeForm mandatory={false} />
				</div>
			</details>
		</section>
	);
}
