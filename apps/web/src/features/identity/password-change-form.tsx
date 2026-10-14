"use client";

import { Input } from "@resora/ui/components/input";
import { Label } from "@resora/ui/components/label";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { authClient } from "@/lib/auth-client";
import { queryClient, trpc } from "@/utils/trpc";

export default function PasswordChangeForm({
	mandatory = true,
}: {
	mandatory?: boolean;
}) {
	const router = useRouter();
	const [currentPassword, setCurrentPassword] = useState("");
	const [newPassword, setNewPassword] = useState("");
	const [confirmation, setConfirmation] = useState("");
	const [pending, setPending] = useState(false);
	const [success, setSuccess] = useState(false);
	const [error, setError] = useState<{
		field: "current" | "new" | "confirmation" | "form";
		message: string;
	} | null>(null);
	return (
		<Card
			className={
				mandatory ? "mx-auto my-10 w-[calc(100%-2rem)] max-w-md" : "w-full"
			}
		>
			<CardHeader className="pb-2">
				{mandatory ? (
					<h1 className="text-center font-bold text-3xl tracking-tight">
						Ganti password
					</h1>
				) : (
					<h2 className="font-bold text-lg tracking-tight">Keamanan akun</h2>
				)}
				<p className="mt-3 text-muted-foreground text-sm">
					{mandatory
						? "Ganti password awal untuk mengakses RESORA."
						: "Ganti password Anda. Sesi di perangkat lain akan diakhiri."}
				</p>
			</CardHeader>
			<CardContent>
				<form
					method="post"
					noValidate
					className="space-y-4"
					onSubmit={async (event) => {
						event.preventDefault();
						if (pending) return;
						setSuccess(false);
						if (!currentPassword) {
							setError({
								field: "current",
								message: "Masukkan password saat ini.",
							});
							return;
						}
						if (newPassword.length < 8 || newPassword.length > 128) {
							setError({
								field: "new",
								message: "Password baru harus terdiri dari 8–128 karakter.",
							});
							return;
						}
						if (newPassword === currentPassword) {
							setError({
								field: "new",
								message: "Password baru harus berbeda dari password saat ini.",
							});
							return;
						}
						if (newPassword !== confirmation) {
							setError({
								field: "confirmation",
								message: "Konfirmasi password tidak sesuai.",
							});
							return;
						}
						setPending(true);
						setError(null);
						try {
							const result = await authClient.changePassword({
								currentPassword,
								newPassword,
								revokeOtherSessions: true,
							});
							if (result.error) {
								if (result.error.status === 401) {
									queryClient.clear();
									router.replace("/login?reason=session");
									router.refresh();
									return;
								}
								setError({
									field: "form",
									message:
										result.error.status === 429
											? "Terlalu banyak percobaan. Tunggu satu menit."
											: "Password belum berhasil diganti. Periksa password saat ini dan coba kembali.",
								});
								return;
							}
							if (mandatory) queryClient.clear();
							else
								await queryClient.invalidateQueries({
									queryKey: trpc.identity.pathKey(),
								});
							const identity = await queryClient.fetchQuery(
								trpc.identity.session.queryOptions(),
							);
							if (!identity || identity.mustChangePassword) {
								setError({
									field: "form",
									message:
										"Perubahan belum dapat dikonfirmasi. Silakan masuk kembali.",
								});
								return;
							}
							setCurrentPassword("");
							setNewPassword("");
							setConfirmation("");
							if (mandatory) router.replace("/dashboard");
							else setSuccess(true);
							router.refresh();
						} catch {
							setError({
								field: "form",
								message:
									"Layanan tidak tersedia. Perubahan belum dapat dikonfirmasi; silakan masuk kembali sebelum mencoba ulang.",
							});
						} finally {
							setPending(false);
						}
					}}
				>
					<div className="space-y-2">
						<Label htmlFor="current-password">Password saat ini</Label>
						<Input
							id="current-password"
							type="password"
							autoComplete="current-password"
							required
							value={currentPassword}
							onChange={(e) => {
								setCurrentPassword(e.target.value);
								setError(null);
							}}
							aria-invalid={error?.field === "current"}
							aria-describedby={
								error?.field === "current"
									? "current-password-error"
									: undefined
							}
							disabled={pending}
						/>
						{error?.field === "current" && (
							<p
								id="current-password-error"
								role="alert"
								className="text-destructive text-sm"
							>
								{error.message}
							</p>
						)}
					</div>
					<div className="space-y-2">
						<Label htmlFor="new-password">Password baru (8–128 karakter)</Label>
						<Input
							id="new-password"
							type="password"
							autoComplete="new-password"
							minLength={8}
							maxLength={128}
							required
							value={newPassword}
							onChange={(e) => {
								setNewPassword(e.target.value);
								setError(null);
							}}
							aria-invalid={error?.field === "new"}
							aria-describedby={
								error?.field === "new" ? "new-password-error" : undefined
							}
							disabled={pending}
						/>
						{error?.field === "new" && (
							<p
								id="new-password-error"
								role="alert"
								className="text-destructive text-sm"
							>
								{error.message}
							</p>
						)}
					</div>
					<div className="space-y-2">
						<Label htmlFor="confirmation">Konfirmasi password baru</Label>
						<Input
							id="confirmation"
							type="password"
							autoComplete="new-password"
							required
							value={confirmation}
							onChange={(e) => {
								setConfirmation(e.target.value);
								setError(null);
							}}
							aria-invalid={error?.field === "confirmation"}
							aria-describedby={
								error?.field === "confirmation"
									? "confirmation-error"
									: undefined
							}
							disabled={pending}
						/>
						{error?.field === "confirmation" && (
							<p
								id="confirmation-error"
								role="alert"
								className="text-destructive text-sm"
							>
								{error.message}
							</p>
						)}
					</div>
					{error?.field === "form" && (
						<p role="alert" className="text-destructive">
							{error.message}
						</p>
					)}
					{success && (
						<p
							role="status"
							className="rounded-lg bg-muted p-3 text-foreground text-sm"
						>
							Password berhasil diganti. Sesi di perangkat lain telah diakhiri.
						</p>
					)}
					<Button
						type="submit"
						disabled={pending}
						className="w-full"
						loading={pending}
					>
						{pending ? "Memproses…" : "Simpan password baru"}
					</Button>
				</form>
			</CardContent>
		</Card>
	);
}
