"use client";

import { Input } from "@resora/ui/components/input";
import { Label } from "@resora/ui/components/label";
import { Select } from "@resora/ui/components/select";
import { useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { queryErrorMessage } from "@/utils/request-error";
import { queryClient, trpc, trpcClient } from "@/utils/trpc";

export default function AccountPeriodManager({
	selected,
	onAssigned,
}: {
	selected: string[];
	onAssigned: () => void;
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
	async function run(operation: () => Promise<unknown>, success: string) {
		if (submitting.current) return;
		submitting.current = true;
		setPending(true);
		setError("");
		setMessage("");
		try {
			await operation();
			setMessage(success);
			await Promise.all([
				queryClient.invalidateQueries({
					queryKey: trpc.identity.listPeriods.pathKey(),
				}),
				queryClient.invalidateQueries({
					queryKey: trpc.identity.accountSnapshot.pathKey(),
				}),
			]);
		} catch (failure) {
			setError(queryErrorMessage(failure));
		} finally {
			submitting.current = false;
			setPending(false);
		}
	}
	return (
		<Card>
			<CardContent className="space-y-4">
				<details>
					<summary className="focus-ring cursor-pointer rounded py-2 font-semibold">
						Kelola periode menjabat
					</summary>
					<form
						className="mt-3 grid gap-3 sm:grid-cols-3"
						onSubmit={(event) => {
							event.preventDefault();
							void run(async () => {
								await trpcClient.identity.createPeriod.mutate({
									name,
									startsOn,
									endsOn,
								});
								setName("");
								setStartsOn("");
								setEndsOn("");
							}, "Periode berhasil dibuat.");
						}}
					>
						<div>
							<Label htmlFor="period-name">Nama / kategori periode</Label>
							<Input
								id="period-name"
								required
								maxLength={100}
								value={name}
								disabled={pending}
								onChange={(event) => setName(event.target.value)}
								placeholder="SR XIV 2026–2027"
							/>
						</div>
						<div>
							<Label htmlFor="period-start">Tanggal mulai (WIB)</Label>
							<Input
								id="period-start"
								type="date"
								required
								value={startsOn}
								disabled={pending}
								onChange={(event) => setStartsOn(event.target.value)}
							/>
						</div>
						<div>
							<Label htmlFor="period-end">
								Tanggal akhir (WIB, termasuk hari ini)
							</Label>
							<Input
								id="period-end"
								type="date"
								min={startsOn || undefined}
								required
								value={endsOn}
								disabled={pending}
								onChange={(event) => setEndsOn(event.target.value)}
							/>
						</div>
						<Button type="submit" disabled={pending}>
							Buat periode
						</Button>
					</form>
				</details>
				<div className="space-y-2">
					<Label htmlFor="assign-period">Periode tujuan</Label>
					<Select
						id="assign-period"
						value={periodId}
						disabled={pending || !periods.data}
						onChange={(event) => {
							setPeriodId(event.target.value);
							setExtension("");
						}}
					>
						<option value="">Pilih periode</option>
						{periods.data?.map((row) => (
							<option key={row.id} value={row.id}>
								{row.name} · {row.startsOn} s.d. {row.endsOn}
							</option>
						))}
					</Select>
				</div>
				<p className="text-muted-foreground text-sm">
					Pilih anggota pada daftar akun, lalu tetapkan periode ini. Anggota
					yang lanjut memakai akun yang sama; riwayat periode sebelumnya tetap
					tersimpan. Akun nonaktif manual tetap nonaktif.
				</p>
				<Button
					disabled={
						pending ||
						!periodId ||
						selected.length === 0 ||
						selected.length > 200
					}
					onClick={() =>
						void run(async () => {
							await trpcClient.identity.assignPeriod.mutate({
								periodId,
								userIds: selected,
							});
							onAssigned();
						}, "Periode anggota berhasil ditetapkan.")
					}
				>
					Tetapkan untuk {selected.length} anggota terpilih
				</Button>
				{period && (
					<details>
						<summary className="focus-ring cursor-pointer rounded py-2">
							Perpanjang tanggal akhir {period.name}
						</summary>
						<p className="text-muted-foreground text-sm">
							Perubahan ini berlaku untuk seluruh anggota periode. Untuk anggota
							tertentu yang lanjut, tetapkan ke periode berikutnya.
						</p>
						<form
							className="mt-3 flex flex-wrap items-end gap-3"
							onSubmit={(event) => {
								event.preventDefault();
								void run(
									() =>
										trpcClient.identity.extendPeriod.mutate({
											periodId,
											endsOn: extension,
										}),
									"Tanggal akhir periode berhasil diperpanjang.",
								);
							}}
						>
							<div>
								<Label htmlFor="period-extension">
									Tanggal akhir baru (WIB)
								</Label>
								<Input
									id="period-extension"
									type="date"
									min={period.endsOn}
									required
									value={extension}
									disabled={pending}
									onChange={(event) => setExtension(event.target.value)}
								/>
							</div>
							<Button
								type="submit"
								disabled={pending || extension <= period.endsOn}
							>
								Perpanjang seluruh periode
							</Button>
						</form>
					</details>
				)}
				{periods.error && (
					<p role="alert">
						{queryErrorMessage(periods.error)}{" "}
						<button
							type="button"
							className="underline"
							onClick={() => void periods.refetch()}
						>
							Coba kembali
						</button>
					</p>
				)}
				{error && (
					<p role="alert" className="text-destructive text-sm">
						{error} Muat ulang data sebelum mencoba lagi bila hasil belum pasti.
					</p>
				)}
				{message && (
					<p role="status" className="text-sm">
						{message}
					</p>
				)}
			</CardContent>
		</Card>
	);
}
