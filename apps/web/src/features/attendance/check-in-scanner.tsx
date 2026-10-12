"use client";

import { useMutation } from "@tanstack/react-query";
import { TRPCClientError } from "@trpc/client";
import { Camera, CheckCircle2 } from "lucide-react";
import type QrScanner from "qr-scanner";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { trpc } from "@/utils/trpc";
import { formatEventTime } from "./event-ui";

const gpsHelp = "Hubungi KADEP HCO untuk penanganan manual pada Phase 6.";
const messages: Record<string, string> = {
	INVALID_QR:
		"QR tidak valid. Gunakan QR kehadiran RESORA yang ditampilkan HCO.",
	QR_EXPIRED: "QR telah kedaluwarsa. Minta HCO menampilkan QR baru.",
	QR_REVOKED:
		"QR telah dibatalkan atau diganti. Minta HCO menampilkan QR terbaru.",
	SESSION_INACTIVE: "Sesi kehadiran belum aktif. Hubungi HCO.",
	SESSION_CLOSED: "Sesi kehadiran sudah ditutup.",
	NOT_INVITED: "Anda tidak termasuk dalam daftar undangan event ini.",
	NOT_ELIGIBLE:
		"Akun Anda tidak memenuhi syarat check-in SR. Hubungi pengelola akun.",
	PASSWORD_CHANGE_REQUIRED:
		"Ganti password terlebih dahulu untuk melakukan check-in.",
	GPS_DENIED: `Izin lokasi ditolak. ${gpsHelp}`,
	GPS_TIMEOUT: `Pengambilan lokasi terlalu lama. Coba lagi di tempat dengan sinyal lebih baik. ${gpsHelp}`,
	GPS_UNAVAILABLE: `Lokasi tidak tersedia. ${gpsHelp}`,
	INVALID_LOCATION: `Lokasi yang diterima tidak valid. ${gpsHelp}`,
	GPS_INACCURATE: `Akurasi GPS belum mencukupi untuk check-in. Coba di area terbuka. ${gpsHelp}`,
	OUTSIDE_GEOFENCE: `Lokasi Anda di luar radius event. ${gpsHelp}`,
	HTTPS_REQUIRED:
		"Kamera dan lokasi memerlukan HTTPS atau localhost. Gunakan alamat HTTPS yang disediakan untuk UAT mobile.",
	CAMERA_DENIED:
		"Izin kamera ditolak. Izinkan kamera melalui pengaturan browser, lalu coba lagi.",
	CAMERA_UNAVAILABLE:
		"Kamera tidak tersedia atau sedang digunakan aplikasi lain. Periksa kamera dan coba lagi.",
	SESSION_EXPIRED:
		"Sesi telah berakhir atau akun tidak lagi eligible. Silakan masuk kembali.",
	SERVER_FAILED:
		"Koneksi atau layanan tidak tersedia. Coba lagi; retry tidak menimpa catatan kehadiran yang sudah tersimpan.",
};

export default function CheckInScanner() {
	const mutation = useMutation(trpc.attendance.checkIn.mutationOptions());
	const video = useRef<HTMLVideoElement>(null);
	const scanner = useRef<QrScanner | null>(null);
	const busy = useRef(false);
	const startingCamera = useRef(false);
	const generation = useRef(0);
	const [phase, setPhase] = useState<
		"idle" | "camera" | "locating" | "submitting" | "result" | "error"
	>("idle");
	const [error, setError] = useState("");
	const stopCamera = () => {
		scanner.current?.stop();
		const stream = video.current?.srcObject;
		if (stream instanceof MediaStream)
			for (const track of stream.getTracks()) track.stop();
	};
	useEffect(() => {
		return () => {
			generation.current++;
			scanner.current?.destroy();
			// Capture release through scanner's video even after React clears the ref.
			const stream = scanner.current?.$video.srcObject;
			if (stream instanceof MediaStream)
				for (const track of stream.getTracks()) track.stop();
		};
	}, []);
	const showError = (code: string) => {
		stopCamera();
		setError(messages[code] ?? messages.SERVER_FAILED);
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
			setPhase("camera");
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
			if (generation.current !== attempt) {
				activeScanner.destroy();
				const stream = activeScanner.$video.srcObject;
				if (stream instanceof MediaStream)
					for (const track of stream.getTracks()) track.stop();
			}
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
				<CardHeader title="Privasi lokasi" />
				<CardContent className="text-muted-foreground text-sm">
					Lokasi dan akurasi GPS saat check-in akan digunakan untuk verifikasi
					dan disimpan bersama catatan kehadiran. RESORA tidak melacak lokasi
					secara terus-menerus.
				</CardContent>
			</Card>
			<Card>
				<CardContent className="space-y-4">
					<video
						ref={video}
						muted
						playsInline
						aria-label="Pratinjau kamera untuk scan QR"
						className={
							phase === "camera"
								? "aspect-square w-full rounded-lg bg-ink object-cover"
								: "hidden"
						}
					/>
					{phase === "idle" && (
						<p className="text-muted-foreground text-sm">
							Kamera hanya dibuka setelah Anda menekan tombol. Izin lokasi
							diminta ketika QR diproses.
						</p>
					)}
					{phase === "camera" && (
						<>
							<p role="status" className="text-muted-foreground text-sm">
								Arahkan kamera ke QR RESORA.
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
					{(phase === "idle" || phase === "error" || phase === "result") && (
						<Button
							disabled={mutation.isPending}
							leftIcon={<Camera size={18} aria-hidden="true" />}
							onClick={startCamera}
						>
							{phase === "idle" ? "Buka kamera" : "Coba lagi"}
						</Button>
					)}
				</CardContent>
			</Card>
		</section>
	);
}
