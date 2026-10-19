"use client";

import { Input } from "@resora/ui/components/input";
import { Label } from "@resora/ui/components/label";
import { Eye, EyeOff } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRef, useState } from "react";

import { ModeToggle } from "@/components/mode-toggle";
import { Button } from "@/components/ui/button";
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
		<div className="relative flex min-h-dvh w-full flex-col bg-background lg:flex-row">
			{/* Left Column (Desktop Banner inspired by Reference - hidden on mobile) */}
			<div className="relative hidden flex-col justify-between overflow-hidden bg-gradient-to-br from-[#dc2626] via-[#b91c1c] to-[#7f1d1d] p-10 text-white lg:flex lg:flex-1 xl:p-16">
				{/* Diagonal background stripes - matching reference geometry */}
				<svg
					className="pointer-events-none absolute inset-0 h-full w-full opacity-25"
					preserveAspectRatio="none"
					viewBox="0 0 1000 800"
					aria-hidden="true"
				>
					<g transform="rotate(-35 500 400)">
						<rect
							x="-300"
							y="-120"
							width="1600"
							height="130"
							rx="65"
							fill="white"
							fillOpacity="0.12"
						/>
						<rect
							x="-400"
							y="80"
							width="1800"
							height="190"
							rx="95"
							fill="white"
							fillOpacity="0.08"
						/>
						<rect
							x="-200"
							y="340"
							width="1400"
							height="150"
							rx="75"
							fill="black"
							fillOpacity="0.18"
						/>
						<rect
							x="-350"
							y="550"
							width="1700"
							height="210"
							rx="105"
							fill="white"
							fillOpacity="0.1"
						/>
						<rect
							x="-150"
							y="800"
							width="1300"
							height="120"
							rx="60"
							fill="white"
							fillOpacity="0.12"
						/>
					</g>
				</svg>

				{/* Top brand header */}
				<div className="relative z-10 flex items-center justify-between">
					<Link
						href="/"
						className="flex items-center gap-2.5 transition-opacity hover:opacity-90"
					>
						<span className="rounded-full bg-white/20 px-3.5 py-1 font-semibold text-white text-xs uppercase tracking-wider backdrop-blur-md">
							Telkom University Dormitory
						</span>
					</Link>
				</div>

				{/* Center Hero: "Selamat Datang di" + Logo + RESORA (Clean Reference Style) */}
				<div className="relative z-10 my-auto flex max-w-xl flex-col items-start py-8 text-left">
					<p className="font-normal text-2xl text-white tracking-wide opacity-95 xl:text-3xl">
						Selamat Datang di
					</p>

					<div className="mt-4 flex items-center gap-4">
						<Image
							src="/Logo-Teldorm.png"
							alt="Logo Telkom University Dormitory"
							width={937}
							height={1024}
							priority
							className="h-16 w-auto object-contain drop-shadow-lg xl:h-20"
						/>
						<div>
							<h1 className="font-black text-4xl text-white uppercase leading-none tracking-tight xl:text-5xl">
								RESORA<span className="text-amber-300">.</span>
							</h1>
							<p className="mt-1.5 font-bold text-white/85 text-xs uppercase tracking-widest xl:text-sm">
								Platform Senior Resident Asrama Tel-U
							</p>
						</div>
					</div>

					<p className="mt-6 max-w-md font-medium text-sm text-white/80 leading-relaxed">
						Sistem informasi dan presensi kegiatan asrama terpadu Asrama Putra &
						Putri Telkom University.
					</p>
				</div>

				{/* Bottom banner footer */}
				<div className="relative z-10 flex items-center justify-between border-white/20 border-t pt-4 text-white/75 text-xs">
					<span>RESORA &copy; {new Date().getFullYear()}</span>
					<span>Asrama Putra & Putri Telkom University</span>
				</div>
			</div>

			{/* Right Column (Desktop) & Responsive Container (Mobile) */}
			<div className="relative flex min-h-dvh flex-1 flex-col justify-between overflow-x-hidden bg-background sm:justify-center lg:w-[420px] lg:flex-none lg:justify-center lg:px-12 xl:w-[480px] xl:px-16 2xl:w-[520px]">
				{/* Top-right mode toggle on desktop */}
				<div className="absolute top-6 right-6 z-30 hidden lg:block">
					<ModeToggle />
				</div>

				{/* Mobile-only Curved Wave Header (< lg) */}
				<div className="relative h-[210px] w-full shrink-0 overflow-hidden bg-gradient-to-br from-[#ef4444] via-[#dc2626] to-[#991b1b] lg:hidden">
					{/* Subtle diagonal stripes in mobile header */}
					<svg
						className="pointer-events-none absolute inset-0 h-full w-full opacity-15"
						preserveAspectRatio="none"
						viewBox="0 0 400 210"
						aria-hidden="true"
					>
						<g transform="rotate(-35 200 105)">
							<rect
								x="-100"
								y="-40"
								width="600"
								height="40"
								rx="20"
								fill="white"
								fillOpacity="0.12"
							/>
							<rect
								x="-150"
								y="20"
								width="700"
								height="60"
								rx="30"
								fill="white"
								fillOpacity="0.08"
							/>
							<rect
								x="-50"
								y="100"
								width="500"
								height="50"
								rx="25"
								fill="black"
								fillOpacity="0.15"
							/>
						</g>
					</svg>

					{/* SVG Organic Wave Shape at bottom */}
					<svg
						className="pointer-events-none absolute inset-0 h-full w-full"
						viewBox="0 0 400 210"
						preserveAspectRatio="none"
						aria-hidden="true"
					>
						<defs>
							<linearGradient
								id="mobileWaveGrad"
								x1="0%"
								y1="0%"
								x2="100%"
								y2="100%"
							>
								<stop offset="0%" stopColor="#ef4444" />
								<stop offset="50%" stopColor="#dc2626" />
								<stop offset="100%" stopColor="#991b1b" />
							</linearGradient>
						</defs>
						<path
							d="M 0,0 L 400,0 L 400,145 C 310,190 230,200 150,170 C 90,150 40,160 0,180 Z"
							fill="url(#mobileWaveGrad)"
						/>
					</svg>

					{/* Mobile Top Bar: Logo, Brand & Glassmorphic ModeToggle */}
					<div className="relative z-10 flex items-center justify-between px-6 pt-5">
						<Link href="/" className="flex items-center gap-2.5">
							<Image
								src="/Logo-Teldorm.png"
								alt="Logo Tel-U Dormitory"
								width={937}
								height={1024}
								priority
								className="h-8 w-auto object-contain"
							/>
							<div>
								<span className="font-extrabold text-base text-white leading-none tracking-tight">
									RESORA<span className="text-amber-300">.</span>
								</span>
								<p className="mt-0.5 font-medium text-[9px] text-white/80 leading-none">
									Tel-U Dormitory
								</p>
							</div>
						</Link>
						<div className="[&_button]:border-white/20 [&_button]:bg-white/20 [&_button]:text-white [&_button]:backdrop-blur-md [&_button]:hover:bg-white/30">
							<ModeToggle />
						</div>
					</div>

					{/* Mobile Greeting Title inside Wave - Spaced from top bar, closer to login card */}
					<div className="relative z-10 mt-7 px-6 pb-2 text-center">
						<p className="font-medium text-white/80 text-xs tracking-wide">
							Selamat Datang di
						</p>
						<h1 className="mt-0.5 font-black text-2xl text-white tracking-tight sm:text-3xl">
							RESORA Portal
						</h1>
					</div>
				</div>

				{/* Card Wrapper:
					- Mobile: Floating rounded card overlapping the wave (-mt-9 mx-4 p-6 shadow-xl bg-surface border border-border/80)
					- Desktop: Clean, flat, uncluttered, no border, no shadow (lg:m-0 lg:p-0 lg:border-none lg:shadow-none lg:bg-transparent)
				*/}
				<div className="relative z-20 -mt-9 mb-6 flex-1 px-4 sm:flex-none sm:px-6 lg:m-0 lg:flex-none lg:p-0">
					<div className="mx-auto w-full max-w-sm rounded-3xl border border-border/80 bg-surface p-6 shadow-xl backdrop-blur-xl sm:p-8 lg:rounded-none lg:border-none lg:bg-transparent lg:p-0 lg:shadow-none">
						{/* Heading - Centered on mobile */}
						<div className="mb-6 text-center lg:text-left">
							<h2 className="font-bold text-2xl text-foreground tracking-tight sm:text-3xl">
								Login
							</h2>
							<p className="mt-1.5 text-muted-foreground text-xs leading-relaxed sm:text-sm">
								Masuk menggunakan akun RESORA Senior Resident Anda
							</p>
						</div>

						{expired && (
							<div
								role="status"
								className="mb-5 rounded-xl border border-border bg-muted/60 p-3 text-center text-muted-foreground text-xs"
							>
								Sesi Anda telah berakhir. Silakan masuk kembali.
							</div>
						)}

						<form
							method="post"
							className="space-y-4 sm:space-y-5"
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
							{/* Username Field */}
							<div className="space-y-1.5 text-left">
								<Label
									htmlFor="nim"
									className="font-semibold text-foreground text-xs sm:text-sm"
								>
									Username
								</Label>
								<Input
									id="nim"
									name="username"
									type="text"
									autoComplete="username"
									required
									placeholder="NIM / Username"
									value={nim}
									onChange={(e) => setNim(e.target.value)}
									disabled={pending}
									className="h-11 w-full rounded-xl border border-input bg-surface px-3 text-sm transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
								/>
							</div>

							{/* Password Field */}
							<div className="space-y-1.5 text-left">
								<Label
									htmlFor="password"
									className="font-semibold text-foreground text-xs sm:text-sm"
								>
									Password
								</Label>
								<div className="relative">
									<Input
										id="password"
										name="password"
										type={showPassword ? "text" : "password"}
										autoComplete="current-password"
										required
										placeholder="••••••••••••"
										value={password}
										onChange={(e) => setPassword(e.target.value)}
										disabled={pending}
										className="h-11 w-full rounded-xl border border-input bg-surface px-3 pr-12 text-sm transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
									/>
									<Button
										type="button"
										variant="ghost"
										size="icon"
										className="resora-password-toggle text-muted-foreground hover:bg-transparent hover:text-foreground"
										aria-label={
											showPassword
												? "Sembunyikan password"
												: "Tampilkan password"
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

							{/* Error Message */}
							{error && (
								<p
									role="alert"
									className="rounded-xl border border-destructive/20 bg-destructive/10 p-2.5 text-center text-destructive text-xs"
								>
									{error}
								</p>
							)}

							{/* Submit Button */}
							<Button
								type="submit"
								className="mt-2 h-11 w-full rounded-xl bg-primary font-bold text-primary-foreground text-sm shadow-brand transition-all hover:bg-primary-hover active:scale-[0.99]"
								disabled={pending}
								loading={pending}
							>
								{status === "redirecting"
									? "Mengalihkan…"
									: pending
										? "Memproses…"
										: "Login"}
							</Button>

							{/* Bottom Link: Back to Welcome */}
							<div className="pt-3 text-center">
								<Link
									href="/"
									className="font-medium text-muted-foreground text-xs transition-colors hover:text-foreground hover:underline"
								>
									&larr; Kembali ke Welcome Page
								</Link>
							</div>

							{/* Version Info */}
							<div className="pt-2 text-center">
								<span className="font-mono text-[11px] text-muted-foreground/60">
									v0.1.1
								</span>
							</div>
						</form>
					</div>
				</div>

				{/* Mobile footer for copyright & visual balance */}
				<div className="z-10 pb-6 text-center text-[11px] text-muted-foreground lg:hidden">
					<span>
						RESORA &copy; {new Date().getFullYear()} • Asrama Telkom University
					</span>
				</div>
			</div>
		</div>
	);
}
