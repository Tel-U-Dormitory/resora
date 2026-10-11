"use client";

import { Button } from "@resora/ui/components/button";
import { Input } from "@resora/ui/components/input";
import { Label } from "@resora/ui/components/label";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { authClient } from "@/lib/auth-client";
import { queryClient, trpc } from "@/utils/trpc";

export default function LoginForm({ expired = false }: { expired?: boolean }) {
	const router = useRouter();
	const [nim, setNim] = useState("");
	const [password, setPassword] = useState("");
	const [pending, setPending] = useState(false);
	const [error, setError] = useState("");
	return (
		<div className="mx-auto mt-10 w-full max-w-md p-6">
			<h1 className="mb-6 text-center font-bold text-3xl">Masuk SR</h1>
			{expired && (
				<p className="mb-4" role="status">
					Sesi tidak tersedia atau telah berakhir. Silakan masuk kembali.
				</p>
			)}
			<form
				className="space-y-4"
				onSubmit={async (event) => {
					event.preventDefault();
					if (pending) return;
					setPending(true);
					setError("");
					try {
						const result = await authClient.signIn.username({
							username: nim,
							password,
						});
						if (result.error) {
							setError(
								result.error.status === 429
									? "Terlalu banyak percobaan. Tunggu satu menit sebelum mencoba kembali."
									: result.error.status >= 500
										? "Layanan masuk sedang tidak tersedia. Silakan coba kembali."
										: "NIM atau password tidak valid.",
							);
							return;
						}
						queryClient.clear();
						const identity = await queryClient.fetchQuery(
							trpc.identity.session.queryOptions(),
						);
						if (!identity) {
							setError(
								"Sesi belum tersedia. Pastikan cookie diizinkan lalu coba kembali.",
							);
							return;
						}
						setPassword("");
						router.replace(
							identity.mustChangePassword ? "/change-password" : "/dashboard",
						);
						router.refresh();
					} catch {
						setError(
							"Tidak dapat menghubungi layanan masuk. Silakan coba kembali.",
						);
					} finally {
						setPending(false);
					}
				}}
			>
				<div className="space-y-2">
					<Label htmlFor="nim">NIM</Label>
					<Input
						id="nim"
						name="username"
						type="text"
						inputMode="numeric"
						autoComplete="username"
						required
						value={nim}
						onChange={(e) => setNim(e.target.value)}
						disabled={pending}
					/>
				</div>
				<div className="space-y-2">
					<Label htmlFor="password">Password</Label>
					<Input
						id="password"
						name="password"
						type="password"
						autoComplete="current-password"
						required
						value={password}
						onChange={(e) => setPassword(e.target.value)}
						disabled={pending}
					/>
				</div>
				{error && (
					<p role="alert" className="text-destructive">
						{error}
					</p>
				)}
				<Button type="submit" className="w-full" disabled={pending}>
					{pending ? "Memproses…" : "Masuk"}
				</Button>
			</form>
			<p className="mt-4 text-center text-muted-foreground text-sm">
				Akun disediakan oleh pengelola RESORA. Tidak tersedia pendaftaran
				publik.
			</p>
		</div>
	);
}
