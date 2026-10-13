"use client";

import type { AppRouter } from "@resora/api/routers/index";
import { Input } from "@resora/ui/components/input";
import { Label } from "@resora/ui/components/label";
import { useQuery } from "@tanstack/react-query";
import type { inferRouterOutputs } from "@trpc/server";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { queryErrorMessage } from "@/utils/request-error";
import { queryClient, trpc, trpcClient } from "@/utils/trpc";

type Credentials = inferRouterOutputs<AppRouter>["identity"]["createAccount"];

export default function AccountCreateForm() {
	const router = useRouter();
	const submitting = useRef(false);
	const [pending, setPending] = useState(false);
	const [error, setError] = useState("");
	const [copyStatus, setCopyStatus] = useState("");
	const [credentials, setCredentials] = useState<Credentials | null>(null);
	const [values, setValues] = useState({
		name: "",
		nim: "",
		email: "",
		departmentCode: "",
		positionCode: "",
		buildingCode: "",
	});
	const references = useQuery({
		...trpc.identity.accountReferences.queryOptions(),
		retry: false,
		meta: { errorHandledLocally: true },
	});
	const allowedPositions =
		references.data?.positions.filter((row) =>
			row.departmentCodes.includes(values.departmentCode),
		) ?? [];
	const breadcrumb = (
		<nav aria-label="Breadcrumb akun" className="text-sm">
			<ol className="flex flex-wrap items-center gap-2">
				<li>
					<Link
						href="/admin/users"
						className="focus-ring rounded-md text-muted-foreground hover:text-primary"
					>
						Kelola akun
					</Link>
				</li>
				<li aria-hidden="true" className="text-muted-foreground">
					/
				</li>
				<li aria-current="page" className="font-medium">
					Tambah akun
				</li>
			</ol>
		</nav>
	);
	if (credentials)
		return (
			<section className="max-w-3xl space-y-6">
				{breadcrumb}
				<Card>
					<CardHeader>
						<h1 className="font-bold text-2xl tracking-tight">
							Akun SR berhasil dibuat
						</h1>
					</CardHeader>
					<CardContent className="space-y-5">
						<dl className="grid gap-4 sm:grid-cols-2">
							<div>
								<dt className="text-muted-foreground text-sm">Nama lengkap</dt>
								<dd className="font-medium">{credentials.name}</dd>
							</div>
							<div>
								<dt className="text-muted-foreground text-sm">NIM</dt>
								<dd className="font-medium">{credentials.nim}</dd>
							</div>
							<div className="sm:col-span-2">
								<dt className="text-muted-foreground text-sm">Email</dt>
								<dd className="break-all font-medium">{credentials.email}</dd>
							</div>
						</dl>
						<div className="space-y-2 rounded-lg border border-border bg-muted/40 p-4">
							<Label htmlFor="initial-password">Password sementara</Label>
							<Input
								id="initial-password"
								value={credentials.temporaryPassword}
								readOnly
								autoComplete="off"
								spellCheck={false}
								className="font-mono"
							/>
							<Button
								variant="outline"
								onClick={async () => {
									try {
										await navigator.clipboard.writeText(
											credentials.temporaryPassword,
										);
										setCopyStatus(
											"Password disalin. Berikan secara privat kepada pemilik akun.",
										);
									} catch {
										setCopyStatus(
											"Tidak dapat menyalin. Salin password secara manual dari kolom di atas.",
										);
									}
								}}
							>
								Salin password
							</Button>
							<p role="status" className="text-muted-foreground text-sm">
								{copyStatus}
							</p>
						</div>
						<p className="text-muted-foreground text-sm">
							Password ini hanya ditampilkan pada layar ini. Simpan dan berikan
							secara privat sebelum meninggalkan halaman. Pemilik akun wajib
							mengganti password saat login pertama.
						</p>
						<Button
							onClick={() => {
								setCredentials(null);
								setCopyStatus("");
								router.replace("/admin/users");
								router.refresh();
							}}
						>
							Selesai dan kembali ke daftar
						</Button>
					</CardContent>
				</Card>
			</section>
		);
	return (
		<section className="max-w-3xl space-y-6">
			{breadcrumb}
			<div className="space-y-2">
				<h1 className="font-bold text-2xl tracking-tight">Tambah akun SR</h1>
				<p className="text-muted-foreground text-sm">
					Buat satu akun aktif. Password awal dihasilkan otomatis dan wajib
					diganti saat login pertama.
				</p>
			</div>
			{references.isPending && (
				<p role="status" className="text-muted-foreground text-sm">
					Memuat referensi organisasi…
				</p>
			)}
			{references.error && (
				<Card>
					<CardContent className="space-y-4">
						<p role="alert" className="text-destructive text-sm">
							{queryErrorMessage(references.error)}
						</p>
						<Button
							variant="outline"
							disabled={references.isFetching}
							loading={references.isFetching}
							onClick={() => references.refetch()}
						>
							Coba kembali
						</Button>
					</CardContent>
				</Card>
			)}
			{references.data && (
				<Card>
					<CardContent>
						<form
							method="post"
							className="space-y-5"
							onSubmit={async (event) => {
								event.preventDefault();
								if (submitting.current) return;
								if (!values.name.trim()) {
									setError("Nama lengkap tidak boleh kosong.");
									return;
								}
								submitting.current = true;
								setPending(true);
								setError("");
								try {
									// Direct client call: plaintext response never enters a TanStack mutation/query cache.
									const result =
										await trpcClient.identity.createAccount.mutate(values);
									setCredentials(result);
									setValues({
										name: "",
										nim: "",
										email: "",
										departmentCode: "",
										positionCode: "",
										buildingCode: "",
									});
									void queryClient
										.invalidateQueries({
											queryKey: trpc.identity.listAccounts.pathKey(),
										})
										.catch(() => {});
								} catch (failure) {
									const message =
										failure instanceof Error ? failure.message : "";
									if (message === "NIM_EXISTS")
										setError("NIM sudah digunakan. Periksa daftar akun.");
									else if (message === "EMAIL_EXISTS")
										setError("Email sudah digunakan. Periksa daftar akun.");
									else if (message === "NIM_OR_EMAIL_EXISTS")
										setError(
											"NIM atau email sudah digunakan. Periksa daftar akun.",
										);
									else if (message === "INVALID_ORGANIZATION_ASSIGNMENT")
										setError("Kombinasi departemen dan jabatan tidak valid.");
									else if (
										message === "INVALID_OR_INACTIVE_ORGANIZATION_REFERENCE"
									)
										setError(
											"Referensi organisasi tidak valid atau sudah nonaktif. Muat ulang halaman.",
										);
									else if (
										message === "SUPERADMIN_REQUIRED" ||
										message === "PASSWORD_CHANGE_REQUIRED" ||
										message === "Authentication required"
									)
										setError(queryErrorMessage(failure));
									else
										setError(
											"Hasil pembuatan akun belum dapat dipastikan. Periksa daftar akun sebelum mencoba kembali; jangan anggap akun gagal dibuat.",
										);
								} finally {
									submitting.current = false;
									setPending(false);
								}
							}}
						>
							<div className="grid gap-5 sm:grid-cols-2">
								<div className="space-y-2 sm:col-span-2">
									<Label htmlFor="new-account-name">Nama lengkap</Label>
									<Input
										id="new-account-name"
										name="name"
										required
										maxLength={200}
										disabled={pending}
										value={values.name}
										onChange={(event) =>
											setValues({ ...values, name: event.target.value })
										}
									/>
								</div>
								<div className="space-y-2">
									<Label htmlFor="new-account-nim">NIM</Label>
									<Input
										id="new-account-nim"
										name="nim"
										required
										minLength={3}
										maxLength={30}
										pattern="[a-zA-Z0-9_.]{3,30}"
										title="Gunakan 3–30 huruf, angka, titik, atau underscore."
										inputMode="numeric"
										type="text"
										disabled={pending}
										value={values.nim}
										onChange={(event) =>
											setValues({ ...values, nim: event.target.value })
										}
									/>
								</div>
								<div className="space-y-2">
									<Label htmlFor="new-account-email">Email</Label>
									<Input
										id="new-account-email"
										name="email"
										type="email"
										required
										disabled={pending}
										value={values.email}
										onChange={(event) =>
											setValues({ ...values, email: event.target.value })
										}
									/>
								</div>
								<div className="space-y-2">
									<Label htmlFor="new-account-department">Departemen</Label>
									<select
										id="new-account-department"
										required
										disabled={pending}
										className="focus-ring h-10 w-full rounded-md border border-border bg-surface px-3 text-sm"
										value={values.departmentCode}
										onChange={(event) =>
											setValues({
												...values,
												departmentCode: event.target.value,
												positionCode: "",
											})
										}
									>
										<option value="">Pilih departemen</option>
										{references.data.departments.map((row) => (
											<option key={row.code} value={row.code}>
												{row.name}
											</option>
										))}
									</select>
								</div>
								<div className="space-y-2">
									<Label htmlFor="new-account-position">Jabatan</Label>
									<select
										id="new-account-position"
										required
										disabled={pending || !values.departmentCode}
										className="focus-ring h-10 w-full rounded-md border border-border bg-surface px-3 text-sm"
										value={values.positionCode}
										onChange={(event) =>
											setValues({ ...values, positionCode: event.target.value })
										}
									>
										<option value="">Pilih jabatan</option>
										{allowedPositions.map((row) => (
											<option key={row.code} value={row.code}>
												{row.name}
											</option>
										))}
									</select>
								</div>
								<div className="space-y-2">
									<Label htmlFor="new-account-building">Gedung</Label>
									<select
										id="new-account-building"
										required
										disabled={pending}
										className="focus-ring h-10 w-full rounded-md border border-border bg-surface px-3 text-sm"
										value={values.buildingCode}
										onChange={(event) =>
											setValues({ ...values, buildingCode: event.target.value })
										}
									>
										<option value="">Pilih gedung</option>
										{references.data.buildings.map((row) => (
											<option key={row.code} value={row.code}>
												{row.name}
											</option>
										))}
									</select>
								</div>
							</div>
							{error && (
								<p role="alert" className="text-destructive text-sm">
									{error}{" "}
									<Link
										href="/admin/users"
										className="focus-ring rounded-md underline"
									>
										Lihat daftar akun
									</Link>
								</p>
							)}
							<Button type="submit" disabled={pending} loading={pending}>
								{pending ? "Membuat akun…" : "Buat akun SR"}
							</Button>
						</form>
					</CardContent>
				</Card>
			)}
		</section>
	);
}
