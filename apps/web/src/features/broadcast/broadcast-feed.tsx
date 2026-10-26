"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { trpc } from "@/utils/trpc";
import { formatEventTime } from "../attendance/event-ui";
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
	const total = list.data?.total ?? 0;
	const lastPage = Math.max(0, Math.ceil(total / 10) - 1);
	useEffect(() => {
		if (view !== "LATEST" && list.data && page > lastPage) setPage(lastPage);
	}, [view, list.data, page, lastPage]);
	const heading =
		view === "LATEST"
			? "Pengumuman SR"
			: view === "HISTORY"
				? "Riwayat Pengumuman"
				: "Semua Pengumuman";
	return (
		<section
			className={view === "LATEST" ? "space-y-4" : "resora-page space-y-6"}
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
								? "Pengumuman Aktif"
								: "History"}
					</Link>
					{canManage && view !== "HISTORY" && (
						<Button onClick={() => setAction({ kind: "create" })}>
							Buat Pengumuman
						</Button>
					)}
				</div>
			</div>
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
						<p className="text-muted-foreground text-sm">{total} pengumuman.</p>
					)}
					{!items?.length ? (
						<Card>
							<CardContent className="space-y-3">
								<p>
									{view === "HISTORY"
										? "Belum ada riwayat pengumuman."
										: "Belum ada pengumuman aktif."}
								</p>
								{canManage && view !== "HISTORY" && (
									<Button
										variant="outline"
										onClick={() => setAction({ kind: "create" })}
									>
										Buat Pengumuman
									</Button>
								)}
							</CardContent>
						</Card>
					) : (
						<div className="grid min-w-0 gap-4 lg:grid-cols-2 xl:grid-cols-3">
							{items.map((item) => {
								const link = safeBroadcastLink(item.linkUrl);
								return (
									<Card key={item.id} className="min-w-0">
										<CardContent className="flex h-full min-w-0 flex-col gap-4">
											<div className="space-y-2">
												<h3 className="break-words font-semibold [overflow-wrap:anywhere]">
													{item.title}
												</h3>
												{view === "HISTORY" && (
													<p className="text-muted-foreground text-xs">
														{item.archivedAt ? "Diarsipkan" : "Kedaluwarsa"}
													</p>
												)}
												<p className="line-clamp-4 whitespace-pre-wrap break-words text-sm [overflow-wrap:anywhere]">
													{item.content}
												</p>
											</div>
											<div className="space-y-1 text-muted-foreground text-xs">
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
												{view !== "HISTORY" &&
													item.status === "ACTIVE" &&
													item.canEdit && (
														<Button
															variant="outline"
															onClick={() =>
																setAction({ kind: "edit", id: item.id })
															}
														>
															Edit
														</Button>
													)}
												{view !== "HISTORY" &&
													item.status === "ACTIVE" &&
													item.canArchive && (
														<Button
															variant="outline"
															onClick={() =>
																setAction({ kind: "archive", id: item.id })
															}
														>
															Arsipkan
														</Button>
													)}
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
								onClick={() => setPage(page - 1)}
							>
								Sebelumnya
							</Button>
							<span className="text-sm">
								Halaman {Math.min(page, lastPage) + 1} dari {lastPage + 1}
							</span>
							<Button
								variant="outline"
								disabled={page >= lastPage || query.isFetching}
								onClick={() => setPage(page + 1)}
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
