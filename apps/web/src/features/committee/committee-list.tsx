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
		<section className="resora-page space-y-6">
			<div className="flex flex-wrap items-start justify-between gap-4">
				<div className="space-y-2">
					<h1 className="font-bold text-2xl tracking-tight">
						Kelola kepanitiaan
					</h1>
					<p className="text-muted-foreground text-sm">
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
									<p>Belum ada kepanitiaan yang sesuai.</p>
								) : (
									<ul className="grid gap-4 md:grid-cols-2">
										{data.committees.map((row) => (
											<li
												key={row.id}
												className="min-w-0 space-y-3 rounded-xl border border-border p-4"
											>
												<h2 className="break-words font-semibold">
													{row.name}
												</h2>
												<p className="line-clamp-3 whitespace-pre-wrap break-words text-muted-foreground text-sm">
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
