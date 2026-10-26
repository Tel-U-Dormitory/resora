"use client";

import { ActionDialog } from "@resora/ui/components/action-dialog";
import { Button, buttonVariants } from "@resora/ui/components/button";
import { useMutation } from "@tanstack/react-query";
import { TRPCClientError } from "@trpc/client";
import {
	ArrowLeft,
	Camera,
	CheckCircle2,
	LoaderCircle,
	ScanLine,
} from "lucide-react";
import Link from "next/link";
import type QrScanner from "qr-scanner";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { attendanceQueryKeys, queryClient, trpc } from "@/utils/trpc";
import { refreshAttendanceQueries } from "./attendance-queries";
import { acquireLocation, freshPosition } from "./check-in-location";
import { releaseCamera, scannerErrorMessage } from "./check-in-ui";
import { formatEventTime } from "./event-ui";

export default function CheckInScanner() {
	const mutation = useMutation({
		...trpc.attendance.checkIn.mutationOptions(),
		onSuccess: () =>
			refreshAttendanceQueries(queryClient, attendanceQueryKeys).catch(
				() => {},
			),
	});
	const video = useRef<HTMLVideoElement>(null);
	const scanner = useRef<QrScanner | null>(null);
	const busy = useRef(false);
	const startingCamera = useRef(false);
	const generation = useRef(0);
	const qrToken = useRef<string | null>(null);
	const gps = useRef<{
		controller: AbortController;
		promise: Promise<GeolocationPosition | null>;
		pending: boolean;
		position?: GeolocationPosition;
		error?: string;
	} | null>(null);
	const [gpsStatus, setGpsStatus] = useState("");
	const [phase, setPhase] = useState<
		| "idle"
		| "starting"
		| "camera"
		| "locating"
		| "submitting"
		| "result"
		| "error"
	>("idle");
	const [error, setError] = useState("");
	const stopCamera = () => releaseCamera(scanner.current, video.current);
	useEffect(() => {
		return () => {
			generation.current++;
			gps.current?.controller.abort();
			qrToken.current = null;
			releaseCamera(scanner.current, null, true);
		};
	}, []);
	const showError = (code: string) => {
		stopCamera();
		gps.current?.controller.abort();
		if (!code.startsWith("GPS_") && code !== "INVALID_LOCATION")
			qrToken.current = null;
		setError(scannerErrorMessage(code));
		setPhase("error");
	};
	const prepareLocation = (attempt: number) => {
		gps.current?.controller.abort();
		const task: NonNullable<typeof gps.current> = {
			controller: new AbortController(),
			promise: Promise.resolve(null),
			pending: true,
		};
		gps.current = task;
		setGpsStatus("locating");
		task.promise = acquireLocation(
			navigator.geolocation,
			task.controller.signal,
		)
			.then((position) => {
				if (generation.current !== attempt || gps.current !== task) return null;
				task.position = position;
				setGpsStatus("ready");
				return position;
			})
			.catch((cause: unknown) => {
				if (generation.current !== attempt || gps.current !== task) return null;
				task.error = cause instanceof Error ? cause.message : "GPS_UNAVAILABLE";
				setGpsStatus(task.error);
				return null;
			})
			.finally(() => {
				task.pending = false;
			});
		return task;
	};
	const processQr = async (
		token: string,
		attempt: number,
		retryLocation = false,
	) => {
		if (busy.current || generation.current !== attempt) return;
		busy.current = true;
		stopCamera();
		try {
			if (!token.startsWith("resora:v1:") || token.length > 256) {
				showError("INVALID_QR");
				return;
			}
			qrToken.current = token;
			setPhase("locating");
			let task = gps.current;
			if (
				retryLocation ||
				!task ||
				(!task.pending && (!task.position || !freshPosition(task.position)))
			)
				task = prepareLocation(attempt);
			const position =
				task.position && freshPosition(task.position)
					? task.position
					: await task.promise;
			if (generation.current !== attempt) return;
			if (!position || !freshPosition(position))
				throw new Error(task.error ?? "GPS_TIMEOUT");
			setPhase("submitting");
			await mutation.mutateAsync({
				qrToken: token,
				location: {
					latitude: position.coords.latitude,
					longitude: position.coords.longitude,
					accuracyMeters: position.coords.accuracy,
				},
			});
			if (generation.current === attempt) {
				qrToken.current = null;
				gps.current = null;
				setPhase("result");
				toast.success("Kehadiran terverifikasi");
			}
		} catch (cause) {
			if (generation.current !== attempt) return;
			if (cause instanceof TRPCClientError)
				showError(
					cause.data?.code === "UNAUTHORIZED"
						? "SESSION_EXPIRED"
						: cause.data?.code === "BAD_REQUEST"
							? "INVALID_LOCATION"
							: cause.message,
				);
			else if (cause instanceof Error && cause.message.startsWith("GPS_"))
				showError(cause.message);
			else showError("SERVER_FAILED");
		} finally {
			if (generation.current === attempt) busy.current = false;
		}
	};
	const startCamera = async () => {
		if (busy.current || startingCamera.current || mutation.isPending) return;
		startingCamera.current = true;
		const attempt = ++generation.current;
		qrToken.current = null;
		mutation.reset();
		setError("");
		try {
			if (!window.isSecureContext) {
				showError("HTTPS_REQUIRED");
				return;
			}
			if (!navigator.mediaDevices?.getUserMedia || !video.current) {
				showError("CAMERA_UNAVAILABLE");
				return;
			}
			scanner.current?.destroy();
			setPhase("starting");
			prepareLocation(attempt);
			const { default: Scanner } = await import("qr-scanner");
			if (generation.current !== attempt) return;
			let decoded = false;
			const activeScanner = new Scanner(
				video.current,
				(result) => {
					if (decoded || busy.current || generation.current !== attempt) return;
					decoded = true;
					void processQr(result.data, attempt);
				},
				{
					preferredCamera: "environment",
					returnDetailedScanResult: true,
					maxScansPerSecond: 5,
					onDecodeError: () => {},
				},
			);
			scanner.current = activeScanner;
			await activeScanner.start();
			if (generation.current !== attempt)
				releaseCamera(activeScanner, null, true);
			else if (!decoded) setPhase("camera");
		} catch (cause) {
			if (generation.current === attempt)
				showError(
					cause instanceof DOMException && cause.name === "NotAllowedError"
						? "CAMERA_DENIED"
						: "CAMERA_UNAVAILABLE",
				);
		} finally {
			if (generation.current === attempt) startingCamera.current = false;
		}
	};
	const processing =
		phase === "starting" || phase === "locating" || phase === "submitting";
	const scannerOpen =
		phase === "starting" || phase === "camera" || phase === "locating";
	const stop = () => {
		generation.current++;
		busy.current = false;
		startingCamera.current = false;
		gps.current?.controller.abort();
		gps.current = null;
		qrToken.current = null;
		setGpsStatus("");
		stopCamera();
		setPhase("idle");
	};
	return (
		<section className="mx-auto max-w-lg space-y-4">
			<div className="relative isolate flex min-h-[min(72dvh,44rem)] flex-col overflow-hidden rounded-3xl bg-slate-950 text-white shadow-xl">
				<video
					ref={video}
					muted
					playsInline
					aria-label="Pratinjau kamera untuk scan QR"
					className="absolute inset-0 size-full object-cover"
				/>
				<div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/90" />
				<div className="relative flex items-center justify-between p-4">
					<Link
						href="/dashboard"
						onClick={stop}
						className={cn(
							buttonVariants({ variant: "ghost", size: "icon" }),
							"size-11 rounded-full bg-black/40 text-white hover:bg-black/60",
						)}
						aria-label="Kembali ke dashboard"
					>
						<ArrowLeft />
					</Link>
					<h1 className="flex items-center gap-2 rounded-full bg-black/40 px-4 py-2 font-semibold text-xs">
						<span
							className={`size-2 rounded-full ${phase === "camera" ? "bg-emerald-400" : "bg-white/50"}`}
						/>
						Scan Presensi
					</h1>
					<span className="size-10" aria-hidden="true" />
				</div>
				<div className="relative flex flex-1 flex-col items-center justify-center gap-5 px-8 py-10">
					<div
						aria-hidden="true"
						className="relative aspect-square w-full max-w-72 rounded-3xl border border-white/15 bg-white/5"
					>
						<span className="absolute top-0 left-0 size-7 rounded-tl-3xl border-red-500 border-t-[3px] border-l-[3px]" />
						<span className="absolute top-0 right-0 size-7 rounded-tr-3xl border-red-500 border-t-[3px] border-r-[3px]" />
						<span className="absolute bottom-0 left-0 size-7 rounded-bl-3xl border-red-500 border-b-[3px] border-l-[3px]" />
						<span className="absolute right-0 bottom-0 size-7 rounded-br-3xl border-red-500 border-r-[3px] border-b-[3px]" />
						{phase === "camera" ? (
							<span className="resora-scan-line absolute right-2 left-2 h-px bg-red-500 shadow-[0_0_12px_#ef4444]" />
						) : (
							<div className="flex h-full items-center justify-center text-white/60">
								{processing ? (
									<LoaderCircle className="size-10 animate-spin motion-reduce:animate-none" />
								) : (
									<Camera className="size-12" />
								)}
							</div>
						)}
					</div>
					<p
						role="status"
						className="rounded-full bg-black/50 px-4 py-2 text-center text-xs"
					>
						{phase === "camera"
							? "Arahkan kamera ke QR Code kegiatan"
							: phase === "locating"
								? "Menunggu akurasi GPS maksimal 40 m (hingga 20 detik)…"
								: phase === "submitting"
									? "Menyimpan kehadiran…"
									: phase === "starting"
										? "Menyiapkan kamera…"
										: "Buka kamera untuk scan kehadiran"}
					</p>
					{phase === "camera" && gpsStatus && (
						<p role="status" className="text-center text-sm">
							{gpsStatus === "locating"
								? "Menunggu lokasi dengan akurasi maksimal 40 m (hingga 20 detik)…"
								: gpsStatus === "ready"
									? "Lokasi siap; akan diperiksa kembali setelah QR terbaca."
									: scannerErrorMessage(gpsStatus)}
						</p>
					)}
					{phase === "camera" && gpsStatus.startsWith("GPS_") && (
						<Button
							onClick={() => {
								if (!gps.current?.pending && !busy.current)
									prepareLocation(generation.current);
							}}
						>
							Perbarui Lokasi
						</Button>
					)}
				</div>
				<div className="relative flex flex-col items-center gap-3 px-5 pt-4 pb-7">
					<p className="text-center text-white/70 text-xs">
						Gunakan QR kegiatan yang ditampilkan HCO
					</p>
					<Button
						size="icon"
						disabled={phase === "submitting"}
						onClick={scannerOpen ? stop : startCamera}
						aria-label={scannerOpen ? "Hentikan kamera" : "Buka kamera"}
						aria-describedby="scan-privacy"
						className="size-16 rounded-full border-4 border-slate-950 bg-red-500 text-white ring-2 ring-white/80 hover:bg-red-600"
					>
						<ScanLine className="size-7" />
					</Button>
					<span className="text-white/80 text-xs">
						{scannerOpen
							? "Ketuk untuk menghentikan kamera dan lokasi"
							: "Ketuk untuk membuka kamera"}
					</span>
				</div>
			</div>
			<p
				id="scan-privacy"
				className="px-2 text-muted-foreground text-xs leading-relaxed"
			>
				Kamera dan izin lokasi dimulai saat Anda menekan Buka Kamera. GPS
				diambil hingga 20 detik per percobaan dan dihentikan setelah lokasi
				valid atau scanner ditutup. Lokasi dikirim dan disimpan bersama
				kehadiran hanya ketika check-in. RESORA tidak melacak lokasi secara
				terus-menerus.
			</p>
			<ActionDialog
				open={phase === "error" || phase === "result"}
				onOpenChange={(open) => {
					if (!open) stop();
				}}
				title={
					phase === "error"
						? "Kehadiran belum tercatat"
						: mutation.data?.status === "ALREADY_CHECKED_IN"
							? "Anda sudah melakukan check-in"
							: "Check-in berhasil"
				}
				onRetry={
					phase === "error" && !qrToken.current ? startCamera : undefined
				}
			>
				{phase === "error" ? (
					<>
						<p role="alert">{error}</p>
						{qrToken.current && (
							<Button
								onClick={() => {
									const token = qrToken.current;
									if (token) void processQr(token, generation.current, true);
								}}
							>
								Perbarui Lokasi
							</Button>
						)}
					</>
				) : (
					mutation.data && (
						<>
							<CheckCircle2 className="text-success" aria-hidden="true" />
							<p className="font-medium">{mutation.data.eventName}</p>
							<p>
								{formatEventTime(
									new Date(mutation.data.attendanceAt).toISOString(),
								)}
							</p>
							<p>Klasifikasi: {mutation.data.timingClass}</p>
						</>
					)
				)}
			</ActionDialog>
		</section>
	);
}
