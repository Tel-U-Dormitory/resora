"use client";

import { Input } from "@resora/ui/components/input";
import { Label } from "@resora/ui/components/label";
import { Eye, EyeOff } from "lucide-react";
import Image from "next/image";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardFooter,
	CardHeader,
} from "@/components/ui/card";
import { authClient } from "@/lib/auth-client";
import { queryClient } from "@/utils/trpc";

export default function LoginForm({ expired = false }: { expired?: boolean }) {
	const [nim, setNim] = useState("");
	const [password, setPassword] = useState("");
	const [showPassword, setShowPassword] = useState(false);
	const [status, setStatus] = useState<"idle" | "processing" | "redirecting">(
		"idle",
	);
	const pending = status !== "idle";
	const submitting = useRef(false);
	const [error, setError] = useState("");
	return (
		<div className="flex min-h-dvh flex-col items-center justify-center p-4 sm:p-6 lg:p-8">
			<Card className="w-full max-w-md shadow-sm">
				<CardHeader className="flex flex-col items-center p-6 pb-2 text-center sm:p-8 sm:pb-2">
					<Image
						src="/Logo-Teldorm.png"
						alt="Logo Asrama Telkom University"
						width={937}
						height={1024}
						priority
						className="h-16 w-auto object-contain sm:h-20"
					/>
					<h1 className="mt-4 font-bold text-2xl text-foreground tracking-tight sm:text-3xl">
						Masuk ke RESORA
					</h1>
					<p className="mt-2 text-muted-foreground text-sm">
						Masuk menggunakan akun RESORA Anda.
					</p>
				</CardHeader>
				<CardContent className="space-y-4 p-6 pt-4 sm:p-8 sm:pt-4">
					{expired && (
						<p
							role="status"
							className="rounded-lg border border-border bg-muted/60 p-3 text-muted-foreground text-sm"
						>
							Sesi tidak tersedia atau telah berakhir. Silakan masuk kembali.
						</p>
					)}
					<form
						method="post"
						className="space-y-4"
						onSubmit={async (event) => {
							event.preventDefault();
							if (submitting.current) return;
							submitting.current = true;
							setStatus("processing");
							setError("");
							let redirecting = false;
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
												: "NIM / username atau password tidak valid.",
									);
									return;
								}
								queryClient.clear();
								setStatus("redirecting");
								// A fresh SSR navigation reads the new cookie, avoids stale router
								// payloads, and applies the authoritative password-change gate.
								window.location.replace("/dashboard");
								redirecting = true;
							} catch {
								setError(
									"Tidak dapat menghubungi layanan masuk. Silakan coba kembali.",
								);
							} finally {
								if (!redirecting) {
									submitting.current = false;
									setStatus("idle");
								}
							}
						}}
					>
						<div className="space-y-2">
							<Label htmlFor="nim">NIM / Username</Label>
							<Input
								id="nim"
								name="username"
								type="text"
								autoComplete="username"
								required
								placeholder="Masukkan NIM atau username"
								value={nim}
								onChange={(e) => setNim(e.target.value)}
								disabled={pending}
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="password">Password</Label>
							<div className="relative">
								<Input
									id="password"
									name="password"
									type={showPassword ? "text" : "password"}
									autoComplete="current-password"
									required
									placeholder="Masukkan password"
									value={password}
									onChange={(e) => setPassword(e.target.value)}
									disabled={pending}
									className="pr-10"
								/>
								<Button
									type="button"
									variant="ghost"
									size="icon"
									className="absolute inset-y-0 right-0 h-8 w-9 rounded-none text-muted-foreground hover:text-foreground"
									aria-label={
										showPassword ? "Sembunyikan password" : "Tampilkan password"
									}
									aria-pressed={showPassword}
									aria-controls="password"
									disabled={pending}
									onClick={() => setShowPassword((visible) => !visible)}
								>
									{showPassword ? (
										<EyeOff className="size-4" aria-hidden="true" />
									) : (
										<Eye className="size-4" aria-hidden="true" />
									)}
								</Button>
							</div>
						</div>
						{error && (
							<p
								role="alert"
								className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-destructive text-sm"
							>
								{error}
							</p>
						)}
						<Button
							type="submit"
							className="w-full"
							disabled={pending}
							loading={pending}
						>
							{status === "redirecting"
								? "Mengalihkan…"
								: pending
									? "Memproses…"
									: "Masuk"}
						</Button>
					</form>
				</CardContent>
				<CardFooter className="justify-center border-border border-t px-6 py-4 text-center sm:px-8">
					<p className="text-muted-foreground text-xs leading-relaxed">
						Akun disediakan oleh pengelola RESORA. Tidak tersedia pendaftaran
						publik.
					</p>
				</CardFooter>
			</Card>
		</div>
	);
}
