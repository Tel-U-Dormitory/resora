"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type MascotMode = "astra" | "astri";

export interface MascotStageProps {
	mode?: MascotMode;
	onInteract?: () => void;
	className?: string;
	size?: "sm" | "md" | "lg";
}

export const ASTRA_GREETINGS = [
	"Halo SR! Astra siap bantu koordinasi & ketertiban asrama putra!",
	"Semangat mentoring adik-adik asrama! Jadilah teladan terbaik!",
	"Pastikan cek presensi QR dan dampingi warga asrama dengan prima!",
	"Disiplin, tangguh, dan selalu kompak bersama tim Senior Resident!",
];

export const ASTRI_GREETINGS = [
	"Hai Rekan SR! Astri siap sambut hangat setiap kegiatan di asrama putri!",
	"Hadirkan rasa nyaman, aman, dan kebersamaan untuk seluruh warga asrama!",
	"Yuk pantau absensi kegiatan dan sapa adik-adik asrama dengan ceria!",
	"Senyum ramah dan kepedulianmu adalah kunci kehangatan asrama kita!",
];

export const DUO_GREETINGS = [
	"Selamat datang di RESORA, Senior Resident Telkom University!",
];

const MINI_REACTIONS: Record<MascotMode, string[]> = {
	astra: [
		"Halo SR! Siap bertugas? 🚀",
		"Semangat jaga asrama putra! 💪",
		"Presensi aman terkendali! ✨",
		"Astra siap temani kamu! ⭐",
	],
	astri: [
		"Hai Rekan SR! Sambut hari ceria! 🌸",
		"Semangat asrama putri tercinta! 💖",
		"Kompak & peduli selalu! ✨",
		"Astri siap dampingi kamu! 🌷",
	],
};

export function MascotStage({
	mode = "astra",
	onInteract,
	className = "",
	size = "md",
}: MascotStageProps) {
	const [eyeOffset, setEyeOffset] = useState({ x: 0, y: 0 });
	const [isBlinking, setIsBlinking] = useState(false);
	const [isReacting, setIsReacting] = useState(false);
	const [reactionText, setReactionText] = useState<string | null>(null);
	const reactionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const stageRef = useRef<HTMLDivElement>(null);
	const audioCtxRef = useRef<AudioContext | null>(null);

	// Audio is enabled by default as requested
	const playChime = useCallback((frequency = 540) => {
		if (typeof window === "undefined") return;
		try {
			const AudioContextClass =
				window.AudioContext ||
				(window as unknown as { webkitAudioContext: typeof AudioContext })
					.webkitAudioContext;
			if (!AudioContextClass) return;
			if (!audioCtxRef.current) {
				audioCtxRef.current = new AudioContextClass();
			}
			const ctx = audioCtxRef.current;
			if (ctx.state === "suspended") {
				ctx.resume();
			}
			const osc = ctx.createOscillator();
			const gain = ctx.createGain();
			osc.type = "sine";
			osc.frequency.setValueAtTime(frequency, ctx.currentTime);
			osc.frequency.exponentialRampToValueAtTime(
				frequency * 1.6,
				ctx.currentTime + 0.14,
			);
			gain.gain.setValueAtTime(0.09, ctx.currentTime);
			gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.22);
			osc.connect(gain);
			gain.connect(ctx.destination);
			osc.start();
			osc.stop(ctx.currentTime + 0.22);
		} catch {
			// Ignore audio autoplay restrictions
		}
	}, []);

	// Eye pupil tracking
	const handlePointerMove = useCallback((e: React.PointerEvent) => {
		if (!stageRef.current) return;
		const rect = stageRef.current.getBoundingClientRect();
		const centerX = rect.left + rect.width / 2;
		const centerY = rect.top + rect.height / 2;

		const deltaX = (e.clientX - centerX) / (rect.width / 2);
		const deltaY = (e.clientY - centerY) / (rect.height / 2);

		// Clamp pupil offset between -6px and 6px
		const clampedX = Math.max(-1, Math.min(1, deltaX)) * 6;
		const clampedY = Math.max(-1, Math.min(1, deltaY)) * 5;

		setEyeOffset({ x: clampedX, y: clampedY });
	}, []);

	const handlePointerLeave = useCallback(() => {
		setEyeOffset({ x: 0, y: 0 });
	}, []);

	// Periodic natural blink
	useEffect(() => {
		const blinkInterval = setInterval(() => {
			setIsBlinking(true);
			setTimeout(() => {
				setIsBlinking(false);
			}, 150);
		}, 3600);

		return () => clearInterval(blinkInterval);
	}, []);

	const triggerMascotReaction = () => {
		setIsReacting(true);
		playChime(mode === "astra" ? 520 : 640);
		onInteract?.();

		const list = MINI_REACTIONS[mode];
		const randomReaction = list[Math.floor(Math.random() * list.length)];
		setReactionText(randomReaction);

		if (reactionTimeoutRef.current) clearTimeout(reactionTimeoutRef.current);
		reactionTimeoutRef.current = setTimeout(() => {
			setReactionText(null);
			setIsReacting(false);
		}, 2000);
	};

	const isAstra = mode === "astra";

	return (
		<div
			ref={stageRef}
			onPointerMove={handlePointerMove}
			onPointerLeave={handlePointerLeave}
			className={`relative flex select-none flex-col items-center justify-center ${className}`}
		>
			{/* Ambient background glow behind mascot */}
			<div
				className="pointer-events-none absolute inset-0 -z-10 flex items-center justify-center opacity-60 blur-3xl"
				aria-hidden="true"
			>
				<div
					className={`rounded-full transition-colors duration-500 ${
						size === "sm" ? "size-36" : size === "lg" ? "size-72" : "size-64"
					} ${
						isAstra
							? "bg-gradient-to-tr from-primary/30 to-amber-500/20"
							: "bg-gradient-to-tr from-rose-500/30 to-pink-400/20"
					}`}
				/>
			</div>

			{/* Mini floating speech reaction pill when tapped */}
			<div
				className={`pointer-events-none absolute z-30 transition-all duration-300 ${
					size === "sm" ? "-top-6" : "-top-8"
				} ${
					reactionText
						? "translate-y-0 scale-100 opacity-100"
						: "translate-y-2 scale-90 opacity-0"
				}`}
			>
				<div className="rounded-full border border-primary/20 bg-surface/95 px-3.5 py-1 font-bold text-foreground text-xs shadow-md backdrop-blur-md">
					{reactionText}
				</div>
			</div>

			{/* The Mascot button / interactive canvas */}
			<button
				type="button"
				onClick={triggerMascotReaction}
				aria-label={`Maskot ${isAstra ? "Astra" : "Astri"}, ketuk untuk interaksi`}
				className={`group relative flex cursor-pointer flex-col items-center transition-transform duration-300 ${
					isReacting ? "-translate-y-3 scale-105" : "hover:-translate-y-1.5"
				}`}
			>
				<svg
					viewBox="0 0 320 310"
					className={
						size === "sm"
							? "h-36 w-auto drop-shadow-md sm:h-40"
							: size === "lg"
								? "h-64 w-auto drop-shadow-2xl sm:h-72 md:h-80"
								: "h-56 w-auto drop-shadow-xl sm:h-64 md:h-72"
					}
					aria-hidden="true"
				>
					<defs>
						{/* Astra Gradients (Warm Tel-U Red with Layered Hair) */}
						<linearGradient
							id="astraCloudGrad"
							x1="0%"
							y1="0%"
							x2="0%"
							y2="100%"
						>
							<stop offset="0%" stopColor="#f87171" />
							<stop offset="35%" stopColor="#ef4444" />
							<stop offset="85%" stopColor="#dc2626" />
							<stop offset="100%" stopColor="#b91c1c" />
						</linearGradient>
						<linearGradient
							id="astraBackCloudGrad"
							x1="0%"
							y1="0%"
							x2="0%"
							y2="100%"
						>
							<stop offset="0%" stopColor="#ef4444" />
							<stop offset="100%" stopColor="#991b1b" />
						</linearGradient>

						{/* Astri Gradients (Warm Vibrant Rose / Magenta) */}
						<linearGradient
							id="astriCloudGrad"
							x1="0%"
							y1="0%"
							x2="0%"
							y2="100%"
						>
							<stop offset="0%" stopColor="#fda4af" />
							<stop offset="35%" stopColor="#fb7185" />
							<stop offset="85%" stopColor="#e11d48" />
							<stop offset="100%" stopColor="#be123c" />
						</linearGradient>
						<linearGradient
							id="astriBackCloudGrad"
							x1="0%"
							y1="0%"
							x2="0%"
							y2="100%"
						>
							<stop offset="0%" stopColor="#fb7185" />
							<stop offset="100%" stopColor="#9f1239" />
						</linearGradient>
					</defs>

					{/* Layer 1: Background Cloud Lobes (Creates the fluffy 3D cloud hair like reference) */}
					<path
						d="M 55 180 
               C 30 140 45 80 85 70 
               C 105 35 155 20 185 45 
               C 215 20 265 35 285 70 
               C 325 80 340 140 315 180 
               Z"
						fill={
							isAstra ? "url(#astraBackCloudGrad)" : "url(#astriBackCloudGrad)"
						}
						opacity="0.85"
					/>

					{/* Layer 2: Main Cloud Body (5 Soft Puffy Lobes across top, rounded base) */}
					<path
						d="M 50 280
               C 22 280 16 215 22 155
               C 12 115 35 72 75 76
               C 92 34 138 28 165 58
               C 192 28 238 34 255 76
               C 295 72 318 115 308 155
               C 314 215 308 280 280 280
               C 205 292 125 292 50 280 Z"
						fill={isAstra ? "url(#astraCloudGrad)" : "url(#astriCloudGrad)"}
						filter="drop-shadow(0 8px 12px rgba(0,0,0,0.15))"
					/>

					{/* Astri Signature Flower Accessory (top right lobe) */}
					{!isAstra && (
						<g transform="translate(254, 76)">
							<circle cx="0" cy="-9" r="8" fill="#fef08a" />
							<circle cx="9" cy="-3" r="8" fill="#fef08a" />
							<circle cx="6" cy="8" r="8" fill="#fef08a" />
							<circle cx="-6" cy="8" r="8" fill="#fef08a" />
							<circle cx="-9" cy="-3" r="8" fill="#fef08a" />
							<circle cx="0" cy="0" r="6" fill="#f43f5e" />
						</g>
					)}

					{/* Arched Cute Eyebrows floating above eyes */}
					<path
						d="M 94 116 Q 115 102 136 112"
						stroke={isAstra ? "#450a0a" : "#4c0519"}
						strokeWidth="6"
						strokeLinecap="round"
						fill="none"
						style={{
							transform: isReacting ? "translateY(-5px)" : "translateY(0)",
							transition: "transform 0.2s ease",
						}}
					/>
					<path
						d="M 184 112 Q 205 102 226 116"
						stroke={isAstra ? "#450a0a" : "#4c0519"}
						strokeWidth="6"
						strokeLinecap="round"
						fill="none"
						style={{
							transform: isReacting ? "translateY(-5px)" : "translateY(0)",
							transition: "transform 0.2s ease",
						}}
					/>

					{/* Big Kawaii Expressive Eyes (Faithful to Reference Image) */}
					{/* Left Eye */}
					<g
						style={{
							transformOrigin: "115px 158px",
							transform: isBlinking ? "scaleY(0.08)" : "scaleY(1)",
							transition: "transform 0.1s ease",
						}}
					>
						<circle cx="115" cy="158" r="26" fill="#0f172a" />
						{/* Astri Delicate Eyelash Accent */}
						{!isAstra && (
							<path
								d="M 93 152 Q 86 142 82 136"
								stroke="#0f172a"
								strokeWidth="4"
								strokeLinecap="round"
							/>
						)}
						{/* Dynamic Pupil Tracking with double catchlight gloss */}
						<g
							style={{
								transform: `translate(${eyeOffset.x}px, ${eyeOffset.y}px)`,
								transition: "transform 0.08s ease-out",
							}}
						>
							{/* Large glossy highlight (top-left) */}
							<circle cx="107" cy="149" r="9.5" fill="#ffffff" />
							{/* Small glossy highlight (bottom-right) */}
							<circle cx="123" cy="166" r="4.5" fill="#ffffff" />
						</g>
					</g>

					{/* Right Eye */}
					<g
						style={{
							transformOrigin: "205px 158px",
							transform: isBlinking ? "scaleY(0.08)" : "scaleY(1)",
							transition: "transform 0.1s ease",
						}}
					>
						<circle cx="205" cy="158" r="26" fill="#0f172a" />
						{/* Astri Delicate Eyelash Accent */}
						{!isAstra && (
							<path
								d="M 227 152 Q 234 142 238 136"
								stroke="#0f172a"
								strokeWidth="4"
								strokeLinecap="round"
							/>
						)}
						{/* Dynamic Pupil Tracking with double catchlight gloss */}
						<g
							style={{
								transform: `translate(${eyeOffset.x}px, ${eyeOffset.y}px)`,
								transition: "transform 0.08s ease-out",
							}}
						>
							{/* Large glossy highlight (top-left) */}
							<circle cx="197" cy="149" r="9.5" fill="#ffffff" />
							{/* Small glossy highlight (bottom-right) */}
							<circle cx="213" cy="166" r="4.5" fill="#ffffff" />
						</g>
					</g>

					{/* Rosy Blush Cheeks on Both Sides */}
					<ellipse
						cx="86"
						cy="188"
						rx="16"
						ry="9"
						fill={isAstra ? "#f43f5e" : "#fb7185"}
						opacity={isAstra ? "0.65" : "0.85"}
					/>
					<ellipse
						cx="234"
						cy="188"
						rx="16"
						ry="9"
						fill={isAstra ? "#f43f5e" : "#fb7185"}
						opacity={isAstra ? "0.65" : "0.85"}
					/>

					{/* Joyful Open Mouth with Tongue (Exact Moodpress Expression) */}
					{isReacting ? (
						/* Wide laughing cheer mouth on tap */
						<g>
							<path
								d="M 138 184 Q 160 226 182 184 Z"
								fill="#0f172a"
								stroke="#0f172a"
								strokeWidth="3"
							/>
							<path
								d="M 148 206 Q 160 198 172 206 Q 160 224 148 206 Z"
								fill="#fb7185"
							/>
						</g>
					) : (
						/* Classic cute open mouth with tongue */
						<g>
							<path
								d="M 144 186 Q 160 216 176 186 Z"
								fill="#0f172a"
								stroke="#0f172a"
								strokeWidth="2.5"
							/>
							<path
								d="M 151 202 Q 160 196 169 202 Q 160 215 151 202 Z"
								fill="#ffffff"
							/>
						</g>
					)}
				</svg>
			</button>
		</div>
	);
}
