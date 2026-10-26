"use client";

import { DateTimePicker } from "@resora/ui/components/date-time-picker";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogTitle,
} from "@resora/ui/components/dialog";
import { Input } from "@resora/ui/components/input";
import { Label } from "@resora/ui/components/label";
import { Textarea } from "@resora/ui/components/textarea";
import { useQuery } from "@tanstack/react-query";
import { type RefObject, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { queryClient, trpc, trpcClient } from "@/utils/trpc";
import { formatEventTime, toWibDateTimeInput } from "../attendance/event-ui";
import {
	type Broadcast,
	type BroadcastAction,
	type BroadcastFields,
	broadcastError,
	broadcastInput,
	broadcastNeedsRefresh,
	safeBroadcastLink,
} from "./broadcast-ui";

export function BroadcastBody({ item }: { item: Broadcast }) {
	const link = safeBroadcastLink(item.linkUrl);
	return (
		<div className="min-w-0 space-y-4">
			<p className="whitespace-pre-wrap break-words text-sm [overflow-wrap:anywhere]">
				{item.content}
			</p>
			<div className="space-y-1 text-muted-foreground text-xs">
				<p className="break-words">Oleh {item.creatorName}</p>
				<p>Diterbitkan: {formatEventTime(item.publishedAt)}</p>
				<p>Berlaku hingga: {formatEventTime(item.expiresAt)}</p>
				{item.archivedAt && (
					<p>Diarsipkan: {formatEventTime(item.archivedAt)}</p>
				)}
			</div>
			{link && (
				<a
					href={link}
					target="_blank"
					rel="noopener noreferrer"
					className="focus-ring inline-flex min-h-11 items-center rounded-lg font-semibold text-primary text-sm"
				>
					Buka informasi tambahan
				</a>
			)}
		</div>
	);
}

export function BroadcastForm({
	action,
	initial,
	current,
	submitting,
	onClose,
}: {
	action: BroadcastAction;
	initial: Broadcast | null;
	current: Broadcast | null;
	submitting: RefObject<boolean>;
	onClose: () => void;
}) {
	const [fields, setFields] = useState<BroadcastFields>({
		title: initial?.title ?? "",
		content: initial?.content ?? "",
		linkUrl: initial?.linkUrl ?? "",
		expiry: initial ? toWibDateTimeInput(initial.expiresAt, true) : "",
	});
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState("");
	const archive = action.kind === "archive";
	const permitted =
		action.kind === "create" ||
		(current?.status === "ACTIVE" &&
			(archive ? current.canArchive : current.canEdit));
	return (
		<form
			className="mt-5 min-w-0 space-y-4"
			onSubmit={async (event) => {
				event.preventDefault();
				if (submitting.current || !permitted) return;
				submitting.current = true;
				setBusy(true);
				setError("");
				try {
					if (action.kind === "archive")
						await trpcClient.broadcast.archive.mutate({
							broadcastId: action.id,
						});
					else {
						const input = broadcastInput(fields, initial?.expiresAt);
						if (action.kind === "create")
							await trpcClient.broadcast.create.mutate(input);
						else if (action.kind === "edit")
							await trpcClient.broadcast.update.mutate({
								broadcastId: action.id,
								...input,
							});
					}
				} catch (failure) {
					setError(broadcastError(failure));
					if (broadcastNeedsRefresh(failure))
						await queryClient
							.invalidateQueries({ queryKey: trpc.broadcast.pathKey() })
							.catch(() => undefined);
					submitting.current = false;
					setBusy(false);
					return;
				}
				// Refresh failure must not turn a completed write into a reported mutation failure.
				await queryClient
					.invalidateQueries({ queryKey: trpc.broadcast.pathKey() })
					.catch(() => undefined);
				toast.success(
					archive
						? "Pengumuman berhasil diarsipkan."
						: action.kind === "create"
							? "Pengumuman berhasil diterbitkan."
							: "Perubahan pengumuman berhasil disimpan.",
				);
				onClose();
			}}
		>
			{!archive && (
				<fieldset disabled={busy || !permitted} className="min-w-0 space-y-4">
					<div className="space-y-2">
						<Label htmlFor="broadcast-title">Judul</Label>
						<Input
							id="broadcast-title"
							value={fields.title}
							onChange={(e) => setFields({ ...fields, title: e.target.value })}
							required
							maxLength={150}
							pattern=".*\S.*"
						/>
					</div>
					<div className="space-y-2">
						<Label htmlFor="broadcast-content">Isi pengumuman</Label>
						<Textarea
							id="broadcast-content"
							value={fields.content}
							onChange={(e) =>
								setFields({ ...fields, content: e.target.value })
							}
							required
							maxLength={5000}
							rows={6}
						/>
					</div>
					<div className="space-y-2">
						<Label htmlFor="broadcast-link">Link informasi (opsional)</Label>
						<Input
							id="broadcast-link"
							type="url"
							value={fields.linkUrl}
							onChange={(e) =>
								setFields({ ...fields, linkUrl: e.target.value })
							}
							maxLength={2048}
							placeholder="https://"
						/>
					</div>
					<div className="space-y-2">
						<Label htmlFor="broadcast-expiry">
							Berlaku hingga (WIB, opsional)
						</Label>
						<DateTimePicker
							id="broadcast-expiry"
							label="Berlaku hingga (WIB)"
							seconds
							value={fields.expiry}
							onChange={(expiry) => setFields({ ...fields, expiry })}
							disabled={busy || !permitted}
							aria-describedby="broadcast-expiry-hint"
						/>
						<p
							id="broadcast-expiry-hint"
							className="text-muted-foreground text-xs"
						>
							Pengumuman berlaku maksimal 7 hari sejak diterbitkan.{" "}
							{initial
								? "Perubahan isi tidak mengulang masa berlaku. Kosongkan waktu untuk mempertahankan expiry saat ini."
								: "Kosongkan untuk menggunakan masa berlaku 7 hari."}
						</p>
						{initial && (
							<p className="text-muted-foreground text-xs">
								Publikasi pertama: {formatEventTime(initial.publishedAt)}
							</p>
						)}
					</div>
				</fieldset>
			)}
			{!permitted && (
				<p role="alert" className="text-destructive text-sm">
					Pengumuman tidak lagi dapat dikelola. Tutup dialog dan periksa status
					atau akses Anda.
				</p>
			)}
			{error && (
				<p role="alert" className="text-destructive text-sm">
					{error}
				</p>
			)}
			<div className="flex flex-wrap justify-end gap-2">
				<Button
					type="button"
					variant="outline"
					disabled={busy}
					onClick={onClose}
				>
					Batal
				</Button>
				<Button type="submit" disabled={busy || !permitted} loading={busy}>
					{busy
						? "Memproses…"
						: archive
							? "Arsipkan Pengumuman"
							: initial
								? "Simpan Perubahan"
								: "Terbitkan Pengumuman"}
				</Button>
			</div>
		</form>
	);
}

export function BroadcastDialog({
	action,
	onClose,
	onAction,
	readOnly = false,
}: {
	action: BroadcastAction;
	onClose: () => void;
	onAction: (action: BroadcastAction) => void;
	readOnly?: boolean;
}) {
	const submitting = useRef(false);
	const titleRef = useRef<HTMLHeadingElement>(null);
	const [initial, setInitial] = useState<Broadcast | null>(null);
	const query = useQuery({
		...trpc.broadcast.detail.queryOptions({
			broadcastId: action.kind === "create" ? "" : action.id,
		}),
		enabled: action.kind !== "create",
		staleTime: 0,
		refetchOnMount: "always",
		meta: { errorHandledLocally: true },
	});
	useEffect(() => {
		// Initialize an editor only from a successful fetch after opening, not stale cached data.
		if (!initial && query.isSuccess && query.isFetchedAfterMount)
			setInitial(query.data);
	}, [initial, query.data, query.isSuccess, query.isFetchedAfterMount]);
	const current = query.isError ? null : (query.data ?? null);
	const title =
		action.kind === "create"
			? "Buat Pengumuman"
			: action.kind === "edit"
				? "Edit Pengumuman"
				: action.kind === "archive"
					? "Arsipkan Pengumuman"
					: (current?.title ?? "Detail Pengumuman");
	return (
		<Dialog
			open
			onOpenChange={(open) => {
				if (!open && !submitting.current) onClose();
			}}
		>
			<DialogContent className="resora-admin-dialog" initialFocus={titleRef}>
				<DialogTitle
					ref={titleRef}
					tabIndex={-1}
					className="break-words font-semibold text-xl outline-none [overflow-wrap:anywhere]"
				>
					{title}
				</DialogTitle>
				<DialogDescription className="mt-2 break-words text-muted-foreground text-sm [overflow-wrap:anywhere]">
					{action.kind === "archive"
						? `Arsipkan pengumuman “${initial?.title ?? "…"}”? Pengumuman akan hilang dari daftar aktif dan tetap tersedia dalam History. Tindakan ini tidak dapat dibatalkan.`
						: action.kind === "detail"
							? "Informasi pengumuman dan masa berlaku dalam WIB."
							: "Tulis pengumuman plain text untuk seluruh Senior Resident."}
				</DialogDescription>
				{action.kind !== "create" && (
					<div className="mt-4">
						{query.isError ? (
							<div role="alert" className="space-y-2">
								<p>{broadcastError(query.error)}</p>
								<Button variant="outline" onClick={() => void query.refetch()}>
									Coba kembali
								</Button>
							</div>
						) : !query.isFetchedAfterMount || query.isPending ? (
							<p role="status">Memuat pengumuman…</p>
						) : null}
						{action.kind === "detail" &&
							current &&
							query.isFetchedAfterMount && (
								<div className="space-y-4">
									<p className="text-muted-foreground text-sm">
										{current.status === "ACTIVE"
											? "Aktif"
											: current.archivedAt
												? "Diarsipkan"
												: "Kedaluwarsa"}
									</p>
									<BroadcastBody item={current} />
									<div className="flex flex-wrap gap-2">
										{!readOnly &&
											current.status === "ACTIVE" &&
											current.canEdit && (
												<Button
													variant="outline"
													onClick={() =>
														onAction({ kind: "edit", id: current.id })
													}
												>
													Edit
												</Button>
											)}
										{!readOnly &&
											current.status === "ACTIVE" &&
											current.canArchive && (
												<Button
													variant="outline"
													onClick={() =>
														onAction({ kind: "archive", id: current.id })
													}
												>
													Arsipkan
												</Button>
											)}
										<Button variant="outline" onClick={onClose}>
											Tutup
										</Button>
									</div>
								</div>
							)}
					</div>
				)}
				{action.kind !== "create" &&
					(action.kind === "detail"
						? !current || !query.isFetchedAfterMount
						: !initial) && (
						<Button variant="outline" className="mt-4" onClick={onClose}>
							Tutup
						</Button>
					)}
				{action.kind !== "detail" && (action.kind === "create" || initial) && (
					<BroadcastForm
						action={action}
						initial={initial}
						current={current}
						submitting={submitting}
						onClose={onClose}
					/>
				)}
			</DialogContent>
		</Dialog>
	);
}
