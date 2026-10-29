"use client";

import { Checkbox } from "@resora/ui/components/checkbox";
import { Input } from "@resora/ui/components/input";
import { Label } from "@resora/ui/components/label";
import { Select } from "@resora/ui/components/select";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@resora/ui/components/tooltip";
import { useQuery } from "@tanstack/react-query";
import { Pencil, ShieldCheck, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { queryErrorMessage } from "@/utils/request-error";
import { queryClient, trpc, trpcClient } from "@/utils/trpc";
import { AccountModal } from "./account-modal";
import AccountPasswordReset from "./account-password-reset";
import AccountPermissionsDialog from "./account-permissions-dialog";

type ManagedAccount = Awaited<
	ReturnType<typeof trpcClient.identity.accountSnapshot.query>
>["accounts"][number];

export default function AccountActions({
	account,
}: {
	account: ManagedAccount;
}) {
	const [action, setAction] = useState<
		"edit" | "archive" | "permissions" | null
	>(null);
	const [notice, setNotice] = useState("");
	return (
		<>
			<div className="flex items-center gap-1">
				<Tooltip>
					<TooltipTrigger
						render={
							<Button
								variant="ghost"
								size="icon"
								className="resora-account-action size-11"
								aria-label={`Edit ${account.name}`}
								onClick={() => {
									setNotice("");
									setAction("edit");
								}}
							/>
						}
					>
						<Pencil size={18} aria-hidden="true" />
					</TooltipTrigger>
					<TooltipContent className="rounded-lg">Edit data akun</TooltipContent>
				</Tooltip>
				<Tooltip>
					<TooltipTrigger
						render={
							<Button
								variant="ghost"
								size="icon"
								className="resora-account-action size-11 text-destructive hover:bg-destructive/10 aria-disabled:opacity-50"
								aria-label={`Hapus dan arsipkan ${account.name}`}
								aria-disabled={!account.isActive}
								onClick={() => {
									setNotice("");
									if (account.isActive) setAction("archive");
								}}
							/>
						}
					>
						<Trash2 size={18} aria-hidden="true" />
					</TooltipTrigger>
					<TooltipContent className="rounded-lg">
						{!account.isActive
							? "Akun sudah diarsipkan manual"
							: "Hapus dan arsipkan akun"}
					</TooltipContent>
				</Tooltip>
				<AccountPasswordReset userId={account.userId} name={account.name} />
				<Tooltip>
					<TooltipTrigger
						render={
							<Button
								variant="ghost"
								size="icon"
								className="resora-account-action size-11"
								aria-label={`Kelola Hak Akses ${account.name} (${account.nim ?? "Tanpa NIM"})`}
								onClick={() => {
									setNotice("");
									setAction("permissions");
								}}
							/>
						}
					>
						<ShieldCheck size={18} aria-hidden="true" />
					</TooltipTrigger>
					<TooltipContent className="rounded-lg">
						Kelola Hak Akses
					</TooltipContent>
				</Tooltip>
			</div>
			{notice && (
				<p
					role="status"
					className="mt-2 max-w-48 text-muted-foreground text-xs"
				>
					{notice}
				</p>
			)}
			{action === "permissions" && (
				<AccountPermissionsDialog
					key={account.userId}
					userId={account.userId}
					onClose={() => setAction(null)}
				/>
			)}
			{(action === "edit" || action === "archive") && (
				<AccountMaintenance
					key={action}
					account={account}
					archive={action === "archive"}
					onClose={() => setAction(null)}
					onSuccess={() => {
						setNotice(
							action === "archive"
								? "Akun diarsipkan. Riwayat tetap tersimpan."
								: "Data akun disimpan.",
						);
						setAction(null);
					}}
				/>
			)}
		</>
	);
}

function AccountMaintenance({
	account,
	archive,
	onClose,
	onSuccess,
}: {
	account: ManagedAccount;
	archive: boolean;
	onClose: () => void;
	onSuccess: () => void;
}) {
	const [expectedUpdatedAt] = useState(() =>
		new Date(account.updatedAt).toISOString(),
	);
	const [name, setName] = useState(account.name);
	const [email, setEmail] = useState(account.email);
	const [departmentCode, setDepartment] = useState(account.departmentCode);
	const [positionCode, setPosition] = useState(account.positionCode);
	const [buildingCode, setBuilding] = useState(account.buildingCode ?? "");
	const [isActive, setActive] = useState(account.isActive);
	const [pending, setPending] = useState(false);
	const [error, setError] = useState("");
	const submitting = useRef(false);
	const refs = useQuery({
		...trpc.identity.accountReferences.queryOptions(),
		enabled: !archive,
		staleTime: Number.POSITIVE_INFINITY,
		gcTime: Number.POSITIVE_INFINITY,
		refetchOnWindowFocus: false,
		refetchOnReconnect: false,
		retry: false,
		meta: { errorHandledLocally: true },
	});
	return (
		<AccountModal
			title={archive ? "Hapus dan arsipkan akun?" : "Edit data akun"}
			description={`${account.name} · ${account.nim ?? "Tanpa NIM"}`}
			busy={pending}
			onClose={onClose}
		>
			<form
				className="space-y-4"
				onSubmit={async (e) => {
					e.preventDefault();
					if (submitting.current) return;
					submitting.current = true;
					setPending(true);
					setError("");
					try {
						const version = {
							userId: account.userId,
							expectedUpdatedAt,
						};
						if (archive)
							await trpcClient.identity.archiveAccount.mutate(version);
						else
							await trpcClient.identity.updateAccount.mutate({
								...version,
								name,
								email,
								departmentCode,
								positionCode,
								buildingCode,
								isActive,
							});
						void queryClient.invalidateQueries({
							queryKey: trpc.identity.accountSnapshot.pathKey(),
						});
						onSuccess();
					} catch (failure) {
						setError(queryErrorMessage(failure));
					} finally {
						submitting.current = false;
						setPending(false);
					}
				}}
			>
				{archive ? (
					<div className="rounded-xl border border-border bg-muted/40 p-4 text-sm">
						<p>
							Akun ini tidak dapat digunakan untuk login dan semua sesi akan
							diakhiri.
						</p>
						<p className="mt-2">
							Data akun, riwayat presensi, audit, dan periode tetap tersimpan.
							Administrator dapat mengaktifkannya kembali melalui Edit data
							akun.
						</p>
					</div>
				) : (
					<>
						<div className="space-y-2">
							<Label htmlFor="edit-name">Nama lengkap</Label>
							<Input
								id="edit-name"
								required
								maxLength={200}
								value={name}
								disabled={pending}
								onChange={(e) => setName(e.target.value)}
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="edit-email">Email</Label>
							<Input
								id="edit-email"
								type="email"
								required
								value={email}
								disabled={pending}
								onChange={(e) => setEmail(e.target.value)}
							/>
						</div>
						<div className="grid gap-4 sm:grid-cols-2">
							<div className="space-y-2">
								<Label htmlFor="edit-department">Departemen</Label>
								<Select
									id="edit-department"
									required
									disabled={pending || !refs.data}
									value={departmentCode}
									onChange={(e) => {
										setDepartment(e.target.value);
										setPosition("");
									}}
								>
									<option value="">Pilih departemen</option>
									{refs.data?.departments.map((r) => (
										<option key={r.code} value={r.code}>
											{r.name}
										</option>
									))}
								</Select>
							</div>
							<div className="space-y-2">
								<Label htmlFor="edit-position">Jabatan</Label>
								<Select
									id="edit-position"
									required
									disabled={pending || !refs.data}
									value={positionCode}
									onChange={(e) => setPosition(e.target.value)}
								>
									<option value="">Pilih jabatan</option>
									{refs.data?.positions
										.filter((r) => r.departmentCodes.includes(departmentCode))
										.map((r) => (
											<option key={r.code} value={r.code}>
												{r.name}
											</option>
										))}
								</Select>
							</div>
						</div>
						<div className="space-y-2">
							<Label htmlFor="edit-building">Gedung</Label>
							<Select
								id="edit-building"
								required
								disabled={pending || !refs.data}
								value={buildingCode}
								onChange={(e) => setBuilding(e.target.value)}
							>
								<option value="">Pilih gedung</option>
								{refs.data?.buildings.map((r) => (
									<option key={r.code} value={r.code}>
										{r.name}
									</option>
								))}
							</Select>
						</div>
						<div className="flex items-center gap-3">
							<Checkbox
								id="edit-active"
								checked={isActive}
								disabled={pending}
								onCheckedChange={setActive}
							/>
							<Label htmlFor="edit-active">Aktifkan akun</Label>
						</div>
						<p className="text-muted-foreground text-xs">
							NIM tetap menjadi identitas login. Akses SR tetap mengikuti
							periode menjabat. Penyimpanan perubahan mengakhiri seluruh sesi
							akun.
						</p>
						{refs.error && (
							<div role="alert">
								<p className="text-destructive text-sm">
									Referensi organisasi gagal dimuat.
								</p>
								<Button variant="outline" onClick={() => void refs.refetch()}>
									Coba kembali
								</Button>
							</div>
						)}
					</>
				)}
				{error && (
					<p role="alert" className="text-destructive text-sm">
						{error}
					</p>
				)}
				<Button
					type="submit"
					variant={archive ? "danger" : "primary"}
					loading={pending}
					disabled={pending || (!archive && !refs.data)}
					fullWidth
				>
					{archive ? "Arsipkan akun" : "Simpan perubahan"}
				</Button>
			</form>
		</AccountModal>
	);
}
