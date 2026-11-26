"use client";

import { Input } from "@resora/ui/components/input";
import { Label } from "@resora/ui/components/label";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { trpc, trpcClient } from "@/utils/trpc";
import { CommitteeDialog, CommitteeFields } from "./committee-dialog";
import { committeeError } from "./committee-ui";

export default function CommitteeList() {
	const [search, setSearch] = useState("");
	const [page, setPage] = useState(0);
	const [creating, setCreating] = useState(false);
	const query = useQuery({
		...trpc.committee.list.queryOptions({
			search,
			limit: 20,
			offset: page * 20,
		}),
		meta: { errorHandledLocally: true },
	});
	const data = query.data;
	useEffect(() => {
		if (data && page > Math.max(0, Math.ceil(data.total / 20) - 1)) {
			setPage(Math.max(0, Math.ceil(data.total / 20) - 1));
		}
	}, [data, page]);
	return (
		<section className="resora-page resora-committee resora-committee-list space-y-6">
			<div className="flex flex-wrap items-start justify-between gap-4">
				<div className="space-y-1.5">
					<h1 className="font-bold text-2xl tracking-tight">
						Kelola kepanitiaan
					</h1>
					<p className="hidden text-muted-foreground text-sm sm:block">
						Kelola divisi dinamis dan penugasan anggota Senior Resident.
					</p>
				</div>
				<Button onClick={() => setCreating(true)}>Tambah kepanitiaan</Button>
			</div>
			<Card>
				<CardContent className="space-y-4">
					<div className="max-w-lg space-y-2">
						<Label htmlFor="committee-search">Cari nama kepanitiaan</Label>
						<Input
							id="committee-search"
							type="search"
							maxLength={150}
							value={search}
							onChange={(event) => {
								setSearch(event.target.value);
								setPage(0);
							}}
						/>
					</div>
					{query.fetchStatus === "paused" && (
						<p role="status">
							Koneksi terputus. Sambungkan internet untuk memperbarui daftar
							kepanitiaan.
						</p>
					)}
					{query.isPending ? (
						<p role="status">Memuat kepanitiaan…</p>
					) : query.isError ? (
						<div role="alert" className="space-y-3">
							<p>{committeeError(query.error)}</p>
							<Button variant="outline" onClick={() => void query.refetch()}>
								Coba kembali
							</Button>
						</div>
					) : (
						data && (
							<>
								<p className="text-muted-foreground text-sm">
									{data.total} kepanitiaan ditemukan.
								</p>
								{!data.committees.length ? (
									<div className="flex flex-col items-center justify-center px-4 py-8 text-center">
										<svg
											aria-hidden="true"
											viewBox="0 0 96 80"
											fill="none"
											className="mx-auto mb-3 h-16 w-20 shrink-0"
										>
											<circle cx="38" cy="32" r="11" fill="#A58BFF" />
											<path
												d="M20 62c0-9.9 8.1-18 18-18s18 8.1 18 18H20Z"
												fill="#EBE9FE"
											/>
											<circle cx="62" cy="36" r="9" fill="#FFF46E" />
											<path
												d="M48 62c0-7.7 6.3-14 14-14s14 6.3 14 14H48Z"
												fill="#FF6F6F"
											/>
										</svg>
										<h2 className="font-bold text-foreground text-sm sm:text-base">
											Belum ada kepanitiaan yang sesuai.
										</h2>
										<p className="mt-1 max-w-xs text-muted-foreground text-xs sm:text-sm">
											{search
												? "Ubah kata pencarian atau hapus pencarian untuk melihat semua kepanitiaan."
												: "Mulai buat kepanitiaan untuk mengatur divisi dan anggota Senior Resident."}
										</p>
										<div className="mt-4">
											{search ? (
												<Button variant="outline" onClick={() => setSearch("")}>
													Hapus pencarian
												</Button>
											) : (
												<Button onClick={() => setCreating(true)}>
													+ Tambah kepanitiaan
												</Button>
											)}
										</div>
									</div>
								) : (
									<ul className="grid gap-4 md:grid-cols-2">
										{data.committees.map((row) => (
											<li
												key={row.id}
												className="min-w-0 space-y-3 rounded-xl border border-border p-4"
											>
												<h2 className="truncate font-semibold">{row.name}</h2>
												<p className="line-clamp-2 whitespace-pre-wrap break-words text-muted-foreground text-sm">
													{row.description || "Belum ada deskripsi."}
												</p>
												<p className="text-sm">
													{row.divisionCount} divisi · {row.memberCount} anggota
												</p>
												<Link
													className="focus-ring inline-flex min-h-11 items-center rounded-lg px-2 font-semibold text-primary text-sm hover:underline"
													href={`/committees/${row.id}`}
												>
													Lihat dan kelola
												</Link>
											</li>
										))}
									</ul>
								)}
								<nav
									aria-label="Halaman kepanitiaan"
									className="flex flex-wrap items-center justify-between gap-3"
								>
									<Button
										variant="outline"
										disabled={page === 0 || query.isFetching}
										onClick={() => setPage(page - 1)}
									>
										Sebelumnya
									</Button>
									<span className="text-sm">
										Halaman {page + 1} dari{" "}
										{Math.max(1, Math.ceil(data.total / 20))}
									</span>
									<Button
										variant="outline"
										disabled={(page + 1) * 20 >= data.total || query.isFetching}
										onClick={() => setPage(page + 1)}
									>
										Berikutnya
									</Button>
								</nav>
							</>
						)
					)}
				</CardContent>
			</Card>
			{creating && (
				<CommitteeDialog
					title="Tambah kepanitiaan"
					description="Buat kepanitiaan, lalu tambahkan divisi dan anggota."
					onClose={() => setCreating(false)}
					onSubmit={(fields) =>
						trpcClient.committee.create.mutate({
							name: String(fields.get("name") ?? "").trim(),
							description: String(fields.get("description") ?? "").trim(),
						})
					}
				>
					<CommitteeFields />
				</CommitteeDialog>
			)}
		</section>
	);
}
