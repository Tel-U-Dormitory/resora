"use client";

import { Checkbox } from "@resora/ui/components/checkbox";
import { Label } from "@resora/ui/components/label";
import { useQuery } from "@tanstack/react-query";
import { TRPCClientError } from "@trpc/client";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { queryErrorMessage } from "@/utils/request-error";
import { queryClient, trpc, trpcClient } from "@/utils/trpc";
import { AccountModal } from "./account-modal";

function permissionError(error: unknown) {
	if (error instanceof TRPCClientError) {
		switch (error.message) {
			case "SUPERADMIN_REQUIRED":
				return "Hanya Super Admin yang dapat mengelola hak akses.";
			case "PERMISSION_TARGET_INELIGIBLE":
				return "Akun tidak lagi memenuhi syarat untuk menerima izin ini.";
			case "PERMISSION_ALREADY_INTRINSIC":
				return "Izin sudah menjadi izin bawaan jabatan. Grant tambahan tidak diperlukan.";
			case "ACCOUNT_NOT_FOUND":
				return "Akun tidak ditemukan. Tutup dialog dan perbarui daftar akun.";
		}
		if (error.data?.code === "CONFLICT")
			return "Status izin berubah. Periksa data terbaru sebelum mencoba kembali.";
	}
	return queryErrorMessage(error);
}

export default function AccountPermissionsDialog({
	userId,
	onClose,
}: {
	userId: string;
	onClose: () => void;
}) {
	const [desired, setDesired] = useState<boolean | null>(null);
	const [confirm, setConfirm] = useState(false);
	const [pending, setPending] = useState(false);
	const [error, setError] = useState("");
	const [notice, setNotice] = useState("");
	const submitting = useRef(false);
	const options = trpc.identity.accountPermissions.queryOptions({ userId });
	const query = useQuery({
		...options,
		staleTime: 0,
		refetchOnMount: "always",
		retry: false,
		meta: { errorHandledLocally: true },
	});
	// A reopened dialog waits for its own server read, never another target's cache.
	const data =
		query.isFetchedAfterMount && query.data?.target.userId === userId
			? query.data
			: undefined;
	const permission = data?.permission;
	const selected = desired ?? permission?.explicit ?? false;
	const changed = Boolean(permission && selected !== permission.explicit);
	const canSave = Boolean(
		data &&
			changed &&
			(!selected || (permission?.eligibleForGrant && data.catalog.length > 0)),
	);
	const groups = new Map<string, NonNullable<typeof data>["catalog"]>();
	for (const entry of data?.catalog ?? []) {
		const group = groups.get(entry.category) ?? [];
		group.push(entry);
		groups.set(entry.category, group);
	}
	const cleanup = Boolean(
		permission?.explicit && (!data?.catalog.length || permission.intrinsic),
	);
	const select = (checked: boolean) => {
		setDesired(checked);
		setConfirm(false);
		setError("");
		setNotice("");
	};
	return (
		<AccountModal
			title="Kelola Hak Akses"
			description={
				data
					? `Atur izin tambahan untuk ${data.target.name} (${data.target.nim ?? "Tanpa NIM"}).`
					: "Memuat hak akses akun terpilih."
			}
			busy={pending}
			onClose={() => {
				if (!submitting.current) onClose();
			}}
		>
			{query.isError ? (
				<div role="alert" className="space-y-3">
					<p>{permissionError(query.error)}</p>
					<Button variant="outline" onClick={() => void query.refetch()}>
						Coba lagi
					</Button>
				</div>
			) : !data ? (
				<p role="status">Memuat hak akses…</p>
			) : (
				<form
					className="space-y-4 break-words"
					onSubmit={async (event) => {
						event.preventDefault();
						if (submitting.current || !canSave) return;
						if (!selected && permission?.explicit && !confirm) {
							setConfirm(true);
							return;
						}
						submitting.current = true;
						setPending(true);
						setError("");
						setNotice("");
						try {
							const result =
								await trpcClient.identity.setAccountPermission.mutate({
									userId,
									permissionCode: data.permission.code,
									enabled: selected,
								});
							queryClient.setQueryData(options.queryKey, result);
							setDesired(null);
							setConfirm(false);
							setNotice(
								result.changed
									? "Hak akses berhasil diperbarui."
									: "Status izin sudah sesuai dengan data terbaru.",
							);
						} catch (failure) {
							setError(permissionError(failure));
						} finally {
							// Refresh even after conflicts; keep the operator's selection on failure.
							try {
								await queryClient.invalidateQueries(
									{ queryKey: options.queryKey },
									{ throwOnError: true },
								);
							} catch {
								setError(
									"Status terbaru belum dapat dimuat. Coba muat ulang hak akses.",
								);
							}
							submitting.current = false;
							setPending(false);
						}
					}}
				>
					<dl className="grid grid-cols-2 gap-2 text-sm">
						<dt>Nama</dt>
						<dd>{data.target.name}</dd>
						<dt>NIM</dt>
						<dd>{data.target.nim ?? "—"}</dd>
						<dt>Departemen</dt>
						<dd>{data.target.departmentCode ?? "—"}</dd>
						<dt>Jabatan</dt>
						<dd>{data.target.positionCode ?? "—"}</dd>
					</dl>
					{!data.catalog.length && (
						<p className="text-muted-foreground text-sm">
							Belum ada hak akses tambahan yang tersedia untuk departemen ini.
						</p>
					)}
					{Array.from(groups, ([category, entries]) => (
						<fieldset
							key={category}
							className="space-y-3 rounded-xl border p-4"
							disabled={pending}
						>
							<legend className="px-1 font-semibold">
								{entries[0]?.categoryLabel}
							</legend>
							{entries.map((entry) => (
								<div key={entry.code} className="space-y-2">
									<div className="flex items-start gap-3">
										<Checkbox
											id={`permission-${entry.code}`}
											checked={permission?.intrinsic || selected}
											disabled={
												pending ||
												permission?.intrinsic ||
												(!permission?.eligibleForGrant && !permission?.explicit)
											}
											onCheckedChange={select}
										/>
										<div className="min-w-0 space-y-1">
											<Label htmlFor={`permission-${entry.code}`}>
												{entry.label}
											</Label>
											<p className="text-muted-foreground text-sm">
												{entry.description}
											</p>
										</div>
									</div>
									{permission?.intrinsic ? (
										<p className="text-sm">Izin bawaan jabatan</p>
									) : (
										<p className="text-sm">
											Izin eksplisit:{" "}
											{permission?.explicit ? "Diberikan" : "Belum diberikan"}
										</p>
									)}
									<p className="text-muted-foreground text-sm">
										Akses efektif saat ini:{" "}
										{permission?.effective ? "Aktif" : "Tidak aktif"}
									</p>
									{!permission?.eligibleForGrant && !permission?.intrinsic && (
										<p className="text-muted-foreground text-sm">
											{data.target.isActive
												? "Akun belum memenuhi syarat periode aktif, penugasan, atau akses operasional."
												: "Akun tidak aktif."}{" "}
											Grant baru tidak tersedia; izin eksplisit yang tersimpan
											tetap dapat dicabut.
										</p>
									)}
								</div>
							))}
						</fieldset>
					))}
					{cleanup && (
						<fieldset
							className="space-y-2 rounded-xl border p-4"
							disabled={pending}
						>
							<legend className="px-1 font-semibold">
								{permission?.intrinsic
									? "Izin eksplisit tersimpan"
									: "Izin lama tidak berlaku"}
							</legend>
							<div className="flex items-start gap-3">
								<Checkbox
									id="old-permission"
									checked={selected}
									disabled={pending}
									onCheckedChange={select}
								/>
								<Label htmlFor="old-permission">{data.permission.label}</Label>
							</div>
							<p className="text-muted-foreground text-sm">
								Grant tersimpan dapat dicabut.{" "}
								{permission?.intrinsic
									? "Izin bawaan jabatan tetap berlaku."
									: "Grant ini tidak memberi akses di departemen saat ini; dapat berlaku lagi jika akun kembali eligible di HCO."}
							</p>
						</fieldset>
					)}
					{confirm && (
						<div className="space-y-2 rounded-xl border p-4" role="alert">
							<p>{`Cabut izin ${data.permission.label} dari ${data.target.name}?`}</p>
							<p className="text-muted-foreground text-sm">
								Akses melalui grant ini dicabut pada operasi backend berikutnya
								tanpa perlu logout. Izin bawaan jabatan tetap berlaku.
							</p>
							<Button
								variant="outline"
								disabled={pending}
								onClick={() => setConfirm(false)}
							>
								Batal
							</Button>
						</div>
					)}
					<Button
						type="submit"
						fullWidth
						loading={pending}
						disabled={pending || !canSave}
					>
						{confirm ? "Cabut Izin" : "Simpan Perubahan"}
					</Button>
				</form>
			)}
			{error && (
				<p role="alert" className="mt-3 text-destructive text-sm">
					{error}
				</p>
			)}
			{notice && (
				<p role="status" className="mt-3 text-sm">
					{notice}
				</p>
			)}
		</AccountModal>
	);
}
