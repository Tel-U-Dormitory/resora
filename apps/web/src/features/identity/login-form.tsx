"use client";

import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/form-controls";
import { useAuth } from "@/config/auth-context";
import { authClient } from "@/lib/auth-client";
import { queryClient } from "@/utils/trpc";

export function LoginForm() {
	const router = useRouter();
	const { user, isLoading } = useAuth();
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);
	useEffect(() => {
		if (user) router.replace("/dashboard");
	}, [user, router]);

	async function submit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (isSubmitting) return;
		setError(null);
		setIsSubmitting(true);
		const data = new FormData(event.currentTarget);
		try {
			const result = await authClient.signIn.username({
				username: String(data.get("nim") ?? "").trim(),
				password: String(data.get("password") ?? ""),
			});
			if (result.error) {
				setError("Login gagal. Periksa NIM dan kata sandi Anda.");
				return;
			}
			queryClient.clear();
			router.replace("/dashboard");
		} catch {
			setError("Tidak dapat terhubung ke server. Silakan coba lagi.");
		} finally {
			setIsSubmitting(false);
		}
	}

	return (
		<main className="flex min-h-dvh items-center justify-center bg-background px-4 py-10 sm:px-6">
			<div className="w-full max-w-md">
				<div className="mb-8 flex items-center justify-center gap-3">
					<span className="flex size-11 items-center justify-center rounded-xl bg-primary font-extrabold text-primary-foreground text-xl shadow-brand">
						R
					</span>
					<div>
						<p className="font-extrabold text-xl tracking-tight">RESORA</p>
						<p className="text-muted-foreground text-xs">
							Senior Residents XIV
						</p>
					</div>
				</div>
				<Card className="p-6 sm:p-8">
					<h1 className="font-bold text-2xl tracking-tight">Masuk ke RESORA</h1>
					<p className="mt-2 text-muted-foreground text-sm leading-relaxed">
						Gunakan akun SR yang telah diberikan kepada Anda.
					</p>
					<form
						onSubmit={submit}
						className="mt-7 space-y-5"
						aria-busy={isSubmitting}
					>
						<Field label="NIM" htmlFor="nim" required>
							<Input
								id="nim"
								name="nim"
								autoComplete="username"
								inputMode="numeric"
								placeholder="Masukkan NIM"
								required
								disabled={isSubmitting}
							/>
						</Field>
						<Field label="Kata sandi" htmlFor="password" required>
							<Input
								id="password"
								name="password"
								type="password"
								autoComplete="current-password"
								placeholder="Masukkan kata sandi"
								required
								disabled={isSubmitting}
							/>
						</Field>
						{error && (
							<p
								role="alert"
								className="rounded-md bg-danger-soft p-3 text-danger text-sm"
							>
								{error}
							</p>
						)}
						<Button
							type="submit"
							size="lg"
							fullWidth
							loading={isSubmitting}
							disabled={isLoading}
						>
							Masuk
						</Button>
					</form>
				</Card>
				<p className="mt-6 text-center text-muted-foreground text-xs leading-relaxed">
					Jika mengalami kendala akun, hubungi pengelola akun RESORA.
				</p>
			</div>
		</main>
	);
}
