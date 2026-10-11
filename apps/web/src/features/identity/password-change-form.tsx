"use client";

import { Input } from "@resora/ui/components/input";
import { Label } from "@resora/ui/components/label";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { authClient } from "@/lib/auth-client";
import { queryClient, trpc } from "@/utils/trpc";

export default function PasswordChangeForm() {
	const router = useRouter();
	const [currentPassword, setCurrentPassword] = useState("");
	const [newPassword, setNewPassword] = useState("");
	const [confirmation, setConfirmation] = useState("");
	const [pending, setPending] = useState(false);
	const [error, setError] = useState("");
	return (
		<Card className="mx-auto my-10 w-[calc(100%-2rem)] max-w-md">
			<CardHeader className="pb-2">
				<h1 className="text-center font-bold text-3xl tracking-tight">
					Ganti password
				</h1>
				<p className="mt-3 text-muted-foreground text-sm">
					Ganti password awal untuk membuka dashboard SR.
				</p>
			</CardHeader>
			<CardContent>
				<form
					className="space-y-4"
					onSubmit={async (event) => {
						event.preventDefault();
						if (pending) return;
						if (
							newPassword !== confirmation ||
							newPassword === currentPassword
						) {
							setError(
								"Password baru harus berbeda dan konfirmasi harus sesuai.",
							);
							return;
						}
						setPending(true);
						setError("");
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
								setError(
									result.error.status === 429
										? "Terlalu banyak percobaan. Tunggu satu menit."
										: "Password belum berhasil diganti. Periksa password saat ini dan coba kembali.",
								);
								return;
							}
							queryClient.clear();
							const identity = await queryClient.fetchQuery(
								trpc.identity.session.queryOptions(),
							);
							if (!identity || identity.mustChangePassword) {
								setError(
									"Perubahan belum dapat dikonfirmasi. Silakan masuk kembali.",
								);
								return;
							}
							setCurrentPassword("");
							setNewPassword("");
							setConfirmation("");
							router.replace("/dashboard");
							router.refresh();
						} catch {
							setError(
								"Layanan tidak tersedia. Perubahan belum dapat dikonfirmasi; silakan masuk kembali sebelum mencoba ulang.",
							);
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
							onChange={(e) => setCurrentPassword(e.target.value)}
							disabled={pending}
						/>
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
							onChange={(e) => setNewPassword(e.target.value)}
							disabled={pending}
						/>
					</div>
					<div className="space-y-2">
						<Label htmlFor="confirmation">Konfirmasi password baru</Label>
						<Input
							id="confirmation"
							type="password"
							autoComplete="new-password"
							required
							value={confirmation}
							onChange={(e) => setConfirmation(e.target.value)}
							disabled={pending}
						/>
					</div>
					{error && (
						<p role="alert" className="text-destructive">
							{error}
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
