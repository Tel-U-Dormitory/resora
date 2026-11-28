"use client";

import type { AppRouter } from "@resora/api/routers/index";
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
import type { inferRouterOutputs } from "@trpc/server";
import {
	Check,
	Copy,
	KeyRound,
	Pencil,
	Trash2,
	UserCog,
} from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { queryErrorMessage } from "@/utils/request-error";
import { queryClient, trpc, trpcClient } from "@/utils/trpc";
import { AccountModal } from "./account-modal";

type DtAdminAccountsOutput =
	inferRouterOutputs<AppRouter>["dt"]["adminListAccounts"];
type DtAdminAccount = DtAdminAccountsOutput["accounts"][number];
type DtBuildingRef = DtAdminAccountsOutput["buildings"][number];

const MEMBERSHIP_STATUS_TEXT: Record<string, string> = {
	CANDIDATE: "Calon",
	ACTIVE: "Aktif",
	EXPIRED: "Berakhir",
	ENDED: "Diakhiri",
	REJECTED: "Ditolak",
	ARCHIVED: "Diarsipkan",
};

export default function AccountDtPanel() {
	const [search, setSearch] = useState("");
	const [buildingId, setBuildingId] = useState("");
	const [status, setStatus] = useState<"" | "active" | "inactive">("");
	const [page, setPage] = useState(1);

	const query = useQuery({
		...trpc.dt.adminListAccounts.queryOptions(),
		staleTime: Number.POSITIVE_INFINITY,
		gcTime: Number.POSITIVE_INFINITY,
		refetchOnWindowFocus: false,
		refetchOnReconnect: false,
		retry: false,
		meta: { errorHandledLocally: true },
	});

	const buildings = query.data?.buildings ?? [];
	const filtered = (
		query.error ? [] : (query.data?.accounts ?? [])
	).filter((item) => {
		const term = search.trim().toLowerCase();
		if (
			term &&
			!`${item.name} ${item.nim ?? ""} ${item.email}`
				.toLowerCase()
				.includes(term)
		) {
			return false;
		}
		if (buildingId && item.buildingId !== buildingId) {
			return false;
		}
		if (status === "active" && !item.isActive) return false;
		if (status === "inactive" && item.isActive) return false;
		return true;
	});

	const total = filtered.length;
	const currentPage = Math.min(page, Math.max(1, Math.ceil(total / 20)));
	const visible = filtered.slice((currentPage - 1) * 20, currentPage * 20);

	return (
		<div className="space-y-6">
			<Card>
				<CardContent>
					<form
						method="get"
						className="grid items-end gap-4 sm:grid-cols-2 lg:grid-cols-4"
						onSubmit={(event) => {
							event.preventDefault();
							setPage(1);
						}}
					>
						<div className="space-y-2">
							<Label htmlFor="dt-account-search">Nama atau NIM</Label>
							<Input
								id="dt-account-search"
								value={search}
								maxLength={100}
								onChange={(event) => {
									setSearch(event.target.value);
									setPage(1);
								}}
								placeholder="Cari akun DT"
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="dt-account-building">Gedung</Label>
							<Select
								id="dt-account-building"
								value={buildingId}
								onChange={(event) => {
									setBuildingId(event.target.value);
									setPage(1);
								}}
								disabled={!query.data}
							>
								<option value="">Semua gedung</option>
								{buildings.map((row) => (
									<option key={row.id} value={row.id}>
										{row.name}
									</option>
								))}
							</Select>
						</div>
						<div className="space-y-2">
							<Label htmlFor="dt-account-status">Status akun</Label>
							<Select
								id="dt-account-status"
								value={status}
								onChange={(event) => {
									setStatus(event.target.value as "" | "active" | "inactive");
									setPage(1);
								}}
							>
								<option value="">Semua status</option>
								<option value="active">Aktif</option>
								<option value="inactive">Nonaktif / Diarsipkan</option>
							</Select>
						</div>
						<Button
							type="button"
							variant="outline"
							onClick={() => void query.refetch()}
							disabled={query.isFetching}
							loading={query.isFetching}
						>
							Perbarui data
						</Button>
					</form>
				</CardContent>
			</Card>

			{query.isPending && (
				<p role="status" className="text-muted-foreground text-sm">
					Memuat akun Dorm Team…
				</p>
			)}
			{query.error && (
				<Card>
					<CardContent className="space-y-4">
						<p role="alert" className="text-destructive text-sm">
							{queryErrorMessage(query.error)}
						</p>
						<Button
							variant="outline"
							disabled={query.isFetching}
							loading={query.isFetching}
							onClick={() => void query.refetch()}
						>
							Coba kembali
						</Button>
					</CardContent>
				</Card>
			)}

			{!query.error && query.data && (
				<>
					<Card>
						<CardContent className="min-w-0">
							<section
								aria-label="Daftar akun DT"
								// biome-ignore lint/a11y/noNoninteractiveTabindex: Horizontal table overflow supports keyboard scrolling.
								tabIndex={0}
								className="focus-ring resora-admin-account-region overflow-x-auto rounded-xl"
							>
								{total === 0 ? (
									<EmptyState
										variant="folder"
										title="Tidak ada akun DT ditemukan"
										description="Tidak ada akun Dorm Team yang sesuai pencarian atau filter."
										action={
											search || buildingId || status ? (
												<Button
													variant="outline"
													onClick={() => {
														setSearch("");
														setBuildingId("");
														setStatus("");
														setPage(1);
													}}
												>
													Hapus filter
												</Button>
											) : (
												<Link
													href="/dt"
													className="focus-ring inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-primary px-4 py-2 font-semibold text-primary-foreground text-xs hover:bg-primary-hover"
												>
													<UserCog size={15} aria-hidden="true" />
													Daftarkan di Kelola DT
												</Link>
											)
										}
									/>
								) : (
									<>
										<div className="space-y-2.5 md:hidden">
											{visible.map((account) => (
												<article
													key={account.userId}
													className="space-y-2.5 rounded-xl border border-border bg-surface p-3.5"
												>
													<div className="flex items-start justify-between gap-2">
														<div className="min-w-0 flex-1">
															<p className="truncate font-bold text-foreground text-sm">
																{account.name}
															</p>
															<p className="truncate text-muted-foreground text-xs tabular-nums">
																NIM: {account.nim ?? "—"}
															</p>
														</div>
														<span
															className={`shrink-0 whitespace-nowrap rounded-full px-2.5 py-0.5 font-semibold text-xs ${account.isActive ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}`}
														>
															{account.isActive ? "Aktif" : "Diarsipkan"}
														</span>
													</div>
													<p className="truncate text-muted-foreground text-xs">
														{account.buildingName ?? "Belum ada gedung"} ·{" "}
														{account.periodName ?? "Belum ada periode"}
														{account.membershipStatus
															? ` (${MEMBERSHIP_STATUS_TEXT[account.membershipStatus] ?? account.membershipStatus})`
															: ""}
													</p>
													<div className="border-border border-t pt-2">
														<AccountDtActions
															account={account}
															buildings={buildings}
														/>
													</div>
												</article>
											))}
										</div>
										<table className="resora-account-table hidden w-full text-left text-sm md:table">
											<caption className="sr-only">
												Daftar akun Dorm Team
											</caption>
											<thead>
												<tr className="border-border border-b">
													{[
														"NIM",
														"Nama / Email",
														"Gedung",
														"Periode DT",
														"Status Akun",
														"Tindakan",
													].map((heading) => (
														<th
															key={heading}
															scope="col"
															className="px-3 py-3 font-semibold"
														>
															{heading}
														</th>
													))}
												</tr>
											</thead>
											<tbody>
												{visible.map((account) => (
													<tr
														key={account.userId}
														className="border-border border-b last:border-0"
													>
														<td className="whitespace-nowrap px-3 py-4">
															{account.nim ?? "—"}
														</td>
														<td className="px-3 py-4">
															<p className="font-medium">
																{account.name}
																<span className="ml-2 rounded-full border border-border bg-surface-subtle px-2 py-0.5 font-semibold text-muted-foreground text-xs">
																	DT
																</span>
															</p>
															<p className="text-muted-foreground">
																{account.email}
															</p>
														</td>
														<td className="whitespace-nowrap px-3 py-4">
															{account.buildingName ?? "—"}
														</td>
														<td className="px-3 py-4">
															{account.periodName ? (
																<>
																	<p>
																		{account.periodName} ·{" "}
																		{account.membershipStatus
																			? (MEMBERSHIP_STATUS_TEXT[
																					account.membershipStatus
																				] ?? account.membershipStatus)
																			: ""}
																	</p>
																	{account.startsOn && account.endsOn && (
																		<p className="text-muted-foreground text-xs">
																			{account.startsOn} – {account.endsOn}
																		</p>
																	)}
																</>
															) : (
																"Belum ditetapkan"
															)}
														</td>
														<td className="px-3 py-4">
															<span
																className={`whitespace-nowrap rounded-full px-2.5 py-1 font-semibold text-xs ${account.isActive ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}`}
															>
																{account.isActive ? "Aktif" : "Diarsipkan"}
															</span>
														</td>
														<td className="px-3 py-4">
															<AccountDtActions
																account={account}
																buildings={buildings}
															/>
														</td>
													</tr>
												))}
											</tbody>
										</table>
									</>
								)}
							</section>
						</CardContent>
					</Card>

					<div className="flex flex-wrap items-center justify-between gap-3">
						<p className="text-muted-foreground text-sm">
							{total} akun DT · Halaman {currentPage}
						</p>
						<div className="flex gap-2">
							<Button
								variant="outline"
								disabled={currentPage === 1}
								onClick={() => setPage(currentPage - 1)}
							>
								Sebelumnya
							</Button>
							<Button
								variant="outline"
								disabled={currentPage * 20 >= total}
								onClick={() => setPage(currentPage + 1)}
							>
								Berikutnya
							</Button>
						</div>
					</div>
				</>
			)}
		</div>
	);
}

function AccountDtActions({
	account,
	buildings,
}: {
	account: DtAdminAccount;
	buildings: DtBuildingRef[];
}) {
	const [action, setAction] = useState<"edit" | "archive" | "reset" | null>(
		null,
	);
	const [notice, setNotice] = useState("");
	const [tempPassword, setTempPassword] = useState<string | null>(null);

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
								aria-label={`Edit akun DT ${account.name}`}
								onClick={() => {
									setNotice("");
									setAction("edit");
								}}
							/>
						}
					>
						<Pencil size={18} aria-hidden="true" />
					</TooltipTrigger>
					<TooltipContent className="rounded-lg">
						Edit data akun DT
					</TooltipContent>
				</Tooltip>
				<Tooltip>
					<TooltipTrigger
						render={
							<Button
								variant="ghost"
								size="icon"
								className="resora-account-action size-11 text-destructive hover:bg-destructive/10 aria-disabled:opacity-50"
								aria-label={`Arsipkan akun DT ${account.name}`}
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
						{account.isActive
							? "Nonaktifkan dan arsipkan akun DT"
							: "Akun DT sudah diarsipkan"}
					</TooltipContent>
				</Tooltip>
				<Tooltip>
					<TooltipTrigger
						render={
							<Button
								variant="ghost"
								size="icon"
								className="resora-account-action size-11"
								aria-label={`Reset password akun DT ${account.name}`}
								onClick={() => {
									setNotice("");
									setAction("reset");
								}}
							/>
						}
					>
						<KeyRound size={18} aria-hidden="true" />
					</TooltipTrigger>
					<TooltipContent className="rounded-lg">
						Reset password sementara
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
			{(action === "edit" || action === "archive") && (
				<DtAccountMaintenanceDialog
					key={action}
					account={account}
					buildings={buildings}
					archive={action === "archive"}
					onClose={() => setAction(null)}
					onSuccess={() => {
						setNotice(
							action === "archive"
								? "Akun DT dinonaktifkan."
								: "Data akun DT disimpan.",
						);
						setAction(null);
					}}
				/>
			)}
			{action === "reset" && (
				<DtPasswordResetDialog
					account={account}
					temporaryPassword={tempPassword}
					onIssued={setTempPassword}
					onClose={() => {
						setTempPassword(null);
						setAction(null);
					}}
				/>
			)}
		</>
	);
}

function DtAccountMaintenanceDialog({
	account,
	buildings,
	archive,
	onClose,
	onSuccess,
}: {
	account: DtAdminAccount;
	buildings: DtBuildingRef[];
	archive: boolean;
	onClose: () => void;
	onSuccess: () => void;
}) {
	const [expectedUpdatedAt] = useState(() =>
		new Date(account.updatedAt).toISOString(),
	);
	const [name, setName] = useState(account.name);
	const [email, setEmail] = useState(account.email);
	const [buildingId, setBuildingId] = useState(account.buildingId ?? "");
	const [isActive, setActive] = useState(account.isActive);
	const [pending, setPending] = useState(false);
	const [error, setError] = useState("");
	const submitting = useRef(false);
	const canEditBuilding =
		account.membershipStatus === "ACTIVE" ||
		account.membershipStatus === "CANDIDATE";

	return (
		<AccountModal
			title={archive ? "Nonaktifkan akun DT?" : "Edit data akun DT"}
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
						if (archive) {
							await trpcClient.dt.adminArchiveAccount.mutate(version);
						} else {
							await trpcClient.dt.adminUpdateAccount.mutate({
								...version,
								name: name.trim(),
								email: email.trim(),
								buildingId:
									canEditBuilding && buildingId ? buildingId : undefined,
								isActive,
							});
						}
						await Promise.all([
							queryClient.invalidateQueries({
								queryKey: trpc.dt.adminListAccounts.pathKey(),
							}),
							queryClient.invalidateQueries({
								queryKey: trpc.dt.pathKey(),
							}),
						]);
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
							Akun DT ini akan dinonaktifkan dan semua sesi aktif akan dicabut.
						</p>
						<p className="mt-2">
							Riwayat keanggotaan, gedung, kepanitiaan, dan absensi tetap
							tersimpan. Anda dapat mengaktifkannya kembali lewat Edit data akun
							DT.
						</p>
					</div>
				) : (
					<>
						<div className="space-y-2">
							<Label htmlFor="dt-edit-name">Nama lengkap</Label>
							<Input
								id="dt-edit-name"
								required
								maxLength={200}
								value={name}
								disabled={pending}
								onChange={(e) => setName(e.target.value)}
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="dt-edit-email">Email</Label>
							<Input
								id="dt-edit-email"
								type="email"
								required
								value={email}
								disabled={pending}
								onChange={(e) => setEmail(e.target.value)}
							/>
						</div>
						{canEditBuilding && (
							<div className="space-y-2">
								<Label htmlFor="dt-edit-building">Gedung tugas</Label>
								<Select
									id="dt-edit-building"
									required
									disabled={pending}
									value={buildingId}
									onChange={(e) => setBuildingId(e.target.value)}
								>
									<option value="">Pilih gedung</option>
									{buildings.map((b) => (
										<option key={b.id} value={b.id}>
											{b.name}
										</option>
									))}
								</Select>
							</div>
						)}
						<div className="flex items-center gap-3">
							<Checkbox
								id="dt-edit-active"
								checked={isActive}
								disabled={pending}
								onCheckedChange={setActive}
							/>
							<Label htmlFor="dt-edit-active">Aktifkan akun</Label>
						</div>
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
					disabled={pending}
					fullWidth
				>
					{archive ? "Nonaktifkan akun DT" : "Simpan perubahan"}
				</Button>
			</form>
		</AccountModal>
	);
}

function DtPasswordResetDialog({
	account,
	temporaryPassword,
	onIssued,
	onClose,
}: {
	account: DtAdminAccount;
	temporaryPassword: string | null;
	onIssued: (password: string) => void;
	onClose: () => void;
}) {
	const [pending, setPending] = useState(false);
	const [error, setError] = useState("");
	const [copied, setCopied] = useState(false);

	return (
		<AccountModal
			title="Reset password akun DT"
			description={`${account.name} · ${account.nim ?? "Tanpa NIM"}`}
			busy={pending}
			onClose={onClose}
		>
			{temporaryPassword ? (
				<div className="space-y-4">
					<p className="text-muted-foreground text-sm">
						Bagikan password sementara ini secara privat kepada anggota DT.
						Password hanya tampil sekali.
					</p>
					<div className="flex items-center gap-2">
						<Input
							readOnly
							value={temporaryPassword}
							className="font-mono"
							autoComplete="off"
							spellCheck={false}
						/>
						<Button
							type="button"
							variant="outline"
							leftIcon={
								copied ? (
									<Check size={16} aria-hidden="true" />
								) : (
									<Copy size={16} aria-hidden="true" />
								)
							}
							onClick={async () => {
								try {
									await navigator.clipboard.writeText(temporaryPassword);
									setCopied(true);
								} catch {
									setCopied(false);
								}
							}}
						>
							{copied ? "Tersalin" : "Salin"}
						</Button>
					</div>
					<Button fullWidth onClick={onClose}>
						Selesai
					</Button>
				</div>
			) : (
				<div className="space-y-4">
					<p className="text-muted-foreground text-sm">
						Reset password akan mengakhiri seluruh sesi login aktif akun DT ini
						dan mewajibkan ganti password saat login berikutnya.
					</p>
					{error && (
						<p role="alert" className="text-destructive text-sm">
							{error}
						</p>
					)}
					<div className="flex justify-end gap-2">
						<Button
							type="button"
							variant="outline"
							disabled={pending}
							onClick={onClose}
						>
							Batal
						</Button>
						<Button
							type="button"
							loading={pending}
							onClick={async () => {
								setPending(true);
								setError("");
								try {
									const res = await trpcClient.dt.adminResetPassword.mutate({
										userId: account.userId,
									});
									await Promise.all([
										queryClient.invalidateQueries({
											queryKey: trpc.dt.adminListAccounts.pathKey(),
										}),
										queryClient.invalidateQueries({
											queryKey: trpc.dt.pathKey(),
										}),
									]);
									onIssued(res.temporaryPassword);
								} catch (failure) {
									setError(queryErrorMessage(failure));
								} finally {
									setPending(false);
								}
							}}
						>
							Reset password
						</Button>
					</div>
				</div>
			)}
		</AccountModal>
	);
}
