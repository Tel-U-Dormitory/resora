"use client";

import { useMutation } from "@tanstack/react-query";
import { TRPCClientError } from "@trpc/client";
import { Camera, CheckCircle2, LoaderCircle } from "lucide-react";
import type QrScanner from "qr-scanner";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { attendanceQueryKeys, queryClient, trpc } from "@/utils/trpc";
import { refreshAttendanceQueries } from "./attendance-queries";
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
			releaseCamera(scanner.current, null, true);
		};
	}, []);
	const showError = (code: string) => {
		stopCamera();
		setError(scannerErrorMessage(code));
		setPhase("error");
	};
	const processQr = async (token: string, attempt: number) => {
		if (busy.current || generation.current !== attempt) return;
		busy.current = true;
		stopCamera();
		try {
			if (!token.startsWith("resora:v1:") || token.length > 256) {
				showError("INVALID_QR");
				return;
			}
			if (!navigator.geolocation) {
				showError("GPS_UNAVAILABLE");
				return;
			}
			setPhase("locating");
			const position = await new Promise<GeolocationPosition>(
				(resolve, reject) =>
					navigator.geolocation.getCurrentPosition(resolve, reject, {
						enableHighAccuracy: true,
						maximumAge: 0,
						timeout: 15000,
					}),
			);
			if (generation.current !== attempt) return;
			setPhase("submitting");
			await mutation.mutateAsync({
				qrToken: token,
				location: {
					latitude: position.coords.latitude,
					longitude: position.coords.longitude,
					accuracyMeters: position.coords.accuracy,
				},
			});
			if (generation.current === attempt) setPhase("result");
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
			else if (typeof cause === "object" && cause && "code" in cause)
				showError(
					cause.code === 1
						? "GPS_DENIED"
						: cause.code === 3
							? "GPS_TIMEOUT"
							: "GPS_UNAVAILABLE",
				);
			else showError("SERVER_FAILED");
		} finally {
			if (generation.current === attempt) busy.current = false;
		}
	};
	const startCamera = async () => {
		if (busy.current || startingCamera.current || mutation.isPending) return;
		busy.current = true;
		startingCamera.current = true;
		const attempt = ++generation.current;
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
			const { default: Scanner } = await import("qr-scanner");
			if (generation.current !== attempt) return;
			const activeScanner = new Scanner(
				video.current,
				(result) => {
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
			else setPhase("camera");
		} catch (cause) {
			if (generation.current === attempt)
				showError(
					cause instanceof DOMException && cause.name === "NotAllowedError"
						? "CAMERA_DENIED"
						: "CAMERA_UNAVAILABLE",
				);
		} finally {
			startingCamera.current = false;
			if (generation.current === attempt) busy.current = false;
		}
	};
	return (
		<section className="mx-auto max-w-xl space-y-6">
			<div className="space-y-2">
				<h1 className="font-bold text-2xl tracking-tight">Scan QR kehadiran</h1>
				<p className="text-muted-foreground text-sm">
					Pindai QR event yang ditampilkan HCO dari lokasi kehadiran.
				</p>
			</div>
			<Card>
				<CardContent className="space-y-4">
					<div className="relative aspect-square w-full overflow-hidden rounded-xl bg-ink">
						<video
							ref={video}
							muted
							playsInline
							aria-label="Pratinjau kamera untuk scan QR"
							className="h-full w-full object-cover"
						/>
						{phase === "camera" ? (
							<div
								aria-hidden="true"
								className="pointer-events-none absolute inset-[16.5%]"
							>
								<span className="absolute top-0 left-0 size-8 rounded-tl-lg border-white border-t-4 border-l-4" />
								<span className="absolute top-0 right-0 size-8 rounded-tr-lg border-white border-t-4 border-r-4" />
								<span className="absolute bottom-0 left-0 size-8 rounded-bl-lg border-white border-b-4 border-l-4" />
								<span className="absolute right-0 bottom-0 size-8 rounded-br-lg border-white border-r-4 border-b-4" />
								<span className="resora-scan-line absolute right-0 left-0 h-0.5 bg-primary" />
							</div>
						) : (
							<div
								aria-hidden="true"
								className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 bg-ink px-6 text-center text-ink-foreground"
							>
								{phase === "starting" ||
								phase === "locating" ||
								phase === "submitting" ? (
									<LoaderCircle
										size={32}
										className="animate-spin motion-reduce:animate-none"
									/>
								) : (
									<Camera size={40} />
								)}
								<span className="text-sm">
									{phase === "starting"
										? "Menyiapkan kamera…"
										: phase === "locating"
											? "Memeriksa lokasi…"
											: phase === "submitting"
												? "Menyimpan kehadiran…"
												: "Kamera siap dibuka"}
								</span>
							</div>
						)}
					</div>
					{phase === "idle" && (
						<p className="text-muted-foreground text-sm">
							Kamera dibuka setelah Anda menekan tombol. Lokasi dan akurasi GPS
							saat check-in digunakan untuk verifikasi dan disimpan bersama
							kehadiran. Izin lokasi diminta ketika QR diproses.
						</p>
					)}
					{phase === "camera" && (
						<>
							<p role="status" className="text-muted-foreground text-sm">
								Memindai QR… Arahkan QR RESORA ke dalam bingkai.
							</p>
							<Button
								variant="outline"
								onClick={() => {
									generation.current++;
									busy.current = false;
									stopCamera();
									setPhase("idle");
								}}
							>
								Hentikan kamera
							</Button>
						</>
					)}
					{(phase === "locating" || phase === "submitting") && (
						<p role="status" className="text-sm">
							{phase === "locating"
								? "Mengambil lokasi dan akurasi GPS…"
								: "Memverifikasi dan menyimpan kehadiran…"}
						</p>
					)}
					{phase === "error" && (
						<p role="alert" className="text-destructive text-sm">
							{error}
						</p>
					)}
					{phase === "result" && mutation.data && (
						<div role="status" className="space-y-3">
							<CheckCircle2
								className="text-success"
								size={28}
								aria-hidden="true"
							/>
							<h2 className="font-semibold text-lg">
								{mutation.data.status === "ALREADY_CHECKED_IN"
									? "Anda sudah melakukan check-in"
									: "Check-in berhasil"}
							</h2>
							<p className="font-medium">{mutation.data.eventName}</p>
							<p className="text-muted-foreground text-sm">
								{formatEventTime(
									new Date(mutation.data.attendanceAt).toISOString(),
								)}
							</p>
							<p className="text-sm">
								Klasifikasi:{" "}
								<span className="font-semibold">
									{mutation.data.timingClass}
								</span>
							</p>
						</div>
					)}
					{(phase === "idle" ||
						phase === "starting" ||
						phase === "error" ||
						phase === "result") && (
						<Button
							disabled={phase === "starting" || mutation.isPending}
							loading={phase === "starting"}
							leftIcon={<Camera size={18} aria-hidden="true" />}
							onClick={startCamera}
							aria-describedby="scan-privacy"
						>
							{phase === "starting"
								? "Membuka kamera…"
								: phase === "idle"
									? "Buka kamera"
									: "Coba lagi"}
						</Button>
					)}
				</CardContent>
			</Card>
			<Card id="scan-privacy" className="scroll-mt-20">
				<CardHeader title="Privasi lokasi" />
				<CardContent className="text-muted-foreground text-sm">
					Lokasi dan akurasi GPS saat check-in akan digunakan untuk verifikasi
					dan disimpan bersama catatan kehadiran. RESORA tidak melacak lokasi
					secara terus-menerus.
				</CardContent>
			</Card>
		</section>
	);
}
