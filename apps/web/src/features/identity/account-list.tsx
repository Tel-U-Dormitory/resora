"use client";

import { Input } from "@resora/ui/components/input";
import { Label } from "@resora/ui/components/label";
import { Select } from "@resora/ui/components/select";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { queryErrorMessage } from "@/utils/request-error";
import { queryClient, trpc } from "@/utils/trpc";
import AccountPasswordReset from "./account-password-reset";
import AccountPeriodManager from "./account-period-manager";

export default function AccountList() {
	const [search, setSearch] = useState("");
	const [departmentCode, setDepartmentCode] = useState("");
	const [status, setStatus] = useState("");
	const [page, setPage] = useState(1);
	const [selected, setSelected] = useState<string[]>([]);
	const references = useQuery({
		...trpc.identity.accountReferences.queryOptions(),
		staleTime: Number.POSITIVE_INFINITY,
		gcTime: Number.POSITIVE_INFINITY,
		refetchOnWindowFocus: false,
		refetchOnReconnect: false,
		retry: false,
		meta: { errorHandledLocally: true },
	});
	const accounts = useQuery({
		...trpc.identity.accountSnapshot.queryOptions(),
		staleTime: Number.POSITIVE_INFINITY,
		gcTime: Number.POSITIVE_INFINITY,
		refetchOnWindowFocus: false,
		refetchOnReconnect: false,
		retry: false,
		meta: { errorHandledLocally: true },
	});
	const filtered = (accounts.data?.accounts ?? []).filter(
		(account) =>
			(!search.trim() ||
				`${account.name} ${account.nim ?? ""}`
					.toLowerCase()
					.includes(search.trim().toLowerCase())) &&
			(!departmentCode || account.departmentCode === departmentCode) &&
			(!status || account.isActive === (status === "active")),
	);
	const total = filtered.length;
	const currentPage = Math.min(page, Math.max(1, Math.ceil(total / 20)));
	const visible = filtered.slice((currentPage - 1) * 20, currentPage * 20);

	return (
		<section className="resora-page space-y-6">
			<div className="flex flex-wrap items-start justify-between gap-4">
				<div className="space-y-2">
					<h1 className="font-bold text-2xl tracking-tight">Kelola akun SR</h1>
					<p className="text-muted-foreground text-sm">
						Cari dan lihat identitas serta status akun Senior Resident.
					</p>
				</div>
				<Link
					href="/admin/users/new"
					className="focus-ring inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 font-semibold text-primary-foreground text-sm hover:bg-primary-hover sm:w-auto"
				>
					<Plus size={17} aria-hidden="true" /> Tambah akun
				</Link>
			</div>
			<AccountPeriodManager
				selected={selected}
				onAssigned={() => setSelected([])}
			/>
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
							<Label htmlFor="account-search">Nama atau NIM</Label>
							<Input
								id="account-search"
								value={search}
								maxLength={100}
								onChange={(event) => {
									setSearch(event.target.value);
									setPage(1);
								}}
								placeholder="Cari akun SR"
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="account-department">Departemen</Label>
							<Select
								id="account-department"
								value={departmentCode}
								onChange={(event) => {
									setDepartmentCode(event.target.value);
									setPage(1);
								}}
								disabled={!references.data}
							>
								<option value="">Semua departemen</option>
								{references.data?.departments.map((row) => (
									<option key={row.code} value={row.code}>
										{row.name}
									</option>
								))}
							</Select>
						</div>
						<div className="space-y-2">
							<Label htmlFor="account-status">Status</Label>
							<Select
								id="account-status"
								value={status}
								onChange={(event) => {
									setStatus(event.target.value);
									setPage(1);
								}}
							>
								<option value="">Semua status</option>
								<option value="active">Aktif</option>
								<option value="inactive">Nonaktif</option>
							</Select>
						</div>
						<Button
							type="button"
							onClick={() => {
								void accounts.refetch();
								void references.refetch();
								void queryClient.invalidateQueries({
									queryKey: trpc.identity.listPeriods.pathKey(),
								});
							}}
							disabled={accounts.isFetching}
							loading={accounts.isFetching}
						>
							Perbarui data
						</Button>
					</form>
					{references.error && (
						<p role="alert" className="mt-3 text-destructive text-sm">
							Filter departemen belum tersedia.{" "}
							<button
								type="button"
								className="focus-ring rounded-md underline"
								onClick={() => references.refetch()}
							>
								Coba kembali
							</button>
						</p>
					)}
				</CardContent>
			</Card>
			{accounts.isPending && (
				<p role="status" className="text-muted-foreground text-sm">
					Memuat akun SR…
				</p>
			)}
			{accounts.error && (
				<Card>
					<CardContent className="space-y-4">
						<p role="alert" className="text-destructive text-sm">
							{queryErrorMessage(accounts.error)}
						</p>
						<Button
							variant="outline"
							disabled={accounts.isFetching}
							loading={accounts.isFetching}
							onClick={() => accounts.refetch()}
						>
							Coba kembali
						</Button>
					</CardContent>
				</Card>
			)}
			{accounts.data && (
				<>
					<Card>
						<CardContent className="overflow-x-auto">
							{total === 0 ? (
								<p className="py-8 text-center text-muted-foreground text-sm">
									Tidak ada akun yang sesuai pencarian.
								</p>
							) : (
								<table className="resora-account-table w-full text-left text-sm">
									<caption className="sr-only">
										Daftar akun Senior Resident
									</caption>
									<thead>
										<tr className="border-border border-b">
											{[
												"Pilih",
												"NIM",
												"Nama / Email",
												"Departemen",
												"Jabatan",
												"Gedung",
												"Periode",
												"Status",
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
												<td data-label="Pilih" className="px-3 py-4">
													<input
														type="checkbox"
														aria-label={`Pilih ${account.name}`}
														checked={selected.includes(account.userId)}
														onChange={(event) =>
															setSelected((current) =>
																event.target.checked
																	? [...current, account.userId]
																	: current.filter(
																			(id) => id !== account.userId,
																		),
															)
														}
													/>
												</td>
												<td
													data-label="NIM"
													className="whitespace-nowrap px-3 py-4"
												>
													{account.nim ?? "—"}
												</td>
												<td data-label="Nama" className="px-3 py-4">
													<p className="font-medium">
														{account.name}
														{account.isSuperadmin && (
															<span className="ml-2 rounded-full bg-primary-soft px-2 py-1 font-semibold text-primary-soft-foreground text-xs">
																SUPERADMIN
															</span>
														)}
													</p>
													<p className="hidden text-muted-foreground sm:block">
														{account.email}
													</p>
													<details className="mt-1 sm:hidden">
														<summary className="focus-ring w-fit cursor-pointer rounded-lg py-2 text-primary">
															Detail akun
														</summary>
														<dl className="space-y-2 py-2 text-sm">
															{[
																["Email", account.email],
																[
																	"Departemen",
																	account.department ?? account.departmentCode,
																],
																[
																	"Jabatan",
																	account.position ?? account.positionCode,
																],
																[
																	"Gedung",
																	account.building ??
																		account.buildingCode ??
																		"—",
																],
															].map(([label, value]) => (
																<div key={label}>
																	<dt className="text-muted-foreground text-xs">
																		{label}
																	</dt>
																	<dd>{value}</dd>
																</div>
															))}
														</dl>
													</details>
												</td>
												<td data-label="Departemen" className="px-3 py-4">
													{account.department ?? account.departmentCode}
												</td>
												<td data-label="Jabatan" className="px-3 py-4">
													{account.position ?? account.positionCode}
												</td>
												<td
													data-label="Gedung"
													className="whitespace-nowrap px-3 py-4"
												>
													{account.building ?? account.buildingCode ?? "—"}
												</td>
												<td data-label="Periode" className="px-3 py-4">
													{account.periods?.length
														? account.periods.map((period) => (
																<p key={period.id}>
																	{period.name}
																	<span className="block text-muted-foreground text-xs">
																		{period.startsOn} – {period.endsOn}
																	</span>
																</p>
															))
														: "Belum ditetapkan"}
												</td>
												<td data-label="Status" className="px-3 py-4">
													<span
														className={`whitespace-nowrap rounded-full px-2.5 py-1 font-semibold text-xs ${account.isActive ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}`}
													>
														{account.isActive ? "Aktif" : "Nonaktif"}
													</span>
												</td>
												<td
													data-label="Tindakan"
													className="min-w-48 px-3 py-4"
												>
													<AccountPasswordReset
														userId={account.userId}
														name={account.name}
													/>
												</td>
											</tr>
										))}
									</tbody>
								</table>
							)}
						</CardContent>
					</Card>
					<div className="flex flex-wrap items-center justify-between gap-3">
						<p className="text-muted-foreground text-sm">
							{total} akun · Halaman {currentPage}
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
		</section>
	);
}
