"use client";

import { Input } from "@resora/ui/components/input";
import { Label } from "@resora/ui/components/label";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { authClient } from "@/lib/auth-client";

export default function PasswordRecoveryForm({
	reset = false,
}: {
	reset?: boolean;
}) {
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [confirmation, setConfirmation] = useState("");
	const [token, setToken] = useState("");
	const [pending, setPending] = useState(false);
	const submitting = useRef(false);
	const tokenCaptured = useRef(false);
	const [success, setSuccess] = useState(false);
	const [error, setError] = useState("");
	useEffect(() => {
		if (!reset || tokenCaptured.current) return;
		tokenCaptured.current = true;
		const value =
			new URLSearchParams(window.location.hash.slice(1)).get("token") ?? "";
		setToken(value);
		window.history.replaceState(null, "", window.location.pathname);
		if (!value)
			setError("Tautan reset tidak valid. Silakan minta tautan baru.");
	}, [reset]);
	return (
		<main className="flex min-h-svh items-center justify-center px-4 py-10">
			<Card className="w-full max-w-md">
				<CardHeader>
					<p className="mb-2 font-bold text-primary">RESORA</p>
					<h1 className="font-bold text-2xl">
						{reset ? "Reset password" : "Lupa password"}
					</h1>
					<p className="mt-2 text-muted-foreground text-sm">
						{reset
							? "Buat password baru (8–128 karakter). Seluruh sesi akan diakhiri."
							: "Masukkan email yang terdaftar pada akun RESORA Anda."}
					</p>
				</CardHeader>
				<CardContent className="space-y-4 pt-5">
					{success ? (
						<p role="status" className="text-sm">
							{reset
								? "Password berhasil diubah. Silakan masuk dengan password baru."
								: "Jika email terdaftar, tautan reset password akan dikirimkan."}
						</p>
					) : (
						<form
							method="post"
							className="space-y-4"
							onSubmit={async (event) => {
								event.preventDefault();
								if (submitting.current) return;
								setError("");
								if (
									reset &&
									(!token ||
										password.length < 8 ||
										password.length > 128 ||
										password !== confirmation)
								) {
									setError(
										!token
											? "Tautan reset tidak valid. Silakan minta tautan baru."
											: password !== confirmation
												? "Konfirmasi password tidak cocok."
												: "Password harus terdiri dari 8–128 karakter.",
									);
									return;
								}
								submitting.current = true;
								setPending(true);
								try {
									const result = reset
										? await authClient.resetPassword({
												token,
												newPassword: password,
											})
										: await authClient.requestPasswordReset({
												email: email.trim().toLowerCase(),
											});
									if (result.error) {
										setError(
											result.error.status === 429
												? "Terlalu banyak percobaan. Silakan tunggu sebelum mencoba kembali."
												: reset
													? "Tautan tidak valid atau kedaluwarsa, atau password belum memenuhi ketentuan. Silakan minta tautan baru."
													: "Permintaan belum dapat diproses. Silakan coba kembali.",
										);
										return;
									}
									setSuccess(true);
									setPassword("");
									setConfirmation("");
									setToken("");
								} catch {
									setError("Layanan belum tersedia. Silakan coba kembali.");
								} finally {
									submitting.current = false;
									setPending(false);
								}
							}}
						>
							{reset ? (
								<>
									<div className="space-y-2">
										<Label htmlFor="new-password">Password baru</Label>
										<Input
											id="new-password"
											name="newPassword"
											type="password"
											autoComplete="new-password"
											minLength={8}
											maxLength={128}
											required
											value={password}
											onChange={(event) => setPassword(event.target.value)}
											disabled={pending}
										/>
									</div>
									<div className="space-y-2">
										<Label htmlFor="confirm-password">
											Konfirmasi password baru
										</Label>
										<Input
											id="confirm-password"
											name="confirmation"
											type="password"
											autoComplete="new-password"
											required
											value={confirmation}
											onChange={(event) => setConfirmation(event.target.value)}
											disabled={pending}
										/>
									</div>
								</>
							) : (
								<div className="space-y-2">
									<Label htmlFor="recovery-email">Email terdaftar</Label>
									<Input
										id="recovery-email"
										name="email"
										type="email"
										autoComplete="email"
										required
										value={email}
										onChange={(event) => setEmail(event.target.value)}
										disabled={pending}
									/>
								</div>
							)}
							{error && (
								<p role="alert" className="text-destructive text-sm">
									{error}
								</p>
							)}
							<Button
								type="submit"
								className="w-full"
								disabled={pending || (reset && !token)}
								loading={pending}
							>
								{pending
									? "Memproses…"
									: reset
										? "Simpan password baru"
										: "Kirim tautan reset"}
							</Button>
						</form>
					)}
					{reset && !success && (
						<Link
							className="block text-primary text-sm hover:underline focus-visible:outline-2"
							href="/forgot-password"
						>
							Minta tautan baru
						</Link>
					)}
					<Link
						className="block text-primary text-sm hover:underline focus-visible:outline-2"
						href="/login"
					>
						Kembali ke login
					</Link>
				</CardContent>
			</Card>
		</main>
	);
}
