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
	type Broadcast,
	type BroadcastAction,
	broadcastError,
	safeBroadcastLink,
} from "./broadcast-ui";

export default function BroadcastFeed({
	view,
	canManage,
	preview,
}: {
	view: "LATEST" | "ACTIVE" | "HISTORY";
	canManage: boolean;
	preview?: Array<
		Pick<
			Broadcast,
			"id" | "title" | "content" | "creatorName" | "publishedAt" | "expiresAt"
		>
	>;
}) {
	const previewItems =
		process.env.NODE_ENV === "production" ? undefined : preview;
	const synthetic = previewItems !== undefined;
	const [page, setPage] = useState(0);
	const [search, setSearch] = useState("");
	const [action, setAction] = useState<BroadcastAction | null>(null);
	const [deckExpanded, setDeckExpanded] = useState(false);
	const latest = useQuery({
		...trpc.broadcast.latest.queryOptions(),
		enabled: !synthetic && view === "LATEST",
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
		enabled: !synthetic && view !== "LATEST",
		staleTime: 0,
		refetchOnMount: "always",
		placeholderData: undefined,
		meta: { errorHandledLocally: true },
	});
	const query = view === "LATEST" ? latest : list;
	const items = previewItems
		? previewItems.map((item) => ({
				...item,
				linkUrl: null,
				archivedAt: null,
				status: "ACTIVE" as const,
				canEdit: false,
				canArchive: false,
			}))
		: view === "LATEST"
			? latest.data?.slice(0, 3)
			: list.data?.items;
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
				view === "LATEST"
					? "space-y-3 rounded-2xl border border-border bg-surface p-4 sm:p-5"
					: "resora-page resora-inbox space-y-4"
			}
			aria-label={heading}
		>
			<div className="flex items-center justify-between gap-2">
				<div className="min-w-0">
					{view === "LATEST" ? (
						<h2 className="font-bold text-base">{heading}</h2>
					) : (
						<div className="space-y-0.5">
							<h1 className="font-bold text-xl tracking-tight sm:text-2xl">
								{heading}
							</h1>
							<p className="hidden text-muted-foreground text-xs sm:block">
								{view === "HISTORY"
									? "Arsip pengumuman kedaluwarsa dan yang diarsipkan."
									: "Informasi terbaru untuk Senior Resident."}
							</p>
						</div>
					)}
				</div>
				<div className="flex shrink-0 items-center gap-2">
					{view === "LATEST" && deckExpanded && Boolean(displayed?.length) && (
						<button
							type="button"
							onClick={() => setDeckExpanded(false)}
							className="focus-ring rounded-lg px-2 py-1 font-bold text-foreground text-xs hover:bg-surface-subtle"
						>
							Tampilkan ringkas
						</button>
					)}
					{!synthetic &&
						canManage &&
						view !== "HISTORY" &&
						Boolean(displayed?.length) && (
							<Button onClick={() => setAction({ kind: "create" })}>
								Buat Pengumuman
							</Button>
						)}
					{!synthetic && (
						<Link
							className="focus-ring inline-flex min-h-9 items-center rounded-xl border border-border bg-surface px-3 font-semibold text-foreground text-xs hover:bg-surface-subtle"
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
					)}
				</div>
			</div>
			{view !== "LATEST" && (Boolean(items?.length) || Boolean(keyword)) && (
				<div className="space-y-1">
					<Label htmlFor="inbox-search" className="sr-only">
						Cari di halaman ini
					</Label>
					<div className="relative">
						<svg
							aria-hidden="true"
							viewBox="0 0 20 20"
							fill="none"
							stroke="currentColor"
							strokeWidth="1.75"
							className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground"
						>
							<circle cx="9" cy="9" r="6" />
							<path d="m14 14 3.5 3.5" />
						</svg>
						<Input
							id="inbox-search"
							type="search"
							value={search}
							onChange={(event) => setSearch(event.target.value)}
							placeholder="Cari pengumuman…"
							aria-describedby="inbox-search-hint"
							className="rounded-xl pl-10"
						/>
					</div>
					<p id="inbox-search-hint" className="sr-only">
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
			{(!synthetic && query.isPending) ||
			(view !== "LATEST" && list.data && page > lastPage) ? (
				<p role="status">Memuat pengumuman…</p>
			) : !synthetic && query.isError ? (
				<div role="alert" className="space-y-3">
					<p>{broadcastError(query.error)}</p>
					<Button variant="outline" onClick={() => void query.refetch()}>
						Coba kembali
					</Button>
				</div>
			) : (
				<>
					{view !== "LATEST" && total > 0 && (
						<p role="status" className="text-muted-foreground text-xs">
							{keyword
								? `${displayed?.length ?? 0} hasil di halaman ini · `
								: ""}
							{total} pengumuman
						</p>
					)}
					{!displayed?.length ? (
						<Card>
							<CardContent className="flex flex-col items-center justify-center px-4 py-6 text-center">
								<svg
									aria-hidden="true"
									viewBox="0 0 96 80"
									fill="none"
									className="mx-auto mb-3 h-16 w-20 shrink-0"
								>
									<rect
										x="16"
										y="20"
										width="64"
										height="44"
										rx="12"
										fill="#EBE9FE"
										stroke="#A58BFF"
										strokeWidth="2"
									/>
									<path
										d="M18 26l30 20 30-20"
										stroke="#5B4FE9"
										strokeWidth="2.5"
										strokeLinecap="round"
										strokeLinejoin="round"
									/>
									<circle cx="72" cy="22" r="9" fill="#FF6F6F" />
									<path
										d="M72 18v5m0 3h.01"
										stroke="#FFFFFF"
										strokeWidth="2.2"
										strokeLinecap="round"
									/>
								</svg>
								<p className="font-bold text-foreground text-sm">
									{items?.length && keyword
										? "Tidak ada pengumuman yang cocok di halaman ini."
										: view === "HISTORY"
											? "Belum ada riwayat pengumuman."
											: "Belum ada pengumuman aktif."}
								</p>
								<p className="mt-1 max-w-xs text-muted-foreground text-xs">
									{items?.length && keyword
										? "Ubah kata kunci atau hapus pencarian untuk melihat semua pengumuman."
										: view === "HISTORY"
											? "Pengumuman yang kedaluwarsa atau diarsipkan akan tampil di sini."
											: !synthetic && canManage
												? "Mulai terbitkan pengumuman baru untuk seluruh Senior Resident."
												: "Informasi terbaru dari pengurus akan muncul di sini."}
								</p>
								{keyword ? (
									<div className="mt-4">
										<Button variant="outline" onClick={() => setSearch("")}>
											Hapus pencarian
										</Button>
									</div>
								) : (
									!synthetic &&
									canManage &&
									view !== "HISTORY" && (
										<div className="mt-4">
											<Button onClick={() => setAction({ kind: "create" })}>
												Buat Pengumuman
											</Button>
										</div>
									)
								)}
							</CardContent>
						</Card>
					) : (
						<>
							<div
								className={
									view === "LATEST"
										? "resora-broadcast-deck"
										: "resora-inbox-list grid min-w-0 gap-2.5"
								}
								data-collapsed={
									view === "LATEST" && !deckExpanded ? "true" : undefined
								}
							>
								{displayed?.map((item, index) => {
									const link = safeBroadcastLink(item.linkUrl);
									if (view === "LATEST") {
										return (
											<Card
												key={item.id}
												className="resora-broadcast-card min-w-0"
											>
												<CardContent className="flex flex-col gap-3 p-3.5 sm:p-4">
													<div className="flex items-center justify-between gap-3.5">
														<div className="min-w-0 flex-1 space-y-1">
															<ItemHeading className="line-clamp-1 font-bold text-foreground text-sm leading-snug">
																{item.title}
															</ItemHeading>
															<p
																className={
																	deckExpanded
																		? "whitespace-pre-wrap break-words text-muted-foreground text-xs [overflow-wrap:anywhere]"
																		: "line-clamp-1 text-muted-foreground text-xs"
																}
															>
																{item.content}
															</p>
														</div>
														<span
															className="resora-broadcast-badge"
															data-tone={index % 3}
															aria-hidden="true"
														>
															<svg
																aria-hidden="true"
																viewBox="0 0 24 24"
																fill="none"
																stroke="currentColor"
																strokeWidth="2"
																strokeLinecap="round"
																strokeLinejoin="round"
																className="size-5"
															>
																{index % 3 === 1 ? (
																	<>
																		<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
																		<path d="M13.73 21a2 2 0 0 1-3.46 0" />
																	</>
																) : index % 3 === 2 ? (
																	<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
																) : (
																	<>
																		<path d="m3 11 18-5v12L3 14v-3z" />
																		<path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" />
																	</>
																)}
															</svg>
														</span>
													</div>
													{deckExpanded && (
														<div className="space-y-2 border-border border-t pt-2.5">
															<div className="flex flex-wrap gap-x-3 gap-y-1 text-muted-foreground text-xs">
																<span>Oleh {item.creatorName}</span>
																<span>
																	Diterbitkan:{" "}
																	{formatEventTime(item.publishedAt)}
																</span>
																<span>
																	Berlaku hingga:{" "}
																	{formatEventTime(item.expiresAt)}
																</span>
															</div>
															<div className="flex flex-wrap items-center gap-2">
																{synthetic ? (
																	<details className="w-full">
																		<summary className="focus-ring min-h-10 cursor-pointer rounded-xl border border-border px-3 py-2 text-xs">
																			Baca selengkapnya
																		</summary>
																		<p className="mt-2 whitespace-pre-wrap text-xs">
																			{item.content}
																		</p>
																	</details>
																) : (
																	<Button
																		variant="outline"
																		onClick={() =>
																			setAction({ kind: "detail", id: item.id })
																		}
																	>
																		Baca Selengkapnya
																	</Button>
																)}
																{link && (
																	<a
																		href={link}
																		target="_blank"
																		rel="noopener noreferrer"
																		className="focus-ring inline-flex min-h-10 items-center rounded-lg px-2 font-semibold text-primary text-xs"
																	>
																		Informasi tambahan
																	</a>
																)}
															</div>
															{item.status === "ACTIVE" &&
																(item.canEdit || item.canArchive) && (
																	<div className="flex flex-wrap gap-2 pt-1">
																		{item.canEdit && (
																			<Button
																				variant="outline"
																				onClick={() =>
																					setAction({
																						kind: "edit",
																						id: item.id,
																					})
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
																)}
														</div>
													)}
												</CardContent>
											</Card>
										);
									}
									return (
										<Card key={item.id} className="min-w-0">
											<CardContent className="flex min-w-0 flex-col gap-2.5">
												<div className="flex items-start gap-3">
													<span
														className="resora-broadcast-badge"
														data-tone={index % 3}
														aria-hidden="true"
													>
														<svg
															aria-hidden="true"
															viewBox="0 0 24 24"
															fill="none"
															stroke="currentColor"
															strokeWidth="2"
															strokeLinecap="round"
															strokeLinejoin="round"
															className="size-5"
														>
															{index % 3 === 1 ? (
																<>
																	<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
																	<path d="M13.73 21a2 2 0 0 1-3.46 0" />
																</>
															) : index % 3 === 2 ? (
																<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
															) : (
																<>
																	<path d="m3 11 18-5v12L3 14v-3z" />
																	<path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" />
																</>
															)}
														</svg>
													</span>
													<div className="min-w-0 flex-1 space-y-0.5">
														<div className="flex items-center justify-between gap-2">
															<ItemHeading className="truncate font-bold text-foreground text-sm">
																{item.title}
															</ItemHeading>
															{view === "HISTORY" && (
																<span className="shrink-0 rounded-full bg-surface-subtle px-2 py-0.5 font-medium text-[11px] text-muted-foreground">
																	{item.archivedAt
																		? "Diarsipkan"
																		: "Kedaluwarsa"}
																</span>
															)}
														</div>
														<p className="truncate text-muted-foreground text-xs">
															{item.creatorName} ·{" "}
															{formatEventTime(item.publishedAt)}
														</p>
													</div>
												</div>
												<p className="line-clamp-2 whitespace-pre-line break-words text-muted-foreground text-xs [overflow-wrap:anywhere]">
													{item.content}
												</p>
												<div className="sr-only">
													<p>
														Berlaku hingga: {formatEventTime(item.expiresAt)}
													</p>
													{item.archivedAt && (
														<p>
															Diarsipkan: {formatEventTime(item.archivedAt)}
														</p>
													)}
												</div>
												<div className="flex flex-wrap items-center justify-between gap-2 border-border border-t pt-2">
													<div className="flex flex-wrap items-center gap-2">
														{synthetic ? (
															<details className="w-full">
																<summary className="focus-ring min-h-9 cursor-pointer rounded-xl border border-border px-3 py-2 text-xs">
																	Baca selengkapnya
																</summary>
																<p className="mt-2 whitespace-pre-wrap text-xs">
																	{item.content}
																</p>
															</details>
														) : (
															<Button
																variant="outline"
																onClick={() =>
																	setAction({ kind: "detail", id: item.id })
																}
															>
																Baca Selengkapnya
															</Button>
														)}
														{link && (
															<a
																href={link}
																target="_blank"
																rel="noopener noreferrer"
																className="focus-ring inline-flex min-h-9 items-center rounded-lg px-2 font-semibold text-primary text-xs"
															>
																Tautan
															</a>
														)}
													</div>
													{view !== "HISTORY" &&
														item.status === "ACTIVE" &&
														(item.canEdit || item.canArchive) && (
															<details>
																<summary className="focus-ring inline-flex min-h-9 cursor-pointer list-none items-center rounded-lg border border-border px-2.5 py-1.5 font-semibold text-muted-foreground text-xs hover:bg-surface-subtle hover:text-foreground">
																	Kelola
																</summary>
																<div className="mt-2 flex flex-wrap gap-2">
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
												</div>
											</CardContent>
										</Card>
									);
								})}
							</div>
							{view === "LATEST" && !deckExpanded && (
								<button
									type="button"
									onClick={() => setDeckExpanded(true)}
									className="resora-broadcast-more-btn focus-ring"
								>
									{displayed.length > 1
										? `Tampilkan ${displayed.length - 1} lainnya`
										: "Tampilkan detail"}
								</button>
							)}
						</>
					)}
					{view !== "LATEST" && total > 0 && (
						<nav
							aria-label="Halaman pengumuman"
							className="flex items-center justify-between gap-2"
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
							<span className="whitespace-nowrap text-muted-foreground text-xs">
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
