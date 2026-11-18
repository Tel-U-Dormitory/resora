"use client";

import { ActionDialog } from "@resora/ui/components/action-dialog";
import { Button, buttonVariants } from "@resora/ui/components/button";
import { useMutation } from "@tanstack/react-query";
import { TRPCClientError } from "@trpc/client";
import {
	ArrowLeft,
	Camera,
	CheckCircle2,
	ImagePlus,
	LoaderCircle,
	ScanLine,
} from "lucide-react";
import Link from "next/link";
import type QrScanner from "qr-scanner";
import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { attendanceQueryKeys, queryClient, trpc } from "@/utils/trpc";
import { formatEventTime } from "../../components/event-feedback";
import { refreshAttendanceQueries } from "../../utils/internal-event-queries";
import { scanRegion } from "./check-in-camera";
import {
	type LocationDiagnosis,
	locationDiagnosisText,
} from "./check-in-diagnostics";
import { acquireLocation, freshPosition } from "./check-in-location";
import {
	releaseCamera,
	type ScannerDiagnostic,
	scannerDiagnosticCode,
	scannerErrorMessage,
} from "./check-in-ui";

export default function CheckInScanner() {
	const mutation = useMutation({
		...trpc.attendance.checkIn.mutationOptions(),
		onSuccess: () => {
			void refreshAttendanceQueries(queryClient, attendanceQueryKeys).catch(
				() => {},
			);
		},
	});
	const video = useRef<HTMLVideoElement>(null);
	const region = useRef<QrScanner.ScanRegion>({});
	const healthTimer = useRef<ReturnType<typeof setInterval> | null>(null);
	const heartbeat = useRef({ frameAt: 0, decodedAt: 0, videoTime: 0 });
	const recovered = useRef(false);
	const attemptStarted = useRef(Date.now());
	const [slowScan, setSlowScan] = useState(false);
	const [unconfirmed, setUnconfirmed] = useState(false);
	const imageInput = useRef<HTMLInputElement>(null);
	const inputMethod = useRef<"camera" | "image">("camera");
	const scanner = useRef<QrScanner | null>(null);
	const [cameraAttempt, setCameraAttempt] = useState(0);
	const busy = useRef(false);
	const startingCamera = useRef<"starting" | "restarting" | null>(null);
	const generation = useRef(0);
	const diagnostics = useRef(new Set<ScannerDiagnostic>());
	const cameraListeners = useRef<(() => void) | null>(null);
	const [cameraIssue, setCameraIssue] = useState("");
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
		| "restarting"
		| "camera"
		| "reading-image"
		| "locating"
		| "submitting"
		| "result"
		| "error"
	>("idle");
	const [error, setError] = useState("");
	const [locationError, setLocationError] = useState(false);
	const [locationDiagnosis, setLocationDiagnosis] = useState<LocationDiagnosis>(
		{ code: "IDLE" },
	);
	const [copyStatus, setCopyStatus] = useState("");
	const updateRegion = useCallback(() => {
		if (video.current) Object.assign(region.current, scanRegion(video.current));
	}, []);
	// Layout changes can resize the visible camera preview.
	useEffect(updateRegion);
	const report = useCallback(
		(event: ScannerDiagnostic, attempt = generation.current) => {
			if (attempt !== generation.current || diagnostics.current.has(event))
				return;
			diagnostics.current.add(event);
			// Fixed fields/codes only, at most once per code per camera attempt.
			console.info("[ATTENDANCE_SCANNER]", {
				event,
				attempt,
				elapsedMs: Math.max(0, Date.now() - attemptStarted.current),
			});
		},
		[],
	);
	const stopCamera = () => {
		if (healthTimer.current !== null) clearInterval(healthTimer.current);
		healthTimer.current = null;
		cameraListeners.current?.();
		cameraListeners.current = null;
		releaseCamera(scanner.current, null, true);
		scanner.current = null;
	};
	const inspectVideo = (
		element: HTMLVideoElement,
		attempt: number,
		stalled = false,
	) => {
		if (attempt !== generation.current || busy.current || document.hidden)
			return;
		const tracks =
			element.srcObject && "getTracks" in element.srcObject
				? element.srcObject.getTracks()
				: [];
		const ready =
			tracks.some((track) => track.readyState === "live") &&
			element.readyState > 1 &&
			element.videoWidth > 0 &&
			element.videoHeight > 0 &&
			!element.paused &&
			!element.ended;
		report(ready ? "VIDEO_READY" : "VIDEO_NOT_READY", attempt);
		// Loading/pause events can precede a healthy frame during startup or resume.
		if (!ready && stalled)
			setCameraIssue((issue) => issue || "VIDEO_NOT_READY");
		else if (ready)
			setCameraIssue((issue) => (issue === "DECODER_FAILED" ? issue : ""));
		if (ready) {
			cameraListeners.current?.();
			const onEnded = () => {
				if (generation.current !== attempt || busy.current || document.hidden)
					return;
				report("STREAM_ENDED", attempt);
				setCameraIssue("STREAM_ENDED");
			};
			for (const track of tracks) track.addEventListener("ended", onEnded);
			cameraListeners.current = () => {
				for (const track of tracks) track.removeEventListener("ended", onEnded);
			};
			if (tracks.some((track) => track.readyState === "ended")) onEnded();
		}
	};
	useEffect(() => {
		// Warm the module without opening the camera or requesting location.
		void import("qr-scanner").catch(() => {});
		window.addEventListener?.("resize", updateRegion);
		const onVisibility = () => {
			if (!scanner.current || busy.current) return;
			heartbeat.current.frameAt = heartbeat.current.decodedAt = Date.now();
			if (document.hidden && gps.current && !gps.current.pending) {
				gps.current = null;
				setGpsStatus("");
			}
			// qr-scanner owns pause/resume; do not start a second frame loop here.
			report(document.hidden ? "BACKGROUND" : "FOREGROUND");
		};
		document.addEventListener("visibilitychange", onVisibility);
		return () => {
			if (healthTimer.current !== null) clearInterval(healthTimer.current);
			generation.current++;
			document.removeEventListener("visibilitychange", onVisibility);
			window.removeEventListener?.("resize", updateRegion);
			cameraListeners.current?.();
			gps.current?.controller.abort();
			qrToken.current = null;
			releaseCamera(scanner.current, null, true);
		};
	}, [report, updateRegion]);
	const showError = (code: string) => {
		setLocationDiagnosis((previous) => ({
			...previous,
			code: scannerDiagnosticCode(code),
		}));
		stopCamera();
		gps.current?.controller.abort();
		if (
			!code.startsWith("GPS_") &&
			code !== "INVALID_LOCATION" &&
			code !== "CHECK_IN_UNCONFIRMED" &&
			code !== "OUTSIDE_GEOFENCE"
		)
			qrToken.current = null;
		setUnconfirmed((previous) => previous || code === "CHECK_IN_UNCONFIRMED");
		setLocationError(
			code.startsWith("GPS_") ||
				code === "OUTSIDE_GEOFENCE" ||
				code === "INVALID_LOCATION",
		);
		setError(scannerErrorMessage(code));
		setPhase("error");
	};
	const prepareLocation = (attempt: number) => {
		const startedAt = Date.now();
		setCopyStatus("");
		setLocationDiagnosis({ code: "GPS_ACQUIRING" });
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
			document,
			(reading) => {
				if (generation.current === attempt && gps.current === task)
					setLocationDiagnosis((previous) => ({ ...previous, ...reading }));
			},
		)
			.then((position) => {
				if (generation.current !== attempt || gps.current !== task) return null;
				if (document.hidden) {
					task.error = "GPS_INTERRUPTED";
					setLocationDiagnosis({ code: task.error });
					setGpsStatus(task.error);
					return null;
				}
				task.position = position;
				setLocationDiagnosis({
					code: "GPS_READY",
					accuracyMeters: position.coords.accuracy,
					sampleAgeMs: Math.max(0, Date.now() - position.timestamp),
					acquisitionMs: Math.max(0, Date.now() - startedAt),
				});
				report("GPS_READY", attempt);
				setGpsStatus("ready");
				return position;
			})
			.catch((cause: unknown) => {
				if (generation.current !== attempt || gps.current !== task) return null;
				task.error = cause instanceof Error ? cause.message : "GPS_UNAVAILABLE";
				setLocationDiagnosis((previous) => ({
					...previous,
					code: scannerDiagnosticCode(task.error ?? "GPS_UNAVAILABLE"),
					acquisitionMs: Math.max(0, Date.now() - startedAt),
				}));
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
			// This acknowledges decoding only; attendance still waits for the server.
			try {
				if (!retryLocation) navigator.vibrate?.(40);
			} catch {}
			let task = gps.current;
			if (
				retryLocation ||
				!task ||
				(!task.pending && (!task.position || !freshPosition(task.position)))
			)
				task = prepareLocation(attempt);
			const prepared =
				task.position && freshPosition(task.position) ? task.position : null;
			if (!prepared) report("WAITING_GPS", attempt);
			const position = prepared ?? (await task.promise);
			if (generation.current !== attempt) return;
			if (!position || !freshPosition(position))
				throw new Error(task.error ?? "GPS_TIMEOUT");
			setPhase("submitting");
			setLocationDiagnosis((previous) => ({
				...previous,
				code: "SUBMITTING",
				sampleAgeMs: Math.max(0, Date.now() - position.timestamp),
			}));
			report("SUBMITTING", attempt);
			await mutation.mutateAsync({
				qrToken: token,
				location: {
					latitude: position.coords.latitude,
					longitude: position.coords.longitude,
					accuracyMeters: position.coords.accuracy,
				},
			});
			if (generation.current === attempt) {
				setLocationDiagnosis((previous) => ({
					...previous,
					code: "SERVER_CONFIRMED",
				}));
				report("SERVER_CONFIRMED", attempt);
				qrToken.current = null;
				gps.current = null;
				setPhase("result");
				toast.success("Kehadiran terverifikasi");
			}
		} catch (cause) {
			if (generation.current !== attempt) return;
			if (cause instanceof TRPCClientError) {
				const details = cause.data?.attendanceLocation;
				if (details)
					setLocationDiagnosis((previous) => ({
						...previous,
						distanceMeters: details.distanceMeters,
						radiusMeters: details.radiusMeters,
						accuracyMeters: details.accuracyMeters,
					}));
				const code = cause.data?.code;
				if (code === "UNAUTHORIZED") showError("SESSION_EXPIRED");
				else if (code === "BAD_REQUEST") showError("INVALID_LOCATION");
				else if (
					code === "INTERNAL_SERVER_ERROR" ||
					(!code &&
						scannerErrorMessage(cause.message) ===
							scannerErrorMessage("SERVER_FAILED"))
				)
					showError("CHECK_IN_UNCONFIRMED");
				else showError(cause.message);
			} else if (cause instanceof Error && cause.message.startsWith("GPS_"))
				showError(cause.message);
			else showError("CHECK_IN_UNCONFIRMED");
		} finally {
			if (generation.current === attempt) busy.current = false;
		}
	};
	const startCamera = async (
		restart = false,
		automatic = false,
	): Promise<void> => {
		if (
			busy.current ||
			mutation.isPending ||
			startingCamera.current === "restarting" ||
			(!restart && startingCamera.current)
		)
			return;
		inputMethod.current = "camera";
		if (!automatic) recovered.current = false;
		attemptStarted.current = Date.now();
		setSlowScan(false);
		setUnconfirmed(false);
		startingCamera.current = restart ? "restarting" : "starting";
		const attempt = ++generation.current;
		diagnostics.current = new Set();
		report(restart ? "RESTARTING" : "STARTING", attempt);
		qrToken.current = null;
		mutation.reset();
		setError("");
		setCameraIssue("");
		try {
			if (!window.isSecureContext) {
				report("START_FAILED", attempt);
				showError("HTTPS_REQUIRED");
				return;
			}
			if (!navigator.mediaDevices?.getUserMedia || !video.current) {
				report("START_FAILED", attempt);
				showError("CAMERA_UNAVAILABLE");
				return;
			}
			stopCamera();
			// qr-scanner 1.4.2 has delayed stop() cleanup on its $video. Give each
			// instance its own DOM node before construction, including after cancel.
			flushSync(() => setCameraAttempt(attempt));
			setPhase(restart ? "restarting" : "starting");
			prepareLocation(attempt);
			const { default: Scanner } = await import("qr-scanner");
			if (generation.current !== attempt) return;
			let decoded = false;
			const activeScanner = new Scanner(
				video.current,
				(result) => {
					if (generation.current !== attempt) return;
					report("QR_CALLBACK", attempt);
					if (decoded || busy.current) {
						report("QR_CALLBACK_IGNORED", attempt);
						return;
					}
					decoded = true;
					void processQr(result.data, attempt);
				},
				{
					preferredCamera: "environment",
					returnDetailedScanResult: true,
					maxScansPerSecond: 10,
					calculateScanRegion: (element) => {
						region.current = scanRegion(element);
						return region.current;
					},
					onDecodeError: (cause) => {
						if (generation.current !== attempt || decoded || busy.current)
							return;
						heartbeat.current.decodedAt = Date.now();
						const message = cause instanceof Error ? cause.message : cause;
						// The native BarcodeDetector path prefixes even a normal empty frame.
						if (
							message === Scanner.NO_QR_CODE_FOUND ||
							message === `Scanner error: ${Scanner.NO_QR_CODE_FOUND}`
						) {
							report("FRAMES_NO_QR", attempt);
							setCameraIssue((issue) =>
								issue === "DECODER_FAILED" ? "" : issue,
							);
							return;
						}
						report("DECODER_FAILED", attempt);
						setCameraIssue("DECODER_FAILED");
					},
				},
			);
			scanner.current = activeScanner;
			await activeScanner.start();
			if (generation.current !== attempt)
				releaseCamera(activeScanner, null, true);
			else if (!decoded) {
				setPhase("camera");
				inspectVideo(activeScanner.$video, attempt);
				const stream = activeScanner.$video.srcObject;
				if (stream && "getVideoTracks" in stream) {
					const track = stream.getVideoTracks()[0];
					// Optional ideals keep working cameras usable when constraints are unsupported.
					void track
						?.applyConstraints({
							width: { ideal: 1280 },
							height: { ideal: 720 },
							frameRate: { ideal: 15 },
						})
						.catch(() => {});
				}
				const readyAt = Date.now();
				heartbeat.current = {
					frameAt: readyAt,
					decodedAt: readyAt,
					videoTime: activeScanner.$video.currentTime,
				};
				let hintShown = false;
				healthTimer.current = setInterval(() => {
					if (
						attempt !== generation.current ||
						busy.current ||
						startingCamera.current
					)
						return;
					const now = Date.now();
					const health = heartbeat.current;
					if (document.hidden) {
						health.frameAt = health.decodedAt = now;
						return;
					}
					if (activeScanner.$video.currentTime !== health.videoTime) {
						health.videoTime = activeScanner.$video.currentTime;
						health.frameAt = now;
					}
					if (now - readyAt >= 3000 && !hintShown) {
						hintShown = true;
						setSlowScan(true);
						report("SLOW_SCAN", attempt);
					}
					if (now - health.frameAt < 3000 && now - health.decodedAt < 5000)
						return;
					report("SCAN_STALLED", attempt);
					setCameraIssue("VIDEO_NOT_READY");
					if (!recovered.current) {
						recovered.current = true;
						void startCamera(true, true);
					}
				}, 1000);
			}
		} catch (cause) {
			if (generation.current === attempt) {
				report("START_FAILED", attempt);
				showError(
					cause instanceof DOMException && cause.name === "NotAllowedError"
						? "CAMERA_DENIED"
						: "CAMERA_UNAVAILABLE",
				);
			}
		} finally {
			if (generation.current === attempt) startingCamera.current = null;
		}
	};
	const processing =
		phase === "starting" ||
		phase === "restarting" ||
		phase === "reading-image" ||
		phase === "locating" ||
		phase === "submitting";
	const scannerOpen =
		phase === "starting" ||
		phase === "restarting" ||
		phase === "camera" ||
		phase === "locating";
	const restartCamera =
		Boolean(cameraIssue) && (phase === "camera" || phase === "starting");
	const cameraLabel = restartCamera
		? "Mulai ulang pemindaian"
		: scannerOpen
			? "Hentikan kamera dan lokasi"
			: "Buka kamera dan lokasi";
	const stop = () => {
		setLocationDiagnosis({ code: "IDLE" });
		setCopyStatus("");
		report("STOPPED");
		generation.current++;
		busy.current = false;
		startingCamera.current = null;
		gps.current?.controller.abort();
		gps.current = null;
		qrToken.current = null;
		setSlowScan(false);
		setUnconfirmed(false);
		setGpsStatus("");
		stopCamera();
		setPhase("idle");
	};
	const openImagePicker = () => {
		if (busy.current || mutation.isPending || startingCamera.current) return;
		stop();
		inputMethod.current = "image";
		imageInput.current?.click();
	};
	const scanImage = async (file: File | undefined) => {
		if (!file || busy.current || mutation.isPending || startingCamera.current)
			return;
		stop();
		inputMethod.current = "image";
		const attempt = generation.current;
		attemptStarted.current = Date.now();
		diagnostics.current = new Set();
		busy.current = true;
		mutation.reset();
		setError("");
		setPhase("reading-image");
		try {
			if (!window.isSecureContext) return showError("HTTPS_REQUIRED");
			if (!file.type.startsWith("image/") || file.size === 0)
				return showError("IMAGE_INVALID");
			if (file.size > 10 * 1024 * 1024) return showError("IMAGE_TOO_LARGE");
			const { default: Scanner } = await import("qr-scanner");
			if (generation.current !== attempt) return;
			const result = await Scanner.scanImage(file, {
				returnDetailedScanResult: true,
			});
			if (generation.current !== attempt) return;
			busy.current = false;
			await processQr(result.data, attempt);
		} catch {
			if (generation.current === attempt) showError("IMAGE_SCAN_FAILED");
		} finally {
			if (generation.current === attempt) busy.current = false;
		}
	};
	const diagnosisPanel = (
		<details className="rounded-xl border border-border p-3 text-sm">
			<summary className="cursor-pointer py-2 font-medium">
				Diagnosis lokasi
			</summary>
			<p className="my-2 text-muted-foreground text-xs">
				Untuk pemeriksaan kendala perangkat. Tidak memuat koordinat mentah,
				token QR, atau data akun. Angka jarak/akurasi server dibulatkan ke atas.
			</p>
			<textarea
				readOnly
				aria-label="Hasil diagnosis lokasi"
				value={locationDiagnosisText(locationDiagnosis)}
				rows={7}
				className="w-full rounded-md border border-border p-2 text-base"
			/>
			<Button
				className="mt-2 min-h-11"
				onClick={async () => {
					try {
						if (!navigator.clipboard?.writeText) {
							setCopyStatus("Pilih teks diagnosis dan salin secara manual.");
							return;
						}
						await navigator.clipboard.writeText(
							locationDiagnosisText(locationDiagnosis),
						);
						setCopyStatus(
							"Diagnosis disalin. Tambahkan model perangkat, versi iOS dan browser saat melaporkan.",
						);
					} catch {
						setCopyStatus(
							"Tidak dapat menyalin otomatis. Pilih teks diagnosis dan salin secara manual.",
						);
					}
				}}
			>
				Salin diagnosis
			</Button>
			{copyStatus && (
				<p role="status" className="mt-2">
					{copyStatus}
				</p>
			)}
		</details>
	);
	return (
		<section className="mx-auto max-w-lg space-y-4">
			<div className="relative isolate flex min-h-[min(72dvh,44rem)] flex-col overflow-hidden rounded-3xl bg-slate-950 text-white shadow-xl">
				<video
					key={cameraAttempt}
					ref={video}
					muted
					playsInline
					aria-label="Pratinjau kamera untuk scan QR"
					className="absolute inset-0 size-full object-cover"
					onPlaying={(event) =>
						inspectVideo(event.currentTarget, cameraAttempt)
					}
					onLoadedData={(event) =>
						inspectVideo(event.currentTarget, cameraAttempt)
					}
					onWaiting={(event) =>
						inspectVideo(event.currentTarget, cameraAttempt)
					}
					onPause={(event) => inspectVideo(event.currentTarget, cameraAttempt)}
					onStalled={(event) =>
						inspectVideo(event.currentTarget, cameraAttempt, true)
					}
					onEmptied={(event) =>
						inspectVideo(event.currentTarget, cameraAttempt)
					}
					onError={() => {
						if (cameraAttempt !== generation.current || busy.current) return;
						report("STREAM_ENDED", cameraAttempt);
						setCameraIssue("STREAM_ENDED");
					}}
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
						{phase === "reading-image"
							? "Membaca QR dari gambar…"
							: phase === "camera"
								? "Arahkan kamera ke QR Code kegiatan"
								: phase === "locating"
									? "QR terbaca, memverifikasi kehadiran… Menunggu lokasi (hingga 20 detik)."
									: phase === "submitting"
										? "QR terbaca, memverifikasi kehadiran… Menunggu konfirmasi server."
										: phase === "starting"
											? "Menyiapkan kamera…"
											: phase === "restarting"
												? "Memulai ulang pemindaian…"
												: "Buka kamera atau pilih gambar QR"}
					</p>
					{phase === "camera" && slowScan && (
						<div className="flex flex-col items-center gap-3">
							<p role="status" className="text-center text-sm">
								QR belum terbaca. Pastikan QR terlihat utuh dan cukup terang,
								atau pilih gambar dari galeri.
							</p>
							{!restartCamera && (
								<Button onClick={() => startCamera(true)}>
									Mulai ulang pemindaian
								</Button>
							)}
						</div>
					)}
					{phase === "camera" && gpsStatus && gpsStatus !== "ready" && (
						<p role="status" className="text-center text-sm">
							{gpsStatus === "locating"
								? "Menyiapkan lokasi (maksimal 20 detik)…"
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
					{phase === "camera" && cameraIssue && (
						<p role="status" className="text-center text-sm">
							{scannerErrorMessage(cameraIssue)}
						</p>
					)}
					<Button
						size="icon"
						disabled={
							phase === "reading-image" ||
							phase === "locating" ||
							phase === "submitting" ||
							mutation.isPending
						}
						onClick={() => {
							if (busy.current || mutation.isPending) return;
							if (restartCamera) return startCamera(true);
							if (scannerOpen) return stop();
							return startCamera();
						}}
						aria-label={cameraLabel}
						aria-describedby="scan-privacy"
						className="size-16 rounded-full border-4 border-slate-950 bg-red-500 text-white ring-2 ring-white/80 hover:bg-red-600"
					>
						<ScanLine className="size-7" />
					</Button>
					<span className="text-white/80 text-xs">
						{phase === "locating" || phase === "submitting"
							? "Tunggu proses kehadiran selesai"
							: restartCamera
								? "Ketuk untuk memulai ulang pemindaian"
								: scannerOpen
									? "Ketuk untuk menghentikan kamera dan lokasi"
									: "Ketuk untuk membuka kamera dan lokasi"}
					</span>
					<input
						ref={imageInput}
						type="file"
						accept="image/*"
						aria-label="Pilih gambar QR dari galeri atau Files"
						className="hidden"
						onChange={(event) => {
							const file = event.currentTarget.files?.[0];
							event.currentTarget.value = "";
							void scanImage(file);
						}}
					/>
					<Button
						onClick={openImagePicker}
						disabled={processing || mutation.isPending}
						aria-describedby="scan-privacy scan-image-help"
						className="min-h-11 bg-white/10 text-white hover:bg-white/20"
					>
						<ImagePlus aria-hidden="true" />
						Pilih gambar QR
					</Button>
					<p id="scan-image-help" className="text-center text-white/80 text-xs">
						Galeri atau Files, maksimal 10 MB. Gambar dibaca di perangkat.
					</p>
				</div>
			</div>
			<p
				id="scan-privacy"
				className="px-2 text-muted-foreground text-xs leading-relaxed"
			>
				Kamera dan izin lokasi dimulai saat Anda menekan Buka Kamera. Untuk
				gambar, izin lokasi diminta setelah QR terbaca; gambar tidak dikirim
				atau disimpan di server. GPS diambil hingga 20 detik per percobaan dan
				dihentikan setelah lokasi valid atau scanner ditutup. Lokasi dikirim dan
				disimpan bersama kehadiran hanya ketika check-in. RESORA tidak melacak
				lokasi secara terus-menerus.
			</p>
			{phase !== "error" && phase !== "result" && diagnosisPanel}
			<ActionDialog
				open={phase === "error" || phase === "result"}
				onOpenChange={(open) => {
					if (!open) stop();
				}}
				title={
					phase === "error"
						? unconfirmed
							? "Status kehadiran belum terkonfirmasi"
							: "Kehadiran belum tercatat"
						: mutation.data?.status === "ALREADY_CHECKED_IN"
							? "Anda sudah melakukan check-in"
							: "Check-in berhasil"
				}
				onRetry={
					phase === "error" && !qrToken.current
						? () => {
								if (inputMethod.current === "image") openImagePicker();
								else void startCamera();
							}
						: undefined
				}
			>
				{phase === "error" ? (
					<>
						<p role="alert">{error}</p>
						{locationError && (
							<p>
								Jika menggunakan iPhone: buka Pengaturan → Privasi &amp;
								Keamanan → Layanan Lokasi. Izinkan lokasi untuk browser dan
								aktifkan Lokasi Tepat (Precise Location) jika tersedia. Izinkan
								juga lokasi pada pengaturan situs RESORA, lalu perbarui lokasi.
							</p>
						)}
						{qrToken.current && (
							<Button
								onClick={() => {
									const token = qrToken.current;
									if (token) void processQr(token, generation.current, true);
								}}
							>
								{unconfirmed ? "Coba verifikasi lagi" : "Perbarui Lokasi"}
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
				{diagnosisPanel}
			</ActionDialog>
		</section>
	);
}
