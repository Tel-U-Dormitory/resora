"use client";

import { Input } from "@resora/ui/components/input";
import { Label } from "@resora/ui/components/label";
import { Select } from "@resora/ui/components/select";
import { useQuery } from "@tanstack/react-query";
import { type ReactNode, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { queryErrorMessage } from "@/utils/request-error";
import { queryClient, trpc, trpcClient } from "@/utils/trpc";
import { AccountModal } from "./account-modal";

export default function AccountPeriodManager({
	selected,
	onAssigned,
	onPeriodChange,
	children,
}: {
	selected: string[];
	onAssigned: () => void;
	onPeriodChange: (id: string) => void;
	children: ReactNode;
}) {
	const periods = useQuery({
		...trpc.identity.listPeriods.queryOptions(),
		staleTime: Number.POSITIVE_INFINITY,
		gcTime: Number.POSITIVE_INFINITY,
		refetchOnWindowFocus: false,
		refetchOnReconnect: false,
		retry: false,
		meta: { errorHandledLocally: true },
	});
	const snapshot = useQuery({
		...trpc.identity.accountSnapshot.queryOptions(),
		staleTime: Number.POSITIVE_INFINITY,
		gcTime: Number.POSITIVE_INFINITY,
		refetchOnWindowFocus: false,
		refetchOnReconnect: false,
		retry: false,
		meta: { errorHandledLocally: true },
	});
	const [modal, setModal] = useState<"create" | "extend" | "assign" | null>(
		null,
	);
	const [periodId, setPeriodId] = useState("");
	const [name, setName] = useState("");
	const [startsOn, setStartsOn] = useState("");
	const [endsOn, setEndsOn] = useState("");
	const [extension, setExtension] = useState("");
	const [pending, setPending] = useState(false);
	const [message, setMessage] = useState("");
	const [error, setError] = useState("");
	const submitting = useRef(false);
	const period = periods.data?.find((row) => row.id === periodId);
	function choosePeriod(id: string) {
		setPeriodId(id);
		onPeriodChange(id);
		setExtension("");
		setError("");
		setMessage("");
	}
	function open(action: typeof modal) {
		setError("");
		setModal(action);
	}
	async function run(operation: () => Promise<string>) {
		if (submitting.current) return;
		submitting.current = true;
		setPending(true);
		setError("");
		setMessage("");
		try {
			const success = await operation();
			setMessage(success);
			setModal(null);
			void queryClient.invalidateQueries({
				queryKey: trpc.identity.listPeriods.pathKey(),
			});
			void queryClient.invalidateQueries({
				queryKey: trpc.identity.accountSnapshot.pathKey(),
			});
		} catch (failure) {
			setError(
				`${queryErrorMessage(failure)} Perbarui data sebelum mencoba lagi bila hasil belum pasti.`,
			);
		} finally {
			submitting.current = false;
			setPending(false);
		}
	}
	const selectedAccounts =
		snapshot.data?.accounts.filter((a) => selected.includes(a.userId)) ?? [];
	return (
		<div className="space-y-4">
			<Card>
				<CardContent className="space-y-4">
					<div className="flex flex-wrap items-center justify-between gap-3">
						<h2 className="font-semibold">1. Tentukan periode tujuan</h2>
						<Button
							variant="outline"
							disabled={pending}
							onClick={() => open("create")}
						>
							Tambah periode
						</Button>
					</div>
					<div className="flex flex-wrap items-end gap-3">
						<div className="min-w-0 flex-1 space-y-2">
							<Label htmlFor="assign-period">Periode menjabat</Label>
							<Select
								id="assign-period"
								value={periodId}
								disabled={pending || !periods.data}
								onChange={(e) => choosePeriod(e.target.value)}
							>
								<option value="">Pilih periode</option>
								{periods.data?.map((row) => (
									<option key={row.id} value={row.id}>
										{row.name} · {row.startsOn} – {row.endsOn}
									</option>
								))}
							</Select>
						</div>
						{period && (
							<Button
								variant="outline"
								disabled={pending}
								onClick={() => {
									setExtension("");
									open("extend");
								}}
							>
								Perpanjang tanggal akhir
							</Button>
						)}
					</div>
					<p className="text-muted-foreground text-sm">
						Tanggal mengikuti WIB, termasuk hari terakhir. Untuk SR yang lanjut,
						tambahkan ke periode berikutnya. Perpanjangan tanggal berlaku untuk
						seluruh anggota periode.
					</p>
					{periods.isPending && (
						<p role="status" className="text-sm">
							Memuat periode…
						</p>
					)}
					{periods.data?.length === 0 && (
						<p className="text-muted-foreground text-sm">
							Belum ada periode. Pilih Tambah periode untuk memulai.
						</p>
					)}
					{periods.error && (
						<div role="alert">
							<p className="text-destructive text-sm">
								{queryErrorMessage(periods.error)}
							</p>
							<Button variant="outline" onClick={() => void periods.refetch()}>
								Coba kembali
							</Button>
						</div>
					)}
				</CardContent>
			</Card>
			{children}
			<div className="sticky bottom-3 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface p-4 shadow-lg">
				<p className="text-sm">
					<span className="font-semibold">
						{selected.length} anggota dipilih
					</span>
					<span className="block text-muted-foreground text-xs">
						{period
							? `Tujuan: ${period.name}`
							: "Pilih periode tujuan untuk melanjutkan"}
					</span>
				</p>
				<Button
					disabled={
						pending || !periodId || !selected.length || selected.length > 200
					}
					onClick={() => open("assign")}
				>
					Tinjau penetapan
				</Button>
			</div>
			{message && (
				<p role="status" className="text-sm">
					{message}
				</p>
			)}
			{modal === "create" && (
				<AccountModal
					title="Buat periode menjabat"
					description="Nama kategori membantu administrator mengenali angkatan SR."
					busy={pending}
					onClose={() => setModal(null)}
				>
					<form
						className="space-y-4"
						onSubmit={(e) => {
							e.preventDefault();
							void run(async () => {
								const created = await trpcClient.identity.createPeriod.mutate({
									name,
									startsOn,
									endsOn,
								});
								choosePeriod(created.id);
								setName("");
								setStartsOn("");
								setEndsOn("");
								return "Periode dibuat. Lanjutkan dengan memilih anggota.";
							});
						}}
					>
						<div className="space-y-2">
							<Label htmlFor="period-name">Nama / kategori periode</Label>
							<Input
								id="period-name"
								required
								maxLength={100}
								value={name}
								disabled={pending}
								onChange={(e) => setName(e.target.value)}
								placeholder="SR XIV 2026–2027"
							/>
						</div>
						<div className="grid gap-4 sm:grid-cols-2">
							<div className="space-y-2">
								<Label htmlFor="period-start">Tanggal mulai (WIB)</Label>
								<Input
									id="period-start"
									type="date"
									required
									value={startsOn}
									disabled={pending}
									onChange={(e) => setStartsOn(e.target.value)}
								/>
							</div>
							<div className="space-y-2">
								<Label htmlFor="period-end">Tanggal akhir (WIB)</Label>
								<Input
									id="period-end"
									type="date"
									required
									min={startsOn || undefined}
									value={endsOn}
									disabled={pending}
									onChange={(e) => setEndsOn(e.target.value)}
								/>
							</div>
						</div>
						<Button
							type="submit"
							fullWidth
							loading={pending}
							disabled={pending}
						>
							Buat periode
						</Button>
					</form>
					{error && (
						<p role="alert" className="mt-3 text-destructive text-sm">
							{error}
						</p>
					)}
				</AccountModal>
			)}
			{modal === "extend" && period && (
				<AccountModal
					title={`Perpanjang ${period.name}`}
					description={`Tanggal akhir saat ini: ${period.endsOn} (WIB). Perubahan berlaku untuk seluruh anggota periode.`}
					busy={pending}
					onClose={() => setModal(null)}
				>
					<form
						className="space-y-4"
						onSubmit={(e) => {
							e.preventDefault();
							void run(async () => {
								await trpcClient.identity.extendPeriod.mutate({
									periodId,
									endsOn: extension,
								});
								return "Tanggal akhir periode diperpanjang.";
							});
						}}
					>
						<div className="space-y-2">
							<Label htmlFor="period-extension">Tanggal akhir baru (WIB)</Label>
							<Input
								id="period-extension"
								type="date"
								min={period.endsOn}
								required
								value={extension}
								disabled={pending}
								onChange={(e) => setExtension(e.target.value)}
							/>
						</div>
						<Button
							fullWidth
							type="submit"
							loading={pending}
							disabled={pending || extension <= period.endsOn}
						>
							Konfirmasi perpanjangan seluruh anggota
						</Button>
					</form>
					{error && (
						<p role="alert" className="mt-3 text-destructive text-sm">
							{error}
						</p>
					)}
				</AccountModal>
			)}
			{modal === "assign" && period && (
				<AccountModal
					title="Tinjau penetapan periode"
					description={`${selected.length} anggota akan ditambahkan ke ${period.name}, ${period.startsOn} – ${period.endsOn} (WIB).`}
					busy={pending}
					onClose={() => setModal(null)}
				>
					<div className="space-y-4">
						<ul className="max-h-48 space-y-2 overflow-y-auto rounded-xl border border-border p-3 text-sm">
							{selectedAccounts.map((a) => (
								<li key={a.userId}>
									{a.name}{" "}
									<span className="text-muted-foreground">
										· {a.nim}
										{!a.isActive && " · Diarsipkan manual"}
									</span>
								</li>
							))}
						</ul>
						<p className="text-muted-foreground text-sm">
							Riwayat periode sebelumnya tetap tersimpan. Keanggotaan yang sudah
							ada tidak digandakan. Akun yang diarsipkan manual tetap nonaktif.
						</p>
						<Button
							fullWidth
							loading={pending}
							disabled={pending}
							onClick={() =>
								void run(async () => {
									const result = await trpcClient.identity.assignPeriod.mutate({
										periodId,
										userIds: selected,
									});
									onAssigned();
									return `${result.assigned} anggota baru ditetapkan ke periode.`;
								})
							}
						>
							Konfirmasi penetapan
						</Button>
						{error && (
							<p role="alert" className="text-destructive text-sm">
								{error}
							</p>
						)}
					</div>
				</AccountModal>
			)}
		</div>
	);
}
