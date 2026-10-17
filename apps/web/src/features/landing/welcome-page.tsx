"use client";

import { ArrowUpRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { ModeToggle } from "@/components/mode-toggle";
import { type MascotMode, MascotStage } from "./mascot-stage";
import { MascotSwitch } from "./mascot-switch";

export default function WelcomePage() {
	const [activeMascot, setActiveMascot] = useState<MascotMode>("astra");

	return (
		<div className="relative flex h-dvh max-h-dvh w-full items-center justify-center overflow-hidden bg-background text-foreground transition-colors duration-300">
			{/* Ambient background glows for desktop backdrop */}
			<div
				className="pointer-events-none absolute inset-0 -z-10 hidden overflow-hidden sm:block"
				aria-hidden="true"
			>
				<div
					className={`absolute top-1/2 left-1/2 size-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-30 blur-3xl transition-colors duration-700 ${
						activeMascot === "astra"
							? "bg-gradient-to-tr from-primary to-amber-500"
							: "bg-gradient-to-tr from-rose-500 to-pink-500"
					}`}
				/>
			</div>

			{/* Mobile-first card container, responsive on desktop */}
			<div className="relative flex h-full w-full max-w-md flex-col justify-between overflow-hidden bg-background px-5 py-4 sm:h-[94dvh] sm:max-h-[820px] sm:rounded-3xl sm:border sm:border-border sm:bg-card/95 sm:shadow-2xl sm:backdrop-blur-xl">
				{/* Top Bar: Clean Minimalist Brand and Theme Toggle (Reference Style) */}
				<header className="z-20 flex w-full items-center justify-between gap-2 pt-1 pb-2">
					<Link
						href="/"
						className="focus-ring flex items-center gap-2 rounded-lg transition-transform hover:scale-[1.02]"
						aria-label="RESORA Dormitory"
					>
						<Image
							src="/Logo-Teldorm.png"
							alt="Logo Telkom University Dormitory"
							width={937}
							height={1024}
							priority
							className="h-8 w-auto shrink-0 object-contain sm:h-9"
						/>
						<span className="font-extrabold text-base text-foreground tracking-tight">
							RESORA<span className="text-primary">.</span>
						</span>
					</Link>

					<div className="flex items-center">
						<ModeToggle />
					</div>
				</header>

				{/* Middle Center: Mascot Stage & Styled 3D Flip Switch Directly Below */}
				<main className="flex flex-1 flex-col items-center justify-center py-2">
					<div className="flex w-full flex-col items-center justify-center">
						<MascotStage mode={activeMascot} className="w-full" />

						{/* 3D Flip Switch Button below mascot */}
						<div className="mt-4 flex items-center justify-center">
							<MascotSwitch
								id="mascot-flip-switch"
								checked={activeMascot === "astri"}
								onChange={(checked) => {
									setActiveMascot(checked ? "astri" : "astra");
								}}
							/>
						</div>
					</div>
				</main>

				{/* Bottom Area: Minimal Bold Typography & Dedicated "Login SR" Button */}
				<footer className="z-20 flex w-full flex-col items-start pt-1 pb-3">
					{/* Bold Reference-Style Typography */}
					<div className="mb-6 text-left">
						<h1 className="font-black text-3xl text-foreground uppercase leading-[1.08] tracking-tight sm:text-4xl">
							SENIOR <br />
							RESIDENT
						</h1>
						<p className="mt-1.5 font-medium text-muted-foreground text-xs sm:text-sm">
							{activeMascot === "astra"
								? "Asrama Putra Telkom University"
								: "Asrama Putri Telkom University"}
						</p>
					</div>

					{/* Dedicated "Login SR" Button */}
					<Link
						href="/login"
						id="login-sr-button"
						className="focus-ring group relative inline-flex w-full items-center justify-between rounded-full bg-primary py-3 pr-2.5 pl-7 font-bold text-primary-foreground shadow-brand transition-all duration-300 hover:scale-[1.01] hover:bg-primary-hover active:scale-[0.98]"
					>
						<span className="font-extrabold text-base tracking-wide sm:text-lg">
							Login SR
						</span>
						<span
							className="flex size-11 items-center justify-center rounded-full bg-white text-primary shadow-xs transition-transform duration-300 group-hover:rotate-45 group-hover:scale-105"
							aria-hidden="true"
						>
							<ArrowUpRight className="size-5 stroke-[2.5]" />
						</span>
					</Link>
				</footer>
			</div>
		</div>
	);
}
