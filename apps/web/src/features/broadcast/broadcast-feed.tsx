"use client";

import { Input } from "@resora/ui/components/input";
import { Label } from "@resora/ui/components/label";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { trpc } from "@/utils/trpc";
import { formatEventTime } from "../../components/event-feedback";
import { BroadcastDialog } from "./broadcast-dialog";
import {
	type BroadcastAction,
	broadcastError,
	safeBroadcastLink,
} from "./broadcast-ui";

export default function BroadcastFeed({
	view,
	canManage,
}: {
	view: "LATEST" | "ACTIVE" | "HISTORY";
	canManage: boolean;
}) {
	const [page, setPage] = useState(0);
	const [search, setSearch] = useState("");
	const [action, setAction] = useState<BroadcastAction | null>(null);
	const latest = useQuery({
		...trpc.broadcast.latest.queryOptions(),
		enabled: view === "LATEST",
		staleTime: 0,
		refetchOnMount: "always",
		placeholderData: undefined,
		meta: { errorHandledLocally: true },
	});
	const list = useQuery({
		...trpc.broadcast.list.queryOptions({
			view: view === "HISTORY" ? "HISTORY" : "ACTIVE",
			limit: 10,
			offset: page * 10,
		}),
		enabled: view !== "LATEST",
		staleTime: 0,
		refetchOnMount: "always",
		placeholderData: undefined,
		meta: { errorHandledLocally: true },
	});
	const query = view === "LATEST" ? latest : list;
	const items = view === "LATEST" ? latest.data?.slice(0, 3) : list.data?.items;
	const keyword = search.trim().toLocaleLowerCase("id-ID");
	const displayed =
		view === "LATEST" || !keyword
			? items
			: items?.filter((item) =>
					[item.title, item.content, item.creatorName].some((value) =>
						value.toLocaleLowerCase("id-ID").includes(keyword),
					),
				);
	const ItemHeading = view === "LATEST" ? "h3" : "h2";
	const total = list.data?.total ?? 0;
	const lastPage = Math.max(0, Math.ceil(total / 10) - 1);
	useEffect(() => {
		if (view !== "LATEST" && list.data && page > lastPage) setPage(lastPage);
	}, [view, list.data, page, lastPage]);
	const heading =
		view === "LATEST"
			? "Pengumuman SR"
			: view === "HISTORY"
				? "Riwayat pengumuman"
				: "Inbox";
	return (
		<section
			className={
				view === "LATEST" ? "space-y-4" : "resora-page resora-inbox space-y-6"
			}
			aria-label={heading}
		>
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div className="space-y-2">
					{view === "LATEST" ? (
						<h2 className="font-semibold text-lg">{heading}</h2>
					) : (
						<h1 className="font-bold text-2xl tracking-tight">{heading}</h1>
					)}
					{view !== "LATEST" && (
						<p className="text-muted-foreground text-sm">
							{view === "HISTORY"
								? "Pengumuman kedaluwarsa atau diarsipkan, tersedia untuk dibaca kembali."
								: "Informasi terbaru untuk seluruh Senior Resident."}
						</p>
					)}
				</div>
				<div className="flex flex-wrap items-center gap-2">
					<Link
						className="focus-ring inline-flex min-h-11 items-center rounded-lg px-3 font-semibold text-primary text-sm"
						href={
							view === "LATEST" || view === "HISTORY"
								? "/broadcasts"
								: "/broadcasts/history"
						}
					>
						{view === "LATEST"
							? "Lihat Semua"
							: view === "HISTORY"
								? "Pengumuman aktif"
								: "Riwayat pengumuman"}
					</Link>
				</div>
			</div>
			{canManage && view !== "HISTORY" && (
				<section
					aria-label="Kelola pengumuman"
					className="resora-inbox-management rounded-xl border border-border p-4"
				>
					<div className="space-y-1">
						<h2 className="font-semibold text-sm">Kelola pengumuman</h2>
						<p className="text-muted-foreground text-sm">
							Terbitkan informasi untuk seluruh Senior Resident.
						</p>
					</div>
					<Button onClick={() => setAction({ kind: "create" })}>
						Buat Pengumuman
					</Button>
				</section>
			)}
			{view !== "LATEST" && (
				<div className="space-y-2">
					<Label htmlFor="inbox-search">Cari di halaman ini</Label>
					<Input
						id="inbox-search"
						type="search"
						value={search}
						onChange={(event) => setSearch(event.target.value)}
						placeholder="Judul, isi, atau pengirim"
						aria-describedby="inbox-search-hint"
					/>
					<p id="inbox-search-hint" className="text-muted-foreground text-sm">
						Pencarian hanya mencakup maksimal 10 pengumuman di halaman yang
						sedang dibuka.
					</p>
				</div>
			)}

			{query.fetchStatus === "paused" && (
				<p role="status">
					Koneksi terputus. Informasi yang sudah dimuat bisa belum terbaru.
					Sambungkan internet untuk memperbarui.
				</p>
			)}
			{query.isPending ||
			(view !== "LATEST" && list.data && page > lastPage) ? (
				<p role="status">Memuat pengumuman…</p>
			) : query.isError ? (
				<div role="alert" className="space-y-3">
					<p>{broadcastError(query.error)}</p>
					<Button variant="outline" onClick={() => void query.refetch()}>
						Coba kembali
					</Button>
				</div>
			) : (
				<>
					{view !== "LATEST" && (
						<p role="status" className="text-muted-foreground text-sm">
							{keyword
								? `${displayed?.length ?? 0} hasil di halaman ini. `
								: ""}
							{total} pengumuman dalam daftar.
						</p>
					)}
					{!displayed?.length ? (
						<Card>
							<CardContent className="space-y-3">
								<p>
									{items?.length && keyword
										? "Tidak ada pengumuman yang cocok di halaman ini."
										: view === "HISTORY"
											? "Belum ada riwayat pengumuman."
											: "Belum ada pengumuman aktif."}
								</p>
								{keyword && (
									<Button variant="outline" onClick={() => setSearch("")}>
										Hapus pencarian
									</Button>
								)}
							</CardContent>
						</Card>
					) : (
						<div
							className={
								view === "LATEST"
									? "grid min-w-0 gap-4 lg:grid-cols-2 xl:grid-cols-3"
									: "resora-inbox-list grid min-w-0 gap-4"
							}
						>
							{displayed?.map((item) => {
								const link = safeBroadcastLink(item.linkUrl);
								return (
									<Card key={item.id} className="min-w-0">
										<CardContent className="flex h-full min-w-0 flex-col gap-4">
											<div className="space-y-2">
												<ItemHeading className="break-words font-semibold [overflow-wrap:anywhere]">
													{item.title}
												</ItemHeading>
												{view === "HISTORY" && (
													<p className="text-muted-foreground text-sm">
														{item.archivedAt ? "Diarsipkan" : "Kedaluwarsa"}
													</p>
												)}
												<p className="line-clamp-4 whitespace-pre-wrap break-words text-sm [overflow-wrap:anywhere]">
													{item.content}
												</p>
											</div>
											<div className="space-y-1 text-muted-foreground text-sm">
												<p className="break-words">Oleh {item.creatorName}</p>
												<p>Diterbitkan: {formatEventTime(item.publishedAt)}</p>
												<p>Berlaku hingga: {formatEventTime(item.expiresAt)}</p>
												{item.archivedAt && (
													<p>Diarsipkan: {formatEventTime(item.archivedAt)}</p>
												)}
											</div>
											<div className="mt-auto flex flex-wrap items-center gap-2">
												<Button
													variant="outline"
													onClick={() =>
														setAction({ kind: "detail", id: item.id })
													}
												>
													Baca Selengkapnya
												</Button>
												{link && (
													<a
														href={link}
														target="_blank"
														rel="noopener noreferrer"
														className="focus-ring inline-flex min-h-11 items-center rounded-lg px-2 font-semibold text-primary text-sm"
													>
														Informasi tambahan
													</a>
												)}
											</div>
											{view !== "HISTORY" &&
												item.status === "ACTIVE" &&
												(item.canEdit || item.canArchive) && (
													<details className="border-border border-t pt-2">
														<summary className="focus-ring cursor-pointer rounded-lg py-3 font-semibold text-sm">
															Kelola pengumuman ini
														</summary>
														<div className="flex flex-wrap gap-2">
															{item.canEdit && (
																<Button
																	variant="outline"
																	onClick={() =>
																		setAction({ kind: "edit", id: item.id })
																	}
																>
																	Edit
																</Button>
															)}
															{item.canArchive && (
																<Button
																	variant="outline"
																	onClick={() =>
																		setAction({
																			kind: "archive",
																			id: item.id,
																		})
																	}
																>
																	Arsipkan
																</Button>
															)}
														</div>
													</details>
												)}
										</CardContent>
									</Card>
								);
							})}
						</div>
					)}
					{view !== "LATEST" && (
						<nav
							aria-label="Halaman pengumuman"
							className="flex flex-wrap items-center justify-between gap-3"
						>
							<Button
								variant="outline"
								disabled={page === 0 || query.isFetching}
								onClick={() => {
									setPage(page - 1);
									setSearch("");
								}}
							>
								Sebelumnya
							</Button>
							<span className="text-sm">
								Halaman {Math.min(page, lastPage) + 1} dari {lastPage + 1}
							</span>
							<Button
								variant="outline"
								disabled={page >= lastPage || query.isFetching}
								onClick={() => {
									setPage(page + 1);
									setSearch("");
								}}
							>
								Berikutnya
							</Button>
						</nav>
					)}
				</>
			)}
			{action && (
				<BroadcastDialog
					key={`${action.kind}-${action.kind === "create" ? "new" : action.id}`}
					action={action}
					onClose={() => setAction(null)}
					onAction={setAction}
					readOnly={view === "HISTORY"}
				/>
			)}
		</section>
	);
}
