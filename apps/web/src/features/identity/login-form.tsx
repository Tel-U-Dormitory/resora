"use client";

import { Input } from "@resora/ui/components/input";
import { Label } from "@resora/ui/components/label";
import { Eye, EyeOff } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { authClient } from "@/lib/auth-client";
import { queryClient, trpc } from "@/utils/trpc";

export default function LoginForm({ expired = false }: { expired?: boolean }) {
	const router = useRouter();
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
		<Card className="mx-auto my-10 w-[calc(100%-2rem)] max-w-md">
			<CardHeader className="pb-2">
				<Image
					src="/Logo-Teldorm.png"
					alt=""
					width={937}
					height={1024}
					className="mx-auto mb-3 h-20 w-auto object-contain"
				/>
				<p className="mb-2 text-center font-semibold text-primary text-xs uppercase tracking-wider">
					RESORA
				</p>
				<h1 className="text-center font-bold text-3xl tracking-tight">
					Masuk RESORA
				</h1>
			</CardHeader>
			<CardContent>
				{expired && (
					<p className="mb-4" role="status">
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
							const identity = await queryClient.fetchQuery(
								trpc.identity.session.queryOptions(),
							);
							if (!identity) {
								setError(
									"Sesi belum tersedia. Pastikan cookie diizinkan lalu coba kembali.",
								);
								return;
							}
							setStatus("redirecting");
							router.replace(
								identity.requiresPasswordChange
									? "/change-password"
									: "/dashboard",
							);
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
						<p role="alert" className="text-destructive">
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
				<p className="mt-4 text-center text-muted-foreground text-sm">
					Akun disediakan oleh pengelola RESORA. Tidak tersedia pendaftaran
					publik.
				</p>
			</CardContent>
		</Card>
	);
}
