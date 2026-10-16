"use client";

import { Input } from "@resora/ui/components/input";
import { Label } from "@resora/ui/components/label";
import { Select } from "@resora/ui/components/select";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { queryErrorMessage } from "@/utils/request-error";
import { trpc } from "@/utils/trpc";

export default function AccountList() {
	const [searchInput, setSearchInput] = useState("");
	const [search, setSearch] = useState("");
	const [departmentCode, setDepartmentCode] = useState("");
	const [status, setStatus] = useState("");
	const [page, setPage] = useState(1);
	const references = useQuery({
		...trpc.identity.accountReferences.queryOptions(),
		retry: false,
		meta: { errorHandledLocally: true },
	});
	const accounts = useQuery({
		...trpc.identity.listAccounts.queryOptions({
			search,
			page,
			pageSize: 20,
			departmentCode: departmentCode || undefined,
			isActive: status ? status === "active" : undefined,
		}),
		retry: false,
		meta: { errorHandledLocally: true },
	});
	return (
		<section className="space-y-6">
			<div className="flex flex-wrap items-start justify-between gap-4">
				<div className="space-y-2">
					<h1 className="font-bold text-2xl tracking-tight">Kelola akun SR</h1>
					<p className="text-muted-foreground text-sm">
						Cari dan lihat identitas serta status akun Senior Resident.
					</p>
				</div>
				<Link
					href="/admin/users/new"
					className="focus-ring rounded-md bg-primary px-4 py-2.5 font-semibold text-primary-foreground text-sm hover:bg-primary-hover"
				>
					Tambah akun
				</Link>
			</div>
			<Card>
				<CardContent>
					<form
						method="get"
						className="grid items-end gap-4 sm:grid-cols-2 lg:grid-cols-4"
						onSubmit={(event) => {
							event.preventDefault();
							setPage(1);
							setSearch(searchInput.trim());
						}}
					>
						<div className="space-y-2">
							<Label htmlFor="account-search">Nama atau NIM</Label>
							<Input
								id="account-search"
								value={searchInput}
								maxLength={100}
								onChange={(event) => setSearchInput(event.target.value)}
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
							type="submit"
							disabled={accounts.isFetching}
							loading={accounts.isFetching}
						>
							Cari
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
							{accounts.data.accounts.length === 0 ? (
								<p className="py-8 text-center text-muted-foreground text-sm">
									Tidak ada akun yang sesuai pencarian.
								</p>
							) : (
								<table className="w-full text-left text-sm">
									<caption className="sr-only">
										Daftar akun Senior Resident
									</caption>
									<thead>
										<tr className="border-border border-b">
											{[
												"NIM",
												"Nama / Email",
												"Departemen",
												"Jabatan",
												"Gedung",
												"Status",
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
										{accounts.data.accounts.map((account) => (
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
														{account.isSuperadmin && (
															<span className="ml-2 rounded-full bg-primary-soft px-2 py-1 font-semibold text-primary-soft-foreground text-xs">
																SUPERADMIN
															</span>
														)}
													</p>
													<p className="text-muted-foreground">
														{account.email}
													</p>
												</td>
												<td className="px-3 py-4">
													{account.department ?? account.departmentCode}
												</td>
												<td className="px-3 py-4">
													{account.position ?? account.positionCode}
												</td>
												<td className="whitespace-nowrap px-3 py-4">
													{account.building ?? account.buildingCode ?? "—"}
												</td>
												<td className="px-3 py-4">
													<span
														className={`whitespace-nowrap rounded-full px-2.5 py-1 font-semibold text-xs ${account.isActive ? "bg-primary-soft text-primary-soft-foreground" : "bg-muted text-muted-foreground"}`}
													>
														{account.isActive ? "Aktif" : "Nonaktif"}
													</span>
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
							{accounts.data.total} akun · Halaman {page}
						</p>
						<div className="flex gap-2">
							<Button
								variant="outline"
								disabled={page === 1 || accounts.isFetching}
								onClick={() => setPage(page - 1)}
							>
								Sebelumnya
							</Button>
							<Button
								variant="outline"
								disabled={
									page * 20 >= accounts.data.total || accounts.isFetching
								}
								onClick={() => setPage(page + 1)}
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
