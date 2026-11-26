"use client";

import { ActionDialog } from "@resora/ui/components/action-dialog";
import { Button, buttonVariants } from "@resora/ui/components/button";
import { useMutation } from "@tanstack/react-query";
import { TRPCClientError } from "@trpc/client";
import { ArrowLeft, CheckCircle2, ImagePlus, Info } from "lucide-react";
import Link from "next/link";
import type QrScanner from "qr-scanner";
import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { attendanceQueryKeys, queryClient, trpc } from "@/utils/trpc";
import { formatEventTime } from "../../components/event-feedback";
import { refreshAttendanceQueries } from "../../utils/internal-event-queries";
import {
	type CameraZoom,
	cameraZoom,
	scanRegion,
	setCameraZoom,
} from "./check-in-camera";
import {
	type DiagnosisEnvironment,
	diagnosisEnvironment,
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

function formatTimingLabel(timing: string) {
	if (timing === "ON_TIME") return "Tepat waktu";
	if (timing === "EARLY") return "Lebih awal";
	if (timing === "LATE") return "Terlambat";
	return timing;
}

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
	const [zoom, setZoom] = useState<CameraZoom | null>(null);
	const zoomBusy = useRef(false);
	const [zoomPending, setZoomPending] = useState(false);
	const [zoomIssue, setZoomIssue] = useState("");
	const [environment, setEnvironment] = useState<
		DiagnosisEnvironment | undefined
	>(undefined);
	useEffect(() => {
		let active = true;
		let permission: PermissionStatus | undefined;
		const labels = diagnosisEnvironment(navigator.userAgent ?? "");
		const changed = () => {
			if (active)
				setEnvironment({
					...labels,
					permission: permission?.state ?? "unavailable",
				});
		};
		changed();
		try {
			void navigator.permissions
				?.query({ name: "geolocation" })
				.then((status) => {
					if (!active) return;
					permission = status;
					changed();
					status.addEventListener?.("change", changed);
				})
				.catch(() => {});
		} catch {
			/* Permission metadata is best effort, never inferred. */
		}
		return () => {
			active = false;
			permission?.removeEventListener?.("change", changed);
		};
	}, []);
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
	const [gpsDeniedModalOpen, setGpsDeniedModalOpen] = useState(false);
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
	const [hasProcessedQr, setHasProcessedQr] = useState(false);
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
	useEffect(() => {
		if (phase === "camera" && gpsStatus === "GPS_DENIED") {
			setGpsDeniedModalOpen(true);
		} else if (gpsStatus !== "GPS_DENIED") {
			setGpsDeniedModalOpen(false);
		}
	}, [phase, gpsStatus]);
	useEffect(() => {
		if (phase === "camera" && cameraIssue === "VIDEO_NOT_READY") {
			toast.warning(scannerErrorMessage("VIDEO_NOT_READY"), {
				id: "scanner-video-not-ready",
				position: "top-center",
			});
		}
	}, [phase, cameraIssue]);
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
		setZoom(null);
		zoomBusy.current = false;
		setZoomPending(false);
		setZoomIssue("");
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
			startingCamera.current = null;
			busy.current = false;
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
				if (
					generation.current !== attempt ||
					gps.current !== task ||
					task.controller.signal.aborted
				)
					return null;
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
				if (
					generation.current !== attempt ||
					gps.current !== task ||
					task.controller.signal.aborted
				)
					return null;
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
		setHasProcessedQr(true);
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
				distanceMeters: undefined,
				radiusMeters: undefined,
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
		setHasProcessedQr(false);
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
			// Route-entry effects must finish before flushSync replaces the video node.
			await Promise.resolve();
			if (generation.current !== attempt) return;
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
					setZoom(cameraZoom(track));
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
			// qr-scanner may replace the original DOMException with "Camera not found".
			let denied =
				cause instanceof DOMException && cause.name === "NotAllowedError";
			if (!denied) {
				try {
					denied =
						(
							await navigator.permissions?.query({
								name: "camera" as PermissionName,
							})
						)?.state === "denied";
				} catch {
					/* Unsupported permission queries keep the unavailable fallback. */
				}
			}
			if (generation.current === attempt) {
				report("START_FAILED", attempt);
				showError(denied ? "CAMERA_DENIED" : "CAMERA_UNAVAILABLE");
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
	const restartCamera =
		Boolean(cameraIssue) && (phase === "camera" || phase === "starting");
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
	// biome-ignore lint/correctness/useExhaustiveDependencies: start camera only on route entry.
	useEffect(() => {
		void startCamera(); // Auto-start once on route entry; existing effect owns cleanup.
		// Camera generation guards handle Strict Mode and late async results.
	}, []);
	const diagnosisText = locationDiagnosisText(locationDiagnosis, {
		...environment,
		timestamp: environment ? attemptStarted.current : undefined,
	});
	const diagnosisPanel = hasProcessedQr ? (
		<details
			open={phase === "error"}
			className="resora-diagnosis rounded-xl border border-border p-3 text-sm"
		>
			<summary className="cursor-pointer py-2 font-medium">
				<Info aria-hidden="true" size={20} /> Lihat diagnosis
			</summary>
			<p className="my-2 text-muted-foreground text-xs">
				Untuk pemeriksaan kendala perangkat. Tidak memuat koordinat mentah,
				token QR, atau data akun. Angka jarak/akurasi server dibulatkan ke atas.
			</p>
			<textarea
				readOnly
				aria-label="Hasil diagnosis lokasi"
				value={diagnosisText}
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
						await navigator.clipboard.writeText(diagnosisText);
						setCopyStatus("Diagnosis disalin");
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
	) : null;
	return (
		<section className="resora-scanner space-y-4">
			<div className="resora-camera-surface relative isolate flex min-h-dvh flex-col overflow-hidden">
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
				<div className="resora-scanner-header relative p-4">
					<Link
						href="/dashboard"
						onClick={stop}
						className={cn(
							buttonVariants({ variant: "ghost", size: "icon" }),
							"size-11 rounded-full bg-black/40 text-white hover:bg-black/60",
						)}
						aria-label="Kembali ke Beranda"
					>
						<ArrowLeft />
					</Link>
					<h1 className="flex items-center gap-2 rounded-full bg-black/40 px-4 py-2 font-semibold text-sm">
						<span
							className={`size-2 rounded-full ${phase === "camera" ? "bg-emerald-400" : "bg-white/50"}`}
						/>
						Scan QR
					</h1>
					<Button
						size="icon"
						onClick={openImagePicker}
						disabled={processing || mutation.isPending}
						aria-label="Pilih gambar QR"
						className="size-11 rounded-full bg-black/40 text-white hover:bg-black/60"
					>
						<ImagePlus aria-hidden="true" />
					</Button>
				</div>
				<div className="relative flex flex-1 flex-col items-center justify-center gap-5 px-8 py-10">
					<div
						aria-hidden="true"
						className="relative aspect-square w-full max-w-72 rounded-3xl border border-white/15 bg-white/5"
					>
						<span className="absolute top-0 left-0 size-8 rounded-tl-3xl border-[#FFF46E] border-t-[3px] border-l-[3px]" />
						<span className="absolute top-0 right-0 size-8 rounded-tr-3xl border-[#FFF46E] border-t-[3px] border-r-[3px]" />
						<span className="absolute bottom-0 left-0 size-8 rounded-bl-3xl border-[#FFF46E] border-b-[3px] border-l-[3px]" />
						<span className="absolute right-0 bottom-0 size-8 rounded-br-3xl border-[#FFF46E] border-r-[3px] border-b-[3px]" />
						{phase === "camera" ? (
							<span className="resora-scan-line absolute right-2 left-2 h-0.5 bg-[#FF6F6F] shadow-[0_0_12px_#FF6F6F]" />
						) : null}
					</div>
					{processing && (
						<p
							role="status"
							className="rounded-full bg-black/50 px-4 py-2 text-center text-sm"
						>
							{phase === "reading-image"
								? "Membaca QR…"
								: phase === "locating"
									? "QR terbaca, menunggu lokasi…"
									: phase === "submitting"
										? "Menunggu konfirmasi server…"
										: phase === "restarting"
											? "Memulai ulang pemindaian…"
											: "Menyiapkan kamera…"}
						</p>
					)}
				</div>
				{phase === "camera" && (
					<div
						className={
							zoom
								? "resora-camera-zoom relative mx-auto w-full max-w-xs px-4"
								: "sr-only"
						}
					>
						{zoom ? (
							<div className="space-y-2.5 text-sm">
								<div className="flex items-center justify-between gap-2">
									<span className="font-semibold text-white">Zoom kamera</span>
									<span className="rounded-full bg-[#FFF46E] px-2.5 py-0.5 font-bold text-[#333333] text-xs tabular-nums">
										{zoom.value.toLocaleString("id-ID", {
											maximumFractionDigits: 2,
										})}
										×
									</span>
								</div>
								<input
									type="range"
									aria-label="Zoom kamera"
									min={zoom.min}
									max={zoom.max}
									step={zoom.step}
									value={zoom.value}
									disabled={zoomPending}
									onChange={async (event) => {
										const stream = video.current?.srcObject;
										const track =
											stream && "getVideoTracks" in stream
												? stream.getVideoTracks()[0]
												: undefined;
										if (!track || zoomBusy.current) return;
										const attempt = generation.current;
										zoomBusy.current = true;
										setZoomPending(true);
										setZoomIssue("");
										try {
											await setCameraZoom(
												track,
												Number(event.currentTarget.value),
												zoom,
											);
											if (attempt === generation.current)
												setZoom(cameraZoom(track));
										} catch {
											if (attempt === generation.current)
												setZoomIssue(
													"Zoom belum bisa diubah. Coba lagi atau dekatkan kamera ke QR.",
												);
										} finally {
											if (attempt === generation.current) {
												zoomBusy.current = false;
												setZoomPending(false);
											}
										}
									}}
								/>
								<div className="flex items-center gap-1.5">
									{[1, 1.5, 2]
										.filter(
											(preset) => preset >= zoom.min && preset <= zoom.max,
										)
										.map((preset) => (
											<button
												key={preset}
												type="button"
												disabled={zoomPending}
												onClick={async () => {
													const stream = video.current?.srcObject;
													const track =
														stream && "getVideoTracks" in stream
															? stream.getVideoTracks()[0]
															: undefined;
													if (!track || zoomBusy.current) return;
													const attempt = generation.current;
													zoomBusy.current = true;
													setZoomPending(true);
													setZoomIssue("");
													try {
														await setCameraZoom(track, preset, zoom);
														if (attempt === generation.current)
															setZoom(cameraZoom(track));
													} catch {
														if (attempt === generation.current)
															setZoomIssue(
																"Zoom belum bisa diubah. Coba lagi atau dekatkan kamera ke QR.",
															);
													} finally {
														if (attempt === generation.current) {
															zoomBusy.current = false;
															setZoomPending(false);
														}
													}
												}}
												className="min-h-8 flex-1 rounded-lg border border-white/20 bg-white/10 px-2 font-semibold text-white text-xs tabular-nums hover:bg-white/20 disabled:opacity-50"
											>
												{preset}×
											</button>
										))}
								</div>
							</div>
						) : (
							<p className="sr-only">
								Kamera ini belum menyediakan kontrol zoom. Dekatkan kamera ke
								QR.
							</p>
						)}
						{(zoomPending || zoomIssue) && (
							<p role="status" className="mt-2 text-sm">
								{zoomPending ? "Menyesuaikan zoom…" : zoomIssue}
							</p>
						)}
					</div>
				)}
				<div className="relative flex flex-col items-center gap-3 px-5 pt-4 pb-7">
					{phase === "camera" && gpsStatus.startsWith("GPS_") && (
						<>
							<p
								role="status"
								className={
									gpsStatus === "GPS_DENIED" ? "sr-only" : "text-center text-sm"
								}
							>
								{scannerErrorMessage(gpsStatus)}
							</p>
							<Button
								onClick={() => {
									if (!gps.current?.pending && !busy.current)
										prepareLocation(generation.current);
								}}
							>
								Perbarui Lokasi
							</Button>
						</>
					)}
					{phase === "camera" && cameraIssue && (
						<p
							role="status"
							className={
								cameraIssue === "VIDEO_NOT_READY"
									? "sr-only"
									: "text-center text-sm"
							}
						>
							{scannerErrorMessage(cameraIssue)}
						</p>
					)}
					{(restartCamera || slowScan) && phase === "camera" && (
						<Button onClick={() => startCamera(true)}>
							Mulai ulang pemindaian
						</Button>
					)}

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
				</div>
			</div>
			<ActionDialog
				open={
					phase === "error" ||
					phase === "result" ||
					(phase === "camera" && gpsDeniedModalOpen)
				}
				onOpenChange={(open) => {
					if (!open) {
						if (phase === "camera" && gpsDeniedModalOpen) {
							setGpsDeniedModalOpen(false);
							return;
						}
						stop();
						void startCamera();
					}
				}}
				title={
					phase === "error"
						? unconfirmed
							? "Status kehadiran belum terkonfirmasi"
							: "Kehadiran belum tercatat"
						: phase === "result"
							? mutation.data?.status === "ALREADY_CHECKED_IN"
								? "Kamu sudah melakukan check-in"
								: "Check-in berhasil"
							: "Akses lokasi diperlukan"
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
				{phase === "camera" && gpsDeniedModalOpen ? (
					<>
						<p role="alert" className="text-sm leading-relaxed">
							{scannerErrorMessage("GPS_DENIED")}
						</p>
						<Button
							className="w-full"
							onClick={() => {
								setGpsDeniedModalOpen(false);
								if (!gps.current?.pending && !busy.current) {
									prepareLocation(generation.current);
								}
							}}
						>
							Perbarui Lokasi
						</Button>
					</>
				) : phase === "error" ? (
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
							<p>
								Ketepatan waktu: {formatTimingLabel(mutation.data.timingClass)}
							</p>
						</>
					)
				)}
				{diagnosisPanel}
			</ActionDialog>
		</section>
	);
}
