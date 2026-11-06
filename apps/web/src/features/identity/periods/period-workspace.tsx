"use client";

import { Checkbox } from "@resora/ui/components/checkbox";
import { Input } from "@resora/ui/components/input";
import { Label } from "@resora/ui/components/label";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { queryErrorMessage } from "@/utils/request-error";
import { trpc } from "@/utils/trpc";
import AccountPeriodManager from "./account-period-manager";

export default function PeriodWorkspace() {
	const [periodId, setPeriodId] = useState("");
	const [selected, setSelected] = useState<string[]>([]);
	const [search, setSearch] = useState("");
	const [page, setPage] = useState(1);
	const accounts = useQuery({
		...trpc.identity.accountSnapshot.queryOptions(),
		staleTime: Number.POSITIVE_INFINITY,
		gcTime: Number.POSITIVE_INFINITY,
		refetchOnWindowFocus: false,
		refetchOnReconnect: false,
		retry: false,
		meta: { errorHandledLocally: true },
	});
	const filtered = (accounts.data?.accounts ?? []).filter((a) =>
		`${a.name} ${a.nim ?? ""}`
			.toLowerCase()
			.includes(search.trim().toLowerCase()),
	);
	const currentPage = Math.min(
		page,
		Math.max(1, Math.ceil(filtered.length / 20)),
	);
	const visible = filtered.slice((currentPage - 1) * 20, currentPage * 20);
	return (
		<section className="resora-page space-y-6">
			<header className="flex flex-wrap justify-between gap-4">
				<div className="space-y-2">
					<h1 className="font-bold text-2xl tracking-tight">
						Periode menjabat
					</h1>
					<p className="text-muted-foreground text-sm">
						Buat periode, pilih anggota, lalu tinjau penetapan sebelum
						menyimpan.
					</p>
				</div>
				<Link
					href="/admin/users"
					className="focus-ring rounded-lg p-3 text-primary text-sm underline"
				>
					Kelola akun SR
				</Link>
			</header>
			<AccountPeriodManager
				selected={selected}
				onAssigned={() => setSelected([])}
				onPeriodChange={(id) => {
					setPeriodId(id);
					setSelected([]);
				}}
			>
				<Card>
					<CardContent className="space-y-4">
						<div className="flex flex-wrap items-end justify-between gap-3">
							<div className="w-full space-y-2 sm:max-w-sm">
								<Label htmlFor="period-member-search">
									2. Pilih anggota periode
								</Label>
								<Input
									id="period-member-search"
									placeholder="Cari nama atau NIM"
									value={search}
									onChange={(e) => {
										setSearch(e.target.value);
										setPage(1);
									}}
								/>
							</div>
							<div className="flex flex-wrap gap-2">
								<Button
									variant="outline"
									disabled={
										!periodId || !visible.length || selected.length >= 200
									}
									onClick={() =>
										setSelected((current) =>
											[
												...new Set([
													...current,
													...visible
														.filter(
															(a) => !a.periods.some((p) => p.id === periodId),
														)
														.map((a) => a.userId),
												]),
											].slice(0, 200),
										)
									}
								>
									Pilih halaman ini
								</Button>
								<Button
									variant="ghost"
									disabled={!selected.length}
									onClick={() => setSelected([])}
								>
									Hapus pilihan ({selected.length})
								</Button>
							</div>
						</div>
						<p className="text-muted-foreground text-sm">
							Anggota yang melanjutkan SR tetap memakai akun yang sama. Riwayat
							periode sebelumnya tidak berubah. Maksimal 200 anggota per
							penetapan.
						</p>
						{accounts.isPending && <p role="status">Memuat anggota…</p>}
						{accounts.error && (
							<div role="alert">
								<p>{queryErrorMessage(accounts.error)}</p>
								<Button
									variant="outline"
									onClick={() => void accounts.refetch()}
								>
									Coba kembali
								</Button>
							</div>
						)}
						{accounts.data && !filtered.length && (
							<p className="py-8 text-center text-muted-foreground">
								Tidak ada anggota yang sesuai pencarian.
							</p>
						)}
						<ul className="divide-y divide-border">
							{visible.map((a) => (
								<li key={a.userId} className="flex items-start gap-4 py-4">
									<Checkbox
										id={`member-${a.userId}`}
										className="mt-1 rounded"
										checked={selected.includes(a.userId)}
										disabled={
											!periodId ||
											a.periods.some((p) => p.id === periodId) ||
											(!selected.includes(a.userId) && selected.length >= 200)
										}
										onCheckedChange={(checked) =>
											setSelected((current) =>
												checked
													? [...current, a.userId]
													: current.filter((id) => id !== a.userId),
											)
										}
									/>
									<label
										htmlFor={`member-${a.userId}`}
										className="flex flex-1 cursor-pointer flex-wrap justify-between gap-2 text-sm"
									>
										<span>
											<span className="block font-medium">{a.name}</span>
											<span className="text-muted-foreground">
												{a.nim} · {a.department ?? a.departmentCode}
												{!a.isActive && " · Diarsipkan manual"}
											</span>
										</span>
										<span className="text-muted-foreground">
											{a.periods.some((p) => p.id === periodId) && (
												<span className="block font-medium text-primary">
													Sudah ditetapkan
												</span>
											)}
											{a.periods.length
												? a.periods.map((p) => p.name).join(", ")
												: "Belum ada periode"}
										</span>
									</label>
								</li>
							))}
						</ul>
						<div className="flex items-center justify-between gap-3 text-sm">
							<span>
								{filtered.length} anggota · Halaman {currentPage}
							</span>
							<div className="flex gap-2">
								<Button
									variant="outline"
									disabled={currentPage === 1}
									onClick={() => setPage(currentPage - 1)}
								>
									Sebelumnya
								</Button>
								<Button
									variant="outline"
									disabled={currentPage * 20 >= filtered.length}
									onClick={() => setPage(currentPage + 1)}
								>
									Berikutnya
								</Button>
							</div>
						</div>
					</CardContent>
				</Card>
			</AccountPeriodManager>
		</section>
	);
}
