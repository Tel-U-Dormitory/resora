import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { TRPCClientError } from "@trpc/client";
import QrScanner from "qr-scanner";
import * as jsxRuntime from "react/jsx-runtime";
import ts from "typescript";
import { MAX_GPS_ACCURACY_M as backendAccuracy } from "../../../../../packages/api/src/modules/attendance/check-in/check-in-policy";
import { scanRegion } from "./check-in-camera";
import {
	acquireLocation,
	freshPosition,
	GPS_FRESH_MS,
	GPS_WINDOW_MS,
	MAX_GPS_ACCURACY_M,
} from "./check-in-location";
import {
	type CameraHandle,
	releaseCamera,
	scannerErrorMessage,
} from "./check-in-ui";

test("GPS failures explain manual fallback without internal phase labels; unknown messages never expose input", () => {
	for (const code of [
		"GPS_DENIED",
		"GPS_TIMEOUT",
		"GPS_UNAVAILABLE",
		"INVALID_LOCATION",
		"GPS_INACCURATE",
		"OUTSIDE_GEOFENCE",
	]) {
		const message = scannerErrorMessage(code);
		expect(message).toContain("KADEP HCO");
		expect(message).not.toContain("Phase");
	}
	expect(scannerErrorMessage("synthetic-secret-token-stack")).toBe(
		scannerErrorMessage("SERVER_FAILED"),
	);
	expect(scannerErrorMessage("synthetic-secret-token-stack")).not.toContain(
		"synthetic-secret",
	);
	expect(scannerErrorMessage("QR_REVOKED")).not.toBe(
		scannerErrorMessage("SESSION_CLOSED"),
	);
});

function position(accuracy = 10, timestamp = Date.now()) {
	return {
		timestamp,
		coords: { latitude: -6.97, longitude: 107.63, accuracy },
	} as GeolocationPosition;
}

function gpsFixture() {
	const watches: {
		success: PositionCallback;
		failure: PositionErrorCallback;
		options?: PositionOptions;
	}[] = [];
	const cleared: number[] = [];
	const geo = {
		watchPosition: (
			success: PositionCallback,
			failure: PositionErrorCallback,
			options: PositionOptions,
		) => {
			watches.push({ success, failure, options });
			return watches.length;
		},
		clearWatch: (id: number) => cleared.push(id),
	} as unknown as Geolocation;
	return { geo, watches, cleared };
}

test("GPS precheck matches backend and rejects stale, future, malformed or inaccurate readings", () => {
	expect(MAX_GPS_ACCURACY_M).toBe(backendAccuracy);
	expect(freshPosition(position(40))).toBe(true);
	for (const accuracy of [0, -1, 40.1, Number.NaN, Number.POSITIVE_INFINITY])
		expect(freshPosition(position(accuracy))).toBe(false);
	const now = Date.now();
	expect(freshPosition(position(10, now - GPS_FRESH_MS), now)).toBe(true);
	expect(freshPosition(position(10, now - GPS_FRESH_MS - 1), now)).toBe(false);
	expect(freshPosition(position(10, now + 1), now)).toBe(false);
	expect(
		freshPosition({
			...position(),
			coords: { ...position().coords, latitude: 91 },
		}),
	).toBe(false);
});

test("native granted/prompt permissions work without Permissions API and denied clears watch", async () => {
	for (const permission of ["granted", "prompt", "denied"]) {
		const f = gpsFixture();
		const promise = acquireLocation(f.geo, new AbortController().signal);
		expect(f.watches[0].options).toEqual({
			enableHighAccuracy: true,
			maximumAge: 0,
			timeout: 20000,
		});
		if (permission === "denied") {
			f.watches[0].failure({ code: 1 } as GeolocationPositionError);
			await expect(promise).rejects.toThrow("GPS_DENIED");
		} else {
			const reading = position();
			f.watches[0].success(reading);
			expect(await promise).toBe(reading);
		}
		expect(f.cleared).toEqual([1]);
	}
	await expect(
		acquireLocation(undefined, new AbortController().signal),
	).rejects.toThrow("GPS_UNAVAILABLE");
});

test("poor/stale GPS readings and transient errors retry until valid; late callbacks are ignored", async () => {
	const f = gpsFixture();
	const promise = acquireLocation(f.geo, new AbortController().signal);
	f.watches[0].success(position(80));
	f.watches[0].success(position(5, Date.now() - GPS_FRESH_MS - 1));
	f.watches[0].failure({ code: 2 } as GeolocationPositionError);
	expect(f.cleared).toEqual([]);
	const valid = position(20);
	f.watches[0].success(valid);
	f.watches[0].success(position(1));
	f.watches[0].failure({ code: 1 } as GeolocationPositionError);
	expect(await promise).toBe(valid);
	expect(f.cleared).toEqual([1]);
});

test("GPS deadline is bounded at 20 seconds, returns actionable errors and always clears watcher", async () => {
	const originalSet = globalThis.setTimeout;
	const originalClear = globalThis.clearTimeout;
	try {
		let expire = () => {};
		let clears = 0;
		globalThis.setTimeout = ((callback: () => void, ms: number) => {
			expect(ms).toBe(GPS_WINDOW_MS);
			expire = callback;
			return 1;
		}) as unknown as typeof setTimeout;
		globalThis.clearTimeout = (() => {
			clears++;
		}) as typeof clearTimeout;
		for (const inaccurate of [false, true]) {
			const f = gpsFixture();
			const promise = acquireLocation(f.geo, new AbortController().signal);
			if (inaccurate) f.watches[0].success(position(90));
			expire();
			await expect(promise).rejects.toThrow(
				inaccurate ? "GPS_INACCURATE" : "GPS_TIMEOUT",
			);
			expect(f.cleared).toEqual([1]);
		}
		expect(clears).toBe(2);
	} finally {
		globalThis.setTimeout = originalSet;
		globalThis.clearTimeout = originalClear;
	}
});

test("GPS cancellation rejects once, clears watcher and ignores callbacks after teardown", async () => {
	const f = gpsFixture();
	const controller = new AbortController();
	const promise = acquireLocation(f.geo, controller.signal);
	controller.abort();
	f.watches[0].success(position());
	await expect(promise).rejects.toThrow("GPS_CANCELLED");
	expect(f.cleared).toEqual([1]);
	await expect(acquireLocation(f.geo, controller.signal)).rejects.toThrow(
		"GPS_CANCELLED",
	);
	expect(f.watches).toHaveLength(1);
});
test("camera tracks release on stop and teardown even if library detaches video or React ref is null", () => {
	for (const destroy of [false, true]) {
		let tracksStopped = 0;
		let stopped = 0;
		let destroyed = 0;
		const video = {
			srcObject: {
				getTracks: () => [
					{
						stop: () => {
							tracksStopped++;
						},
					},
					{
						stop: () => {
							tracksStopped++;
						},
					},
				],
			},
		} as unknown as HTMLVideoElement;
		const scanner: CameraHandle = {
			$video: video,
			stop: () => {
				stopped++;
				video.srcObject = null;
			},
			destroy: () => {
				destroyed++;
				video.srcObject = null;
			},
		};
		releaseCamera(scanner, destroy ? null : video, destroy);
		expect(tracksStopped).toBe(2);
		expect(stopped).toBe(destroy ? 0 : 1);
		expect(destroyed).toBe(destroy ? 1 : 0);
	}
	releaseCamera(null, null, true);
});

test("releaseCamera ignores a replacement video ref and releases only the owning scanner's stream", () => {
	let ownedStops = 0;
	let replacementStops = 0;
	const owned = {
		srcObject: {
			getTracks: () => [
				{
					stop: () => {
						ownedStops++;
					},
				},
			],
		},
	} as unknown as HTMLVideoElement;
	const replacement = {
		srcObject: {
			getTracks: () => [
				{
					stop: () => {
						replacementStops++;
					},
				},
			],
		},
	} as unknown as HTMLVideoElement;
	const scanner: CameraHandle = {
		$video: owned,
		stop: () => {},
		destroy: () => {},
	};
	releaseCamera(scanner, replacement, true);
	expect(ownedStops).toBe(1);
	expect(replacementStops).toBe(0);
});

type Element = {
	type: unknown;
	key?: string | null;
	props: Record<string, unknown>;
};
function elements(node: unknown): Element[] {
	if (Array.isArray(node)) return node.flatMap(elements);
	if (!node || typeof node !== "object" || !("props" in node)) return [];
	const element = node as Element;
	return [element, ...elements(element.props.children)];
}

// Execute the actual scanner component with offline hooks, media and transport
// doubles, following the existing Broadcast/Committee JSX harness convention.
function scannerFixture(realCameraLifecycle = false) {
	let clock = Date.now();
	class Clock extends Date {
		static now() {
			return clock;
		}
	}
	const healthChecks = new Map<number, () => void>();
	let healthId = 0;
	const gps = gpsFixture();
	const hooks: unknown[] = [];
	let cursor = 0;
	const cleanups: (() => void)[] = [];
	const decoders: ((result: { data: string }) => void)[] = [];
	const decodeErrors: ((error: Error | string) => void)[] = [];
	const logs: unknown[][] = [];
	const visibilityListeners = new Set<() => void>();
	const document = {
		hidden: false,
		addEventListener: (_event: string, callback: () => void) =>
			visibilityListeners.add(callback),
		removeEventListener: (_event: string, callback: () => void) =>
			visibilityListeners.delete(callback),
	};
	const requests: { qrToken: string; location: unknown }[] = [];
	const successes: string[] = [];
	let failure: unknown;
	let holdRequest: Promise<void> | undefined;
	let holdCamera: Promise<void> | undefined;
	let holdRefresh: Promise<void> | undefined;
	let onSuccess: (() => void | Promise<void>) | undefined;
	let imageResult: Promise<{ data: string }> = Promise.resolve({ data: token });
	const images: File[] = [];
	let pickerClicks = 0;
	const cameras: Scanner[] = [];
	const videos = new Map<string | null | undefined, HTMLVideoElement>();
	const mutation = {
		isPending: false,
		data: undefined as unknown,
		reset: () => {
			mutation.data = undefined;
		},
		mutateAsync: async (input: { qrToken: string; location: unknown }) => {
			requests.push(input);
			if (holdRequest) await holdRequest;
			if (failure) throw failure;
			mutation.data = {
				status: "CHECKED_IN",
				eventName: "Synthetic event",
				attendanceAt: new Date().toISOString(),
				timingClass: "ON_TIME",
			};
			await onSuccess?.();
		},
	};
	class Scanner {
		static NO_QR_CODE_FOUND = QrScanner.NO_QR_CODE_FOUND;
		static scanImage(file: File) {
			images.push(file);
			return imageResult;
		}
		$video: HTMLVideoElement;
		_active = false;
		_paused = false;
		_destroyed = false;
		_flashOn = false;
		_qrEnginePromise = Promise.resolve({});
		stream?: MediaStream;
		stops = 0;
		destroys = 0;
		options: {
			maxScansPerSecond?: number;
			calculateScanRegion?: (video: HTMLVideoElement) => QrScanner.ScanRegion;
		};
		constructor(
			video: HTMLVideoElement,
			decode: (result: { data: string }) => void,
			options: {
				onDecodeError: (cause: Error | string) => void;
				maxScansPerSecond?: number;
				calculateScanRegion?: (video: HTMLVideoElement) => QrScanner.ScanRegion;
			},
		) {
			this.$video = video;
			this.options = options;
			decoders.push(decode);
			decodeErrors.push(options.onDecodeError);
			cameras.push(this);
		}
		start() {
			if (realCameraLifecycle)
				return QrScanner.prototype.start.call(this as unknown as QrScanner);
			this.$video.srcObject = {
				getTracks: () => [
					{
						readyState: "live",
						stop: () => {},
						addEventListener: () => {},
						removeEventListener: () => {},
					},
				],
			} as unknown as MediaStream;
			return holdCamera ?? Promise.resolve();
		}
		async _getCameraStream() {
			const pending = holdCamera;
			if (pending) await pending;
			return { stream: this.stream, facingMode: "environment" };
		}
		_setVideoMirror() {}
		pause(immediate = false) {
			return QrScanner.prototype.pause.call(
				this as unknown as QrScanner,
				immediate,
			);
		}
		stop() {
			this.stops++;
			if (realCameraLifecycle)
				QrScanner.prototype.stop.call(this as unknown as QrScanner);
		}
		destroy() {
			this.destroys++;
			if (realCameraLifecycle)
				QrScanner.prototype.destroy.call(this as unknown as QrScanner);
		}
	}
	const mocks: Record<string, unknown> = {
		"react/jsx-runtime": jsxRuntime,
		"react-dom": {
			flushSync: (run: () => void) => {
				run();
				render();
			},
		},
		react: {
			useCallback: (run: unknown) => run,
			useRef: (initial: unknown) => {
				const index = cursor++;
				hooks[index] ??= { current: initial };
				return hooks[index];
			},
			useState: (initial: unknown) => {
				const index = cursor++;
				if (!(index in hooks)) hooks[index] = initial;
				return [
					hooks[index],
					(value: unknown) => {
						hooks[index] =
							typeof value === "function" ? value(hooks[index]) : value;
					},
				];
			},
			useEffect: (run: () => (() => void) | undefined) => {
				const index = cursor++;
				if (!(index in hooks)) {
					hooks[index] = true;
					const cleanup = run();
					if (cleanup) cleanups.push(cleanup);
				}
			},
		},
		"@tanstack/react-query": {
			useMutation: (options: { onSuccess: () => void | Promise<void> }) => {
				onSuccess = options.onSuccess;
				return mutation;
			},
		},
		"@trpc/client": { TRPCClientError },
		"qr-scanner": { __esModule: true, default: Scanner },
		"@resora/ui/components/action-dialog": { ActionDialog: "ActionDialog" },
		"@resora/ui/components/button": {
			Button: "Button",
			buttonVariants: () => "",
		},
		"lucide-react": Object.fromEntries(
			[
				"ArrowLeft",
				"Camera",
				"CheckCircle2",
				"ImagePlus",
				"LoaderCircle",
				"ScanLine",
			].map((name) => [name, name]),
		),
		"next/link": { default: "Link" },
		sonner: {
			toast: { success: (message: string) => successes.push(message) },
		},
		"@/lib/utils": { cn: () => "" },
		"@/utils/trpc": {
			trpc: { attendance: { checkIn: { mutationOptions: () => ({}) } } },
		},
		"../../utils/internal-event-queries": {
			refreshAttendanceQueries: async () => holdRefresh,
		},
		"./check-in-location": { acquireLocation, freshPosition },
		"./check-in-camera": { scanRegion },
		"./check-in-ui": { releaseCamera, scannerErrorMessage },
		"../../components/event-feedback": {
			formatEventTime: (value: string) => value,
		},
	};
	const source = readFileSync(
		new URL("./check-in-scanner.tsx", import.meta.url),
		"utf8",
	);
	const js = ts.transpileModule(source, {
		compilerOptions: {
			module: ts.ModuleKind.CommonJS,
			target: ts.ScriptTarget.ES2022,
			jsx: ts.JsxEmit.ReactJSX,
		},
	}).outputText;
	const exported = {} as { default: () => unknown };
	new Function(
		"require",
		"exports",
		"navigator",
		"window",
		"document",
		"console",
		"setInterval",
		"clearInterval",
		"Date",
		js,
	)(
		(name: string) => {
			if (!(name in mocks)) throw new Error(`Unexpected module: ${name}`);
			return mocks[name];
		},
		exported,
		{ geolocation: gps.geo, mediaDevices: { getUserMedia: () => {} } },
		{ isSecureContext: true },
		document,
		{ info: (...args: unknown[]) => logs.push(args) },
		(run: () => void) => {
			healthChecks.set(++healthId, run);
			return healthId;
		},
		(id: number) => healthChecks.delete(id),
		Clock,
	);
	const render = () => {
		cursor = 0;
		const tree = elements(exported.default());
		const video = tree.find((item) => item.type === "video");
		if (!videos.has(video?.key))
			videos.set(video?.key, {
				srcObject: null,
				play: async () => {},
				pause: () => {},
				readyState: 2,
				videoWidth: 640,
				videoHeight: 480,
				paused: false,
				ended: false,
				currentTime: 0,
				getBoundingClientRect: () => ({
					left: 0,
					top: 0,
					width: 320,
					height: 600,
				}),
				removeEventListener: () => {},
			} as unknown as HTMLVideoElement);
		(video?.props.ref as { current: unknown }).current = videos.get(video?.key);
		const input = tree.find((item) => item.type === "input");
		(input?.props.ref as { current: unknown }).current = {
			click: () => pickerClicks++,
		};
		return tree;
	};
	const button = (label: string) => {
		const found = render().find(
			(item) =>
				item.type === "Button" &&
				(item.props["aria-label"] === label ||
					item.props.children === label ||
					(Array.isArray(item.props.children) &&
						item.props.children.includes(label))),
		);
		if (!found) throw new Error(`Button missing: ${label}`);
		return found.props.onClick as () => Promise<void>;
	};
	return {
		...gps,
		requests,
		successes,
		render,
		button,
		decoders,
		cameras,
		decodeErrors,
		logs,
		document,
		visibilityListeners,
		healthChecks,
		advance: (ms: number) => {
			clock += ms;
			for (const run of [...healthChecks.values()]) run();
		},
		images,
		pickerClicks: () => pickerClicks,
		setImageResult: (value: Promise<{ data: string }>) => {
			imageResult = value;
		},
		chooseImage: (file?: File) => {
			const input = render().find((item) => item.type === "input");
			if (!input) throw new Error("Image input missing");
			const target = { files: file ? [file] : [], value: "selected-image" };
			(input.props.onChange as (event: unknown) => void)({
				currentTarget: target,
			});
			return target;
		},
		videoEvent: (name: string) => {
			const video = render().find((item) => item.type === "video");
			if (!video) throw new Error("Video missing");
			(video.props[name] as (event: unknown) => void)({
				currentTarget: cameras.at(-1)?.$video,
			});
		},
		setFailure: (value: unknown) => {
			failure = value;
		},
		holdRequest: (value: Promise<void>) => {
			holdRequest = value;
		},
		holdRefresh: (value: Promise<void>) => {
			holdRefresh = value;
		},
		holdCamera: (value: Promise<void>) => {
			holdCamera = value;
		},
		unmount: () => {
			for (const cleanup of cleanups) cleanup();
		},
	};
}
async function flush() {
	for (let i = 0; i < 12; i++) await Promise.resolve();
}

test("one healthy camera control preserves GPS progress, hides ready status and stops owned resources", async () => {
	const f = scannerFixture();
	try {
		const open = f.button("Buka kamera dan lokasi");
		const opening = open();
		await open();
		await opening;
		expect(f.cameras).toHaveLength(1);
		expect(f.watches).toHaveLength(1);
		expect(
			f
				.render()
				.filter((item) => item.type === "Button" && item.props.size === "icon"),
		).toHaveLength(1);
		expect(
			f
				.render()
				.some(
					(item) =>
						item.props.children === "Arahkan kamera ke QR Code kegiatan",
				),
		).toBe(true);
		expect(
			f
				.render()
				.some(
					(item) =>
						item.props.children === "Menyiapkan lokasi (maksimal 20 detik)…",
				),
		).toBe(true);
		expect(
			f
				.render()
				.some(
					(item) =>
						item.props.children === "Gunakan QR kegiatan yang ditampilkan HCO",
				),
		).toBe(false);
		f.watches[0].success(position());
		await flush();
		expect(
			f.render().filter((item) => item.props.role === "status"),
		).toHaveLength(1);
		expect(
			f
				.render()
				.some(
					(item) =>
						typeof item.props.children === "string" &&
						item.props.children.includes("Lokasi siap"),
				),
		).toBe(false);
		f.button("Hentikan kamera dan lokasi")();
		await f.button("Buka kamera dan lokasi")();
		f.button("Hentikan kamera dan lokasi")(); // Cancel a still-pending GPS watcher.
		expect(f.cleared).toEqual([1, 2]);
		expect(f.cameras.every((camera) => camera.destroys > 0)).toBe(true);
		f.watches[1].success(position());
		f.decoders[1]({ data: token });
		await flush();
		expect(f.requests).toHaveLength(0);
		expect(f.button("Buka kamera dan lokasi")).toBeFunction();
	} finally {
		f.unmount();
	}
});

test("GPS-only errors remain actionable and retry never restarts a healthy scanner", async () => {
	const originalSet = globalThis.setTimeout;
	const originalClear = globalThis.clearTimeout;
	try {
		let expire = () => {};
		globalThis.setTimeout = ((run: () => void) => {
			expire = run;
			return 1;
		}) as unknown as typeof setTimeout;
		globalThis.clearTimeout = (() => {}) as typeof clearTimeout;
		for (const code of [
			"GPS_DENIED",
			"GPS_TIMEOUT",
			"GPS_INACCURATE",
			"GPS_UNAVAILABLE",
		]) {
			const f = scannerFixture();
			try {
				await f.button("Buka kamera dan lokasi")();
				if (code === "GPS_DENIED")
					f.watches[0].failure({ code: 1 } as GeolocationPositionError);
				else {
					if (code === "GPS_INACCURATE") f.watches[0].success(position(90));
					if (code === "GPS_UNAVAILABLE")
						f.watches[0].failure({ code: 2 } as GeolocationPositionError);
					expire();
				}
				await flush();
				expect(
					f
						.render()
						.some((item) => item.props.children === scannerErrorMessage(code)),
				).toBe(true);
				expect(f.button("Hentikan kamera dan lokasi")).toBeFunction();
				const retry = f.button("Perbarui Lokasi");
				retry();
				retry();
				expect(f.watches).toHaveLength(2);
				f.watches[1].success(position());
				await flush();
				expect(
					f.render().filter((item) => item.props.role === "status"),
				).toHaveLength(1);
				expect(f.cameras).toHaveLength(1);
				expect(f.requests).toHaveLength(0);
			} finally {
				f.unmount();
			}
		}
	} finally {
		globalThis.setTimeout = originalSet;
		globalThis.clearTimeout = originalClear;
	}
});

test("the primary control cannot interrupt QR processing or submission; the success dialog still resets", async () => {
	const f = scannerFixture();
	try {
		let release = () => {};
		f.holdRequest(
			new Promise<void>((resolve) => {
				release = resolve;
			}),
		);
		await f.button("Buka kamera dan lokasi")();
		const stop = f.button("Hentikan kamera dan lokasi");
		f.decoders[0]({ data: token });
		stop(); // A handler captured before QR processing is also blocked by busy.
		expect(
			f
				.render()
				.find((item) => item.type === "Button" && item.props.size === "icon")
				?.props.disabled,
		).toBe(true);
		expect(
			f.render().filter((item) => item.props.role === "status"),
		).toHaveLength(1);
		f.watches[0].success(position());
		await flush();
		stop();
		f.decoders[0]({ data: token });
		expect(f.requests).toHaveLength(1);
		expect(f.cameras).toHaveLength(1);
		expect(
			f
				.render()
				.find((item) => item.type === "Button" && item.props.size === "icon")
				?.props.disabled,
		).toBe(true);
		release();
		await flush();
		const dialog = f.render().find((item) => item.type === "ActionDialog");
		if (!dialog) throw new Error("Result dialog missing");
		expect(dialog?.props.open).toBe(true);
		expect(dialog?.props.title).toBe("Check-in berhasil");
		expect(f.successes).toHaveLength(1);
		(dialog.props.onOpenChange as (open: boolean) => void)(false);
		expect(
			f.render().find((item) => item.type === "ActionDialog")?.props.open,
		).toBe(false);
		expect(f.button("Buka kamera dan lokasi")).toBeFunction();
	} finally {
		f.unmount();
	}
});

test("initial and transient video readiness stays diagnostic until a stalled frame needs recovery", async () => {
	const f = scannerFixture();
	try {
		let release = () => {};
		f.holdCamera(
			new Promise<void>((resolve) => {
				release = resolve;
			}),
		);
		const opening = f.button("Buka kamera dan lokasi")();
		await flush();
		const video = f.cameras[0].$video;
		Object.defineProperty(video, "readyState", {
			value: 1,
			configurable: true,
		});
		release();
		await opening;
		for (const event of ["onWaiting", "onPause", "onEmptied", "onLoadedData"])
			f.videoEvent(event);
		expect(
			f
				.render()
				.some(
					(item) =>
						item.props.children === scannerErrorMessage("VIDEO_NOT_READY"),
				),
		).toBe(false);
		expect(
			f.logs.filter((entry) =>
				JSON.stringify(entry).includes("VIDEO_NOT_READY"),
			),
		).toHaveLength(1);
		expect(f.button("Hentikan kamera dan lokasi")).toBeFunction();
		f.videoEvent("onStalled");
		expect(
			f
				.render()
				.some(
					(item) =>
						item.props.children === scannerErrorMessage("VIDEO_NOT_READY"),
				),
		).toBe(true);
		Object.defineProperty(video, "readyState", {
			value: 2,
			configurable: true,
		});
		f.videoEvent("onPlaying");
		expect(f.button("Hentikan kamera dan lokasi")).toBeFunction();
		expect(
			f
				.render()
				.some(
					(item) =>
						item.props.children === scannerErrorMessage("VIDEO_NOT_READY"),
				),
		).toBe(false);
		expect(f.cameras).toHaveLength(1);
	} finally {
		f.unmount();
	}
});

test("normal empty frames stay quiet; manual restart replaces decoder, ignores stale callbacks and keeps GPS distinct", async () => {
	const f = scannerFixture();
	try {
		await f.button("Buka kamera dan lokasi")();
		const emptyFrames = [
			QrScanner.NO_QR_CODE_FOUND,
			new Error(QrScanner.NO_QR_CODE_FOUND),
			`Scanner error: ${QrScanner.NO_QR_CODE_FOUND}`,
			new Error(`Scanner error: ${QrScanner.NO_QR_CODE_FOUND}`),
		];
		for (let i = 0; i < 100; i++)
			f.decodeErrors[0](emptyFrames[i % emptyFrames.length]);
		expect(
			f.logs.filter((entry) => JSON.stringify(entry).includes("FRAMES_NO_QR")),
		).toHaveLength(1);
		expect(
			f.logs.some((entry) => JSON.stringify(entry).includes("DECODER_FAILED")),
		).toBe(false);
		expect(f.requests).toHaveLength(0);
		const old = f.cameras[0];
		f.decodeErrors[0](new Error("synthetic-decoder-failure"));
		await f.button("Mulai ulang pemindaian")();
		expect(old.destroys).toBeGreaterThan(0);
		expect(f.cameras).toHaveLength(2);
		expect(f.cameras[1].$video).not.toBe(old.$video);
		expect(f.cleared).toContain(1);
		f.decoders[0]({ data: token });
		f.decodeErrors[0](new Error("private-stale-decoder-error"));
		await flush();
		expect(f.requests).toHaveLength(0);
		f.decodeErrors[1](new Error("synthetic-decoder-failure"));
		const restart = f.button("Mulai ulang pemindaian");
		f.decoders[1]({ data: token });
		await flush();
		expect(f.requests).toHaveLength(0);
		expect(
			f.logs.some((entry) => JSON.stringify(entry).includes("WAITING_GPS")),
		).toBe(true);
		expect(
			f
				.render()
				.some(
					(item) =>
						item.props.children ===
						"QR terbaca, memverifikasi kehadiran… Menunggu lokasi (hingga 20 detik).",
				),
		).toBe(true);
		expect(
			f
				.render()
				.some((item) => item.props["aria-label"] === "Mulai ulang pemindaian"),
		).toBe(false);
		let release = () => {};
		f.holdRequest(
			new Promise<void>((resolve) => {
				release = resolve;
			}),
		);
		f.watches[1].success(position());
		await flush();
		await restart(); // A stale control cannot restart during submit.
		f.decoders[1]({ data: token });
		expect(f.cameras).toHaveLength(2);
		expect(f.requests).toHaveLength(1);
		expect(
			f.logs.some((entry) => JSON.stringify(entry).includes("SUBMITTING")),
		).toBe(true);
		release();
		await flush();
		expect(f.successes).toHaveLength(1);
		for (const entry of f.logs) {
			expect(entry[0]).toBe("[ATTENDANCE_SCANNER]");
			expect(Object.keys(entry[1] as object).sort()).toEqual([
				"attempt",
				"elapsedMs",
				"event",
			]);
		}
		expect(JSON.stringify(f.logs)).not.toContain(token);
		expect(JSON.stringify(f.logs)).not.toContain("private-stale");
		expect(JSON.stringify(f.logs)).not.toContain("latitude");
	} finally {
		f.unmount();
	}
});

test("restart pending state prevents repeated startup and reports sanitized restart failure", async () => {
	const f = scannerFixture();
	try {
		await f.button("Buka kamera dan lokasi")();
		f.decodeErrors[0](new Error("synthetic-decoder-failure"));
		let reject = (_cause: Error) => {};
		f.holdCamera(
			new Promise<void>((_resolve, fail) => {
				reject = fail;
			}),
		);
		const restart = f.button("Mulai ulang pemindaian");
		const pending = restart();
		await restart();
		await flush();
		expect(f.cameras).toHaveLength(2);
		expect(
			f
				.render()
				.some((item) => item.props.children === "Memulai ulang pemindaian…"),
		).toBe(true);
		expect(
			f
				.render()
				.find(
					(item) => item.props["aria-label"] === "Hentikan kamera dan lokasi",
				)?.props.disabled,
		).toBe(false); // The primary control still permits cancellation during startup.
		reject(new Error("private-camera-credential-token"));
		await pending;
		expect(
			f
				.render()
				.some(
					(item) =>
						item.props.children === scannerErrorMessage("CAMERA_UNAVAILABLE"),
				),
		).toBe(true);
		expect(
			f.logs.some((entry) => JSON.stringify(entry).includes("START_FAILED")),
		).toBe(true);
		expect(JSON.stringify(f.logs)).not.toContain("private-camera");
		expect(f.cameras[1].destroys).toBeGreaterThan(0);
		expect(f.requests).toHaveLength(0);
	} finally {
		f.unmount();
	}
});

test("fresh prepared GPS submits once without reacquisition or a misleading waiting-GPS diagnostic", async () => {
	const f = scannerFixture();
	try {
		await f.button("Buka kamera dan lokasi")();
		f.watches[0].success(position());
		await flush();
		f.decoders[0]({ data: token });
		f.decoders[0]({ data: token });
		await flush();
		expect(f.requests).toHaveLength(1);
		expect(f.watches).toHaveLength(1);
		expect(
			f.logs.some((entry) => JSON.stringify(entry).includes("WAITING_GPS")),
		).toBe(false);
		expect(f.successes).toHaveLength(1);
	} finally {
		f.unmount();
	}
});

test("unmount during pending camera startup cancels GPS and ignores late startup, decoder and permission callbacks", async () => {
	const f = scannerFixture();
	let release = () => {};
	f.holdCamera(
		new Promise<void>((resolve) => {
			release = resolve;
		}),
	);
	const opening = f.button("Buka kamera dan lokasi")();
	await flush();
	f.unmount();
	const logs = f.logs.length;
	f.watches[0].success(position());
	f.watches[0].failure({ code: 1 } as GeolocationPositionError);
	f.decoders[0]({ data: token });
	release();
	await opening;
	expect(f.cameras[0].destroys).toBeGreaterThan(0);
	expect(f.cleared).toEqual([1]);
	expect(f.requests).toHaveLength(0);
	expect(f.successes).toHaveLength(0);
	expect(f.logs).toHaveLength(logs);
	expect(f.visibilityListeners.size).toBe(0);
});

test("recovered decoder clears its warning only after a successful decode attempt, not video playback alone", async () => {
	const f = scannerFixture();
	try {
		await f.button("Buka kamera dan lokasi")();
		f.decodeErrors[0](new Error("synthetic-decoder-failure"));
		const warning = () =>
			f
				.render()
				.some(
					(item) =>
						item.props.children === scannerErrorMessage("DECODER_FAILED"),
				);
		expect(warning()).toBe(true);
		f.videoEvent("onPlaying");
		expect(warning()).toBe(true);
		for (let i = 0; i < 100; i++) f.decodeErrors[0](QrScanner.NO_QR_CODE_FOUND);
		expect(warning()).toBe(false);
		expect(
			f.logs.filter((entry) => JSON.stringify(entry).includes("FRAMES_NO_QR")),
		).toHaveLength(1);
		expect(f.requests).toHaveLength(0);
	} finally {
		f.unmount();
	}
});

test("new live preview clears an old stream-ended warning; transient video readiness recovers without restart", async () => {
	const f = scannerFixture();
	try {
		await f.button("Buka kamera dan lokasi")();
		const video = f.cameras[0].$video;
		const listeners = new Set<() => void>();
		const track = {
			kind: "video",
			readyState: "live",
			stop: () => {},
			addEventListener: (_event: string, run: () => void) => listeners.add(run),
			removeEventListener: (_event: string, run: () => void) =>
				listeners.delete(run),
		};
		video.srcObject = { getTracks: () => [track] } as unknown as MediaStream;
		f.videoEvent("onPlaying");
		track.readyState = "ended";
		for (const run of listeners) run();
		const warning = () =>
			f
				.render()
				.some(
					(item) => item.props.children === scannerErrorMessage("STREAM_ENDED"),
				);
		expect(warning()).toBe(true);
		f.videoEvent("onPlaying"); // Old frame metadata alone cannot revive an ended track.
		expect(warning()).toBe(true);
		f.decodeErrors[0](`Scanner error: ${QrScanner.NO_QR_CODE_FOUND}`);
		expect(warning()).toBe(true); // Decoder evidence alone cannot revive the stream either.
		const replacement = { ...track, readyState: "live" };
		video.srcObject = {
			getTracks: () => [replacement],
		} as unknown as MediaStream;
		f.videoEvent("onPlaying");
		expect(warning()).toBe(false);
		Object.defineProperty(video, "readyState", {
			value: 1,
			configurable: true,
		});
		f.videoEvent("onWaiting");
		expect(
			f
				.render()
				.some(
					(item) =>
						item.props.children === scannerErrorMessage("VIDEO_NOT_READY"),
				),
		).toBe(false); // A transient loading event is diagnostic, not an actionable failure.
		f.videoEvent("onStalled");
		expect(
			f
				.render()
				.some(
					(item) =>
						item.props.children === scannerErrorMessage("VIDEO_NOT_READY"),
				),
		).toBe(true);
		Object.defineProperty(video, "readyState", {
			value: 2,
			configurable: true,
		});
		f.videoEvent("onPlaying");
		expect(
			f
				.render()
				.some(
					(item) =>
						item.props.children === scannerErrorMessage("VIDEO_NOT_READY"),
				),
		).toBe(false);
		expect(f.cameras).toHaveLength(1);
		expect(f.requests).toHaveLength(0);
	} finally {
		f.unmount();
	}
});

test("technical decoder/video/track diagnostics are bounded and cleanup removes listeners and stale activity", async () => {
	const f = scannerFixture();
	try {
		await f.button("Buka kamera dan lokasi")();
		const camera = f.cameras[0];
		for (let i = 0; i < 100; i++)
			f.decodeErrors[0](new Error("private-qr-gps-cookie-details"));
		expect(
			f.logs.filter((entry) =>
				JSON.stringify(entry).includes("DECODER_FAILED"),
			),
		).toHaveLength(1);
		expect(
			f
				.render()
				.some(
					(item) =>
						item.props.children === scannerErrorMessage("DECODER_FAILED"),
				),
		).toBe(true);
		expect(JSON.stringify(f.logs)).not.toContain("private-qr");
		const listeners = new Set<() => void>();
		let stops = 0;
		camera.$video.srcObject = {
			getTracks: () => [
				{
					readyState: "live",
					stop: () => {
						stops++;
					},
					addEventListener: (_type: string, run: () => void) =>
						listeners.add(run),
					removeEventListener: (_type: string, run: () => void) =>
						listeners.delete(run),
				},
			],
		} as unknown as MediaStream;
		Object.defineProperty(camera.$video, "readyState", {
			value: 1,
			configurable: true,
		});
		f.videoEvent("onWaiting");
		expect(
			f.logs.some((entry) => JSON.stringify(entry).includes("VIDEO_NOT_READY")),
		).toBe(true);
		Object.defineProperty(camera.$video, "readyState", {
			value: 2,
			configurable: true,
		});
		f.videoEvent("onPlaying");
		expect(listeners.size).toBe(1);
		for (const run of listeners) run();
		expect(
			f
				.render()
				.some(
					(item) => item.props.children === scannerErrorMessage("STREAM_ENDED"),
				),
		).toBe(true);
		await f.button("Mulai ulang pemindaian")();
		expect(listeners.size).toBe(0);
		expect(stops).toBeGreaterThan(0);
		expect(camera.destroys).toBeGreaterThan(0);
		expect(f.requests).toHaveLength(0);
		f.unmount();
		expect(f.visibilityListeners.size).toBe(0);
		const logs = f.logs.length;
		f.decoders[0]({ data: token });
		f.decodeErrors[0]("private-error-after-unmount");
		expect(f.logs).toHaveLength(logs);
	} finally {
		f.unmount();
	}
});
const token =
	"resora:v1:synthetic-session:synthetic-challenge:synthetic-signature";

test.each([false, true])(
	"pending startup A -> startup B: late cleanup and tab resume preserve B's owned stream (restart=%s)",
	async (restart) => {
		const originalSet = globalThis.setTimeout;
		const originalClear = globalThis.clearTimeout;
		const globals = ["window", "document", "MediaStream"].map(
			(key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const,
		);
		const timers: { run: () => void; ms: number }[] = [];
		class Stream {
			stops = 0;
			tracks = [
				{
					readyState: "live",
					addEventListener: () => {},
					removeEventListener: () => {},
					stop: () => {
						this.stops++;
					},
				},
			];
			getTracks() {
				return [...this.tracks];
			}
			removeTrack(track: (typeof this.tracks)[number]) {
				this.tracks = this.tracks.filter((item) => item !== track);
			}
		}
		const f = scannerFixture(true);
		try {
			Object.defineProperty(globalThis, "window", {
				configurable: true,
				value: {
					location: { protocol: "https:" },
					removeEventListener: () => {},
				},
			});
			Object.defineProperty(globalThis, "document", {
				configurable: true,
				value: f.document,
			});
			Object.defineProperty(globalThis, "MediaStream", {
				configurable: true,
				value: Stream,
			});
			globalThis.setTimeout = ((run: () => void, ms: number) => {
				timers.push({ run, ms });
				return timers.length;
			}) as unknown as typeof setTimeout;
			globalThis.clearTimeout = (() => {}) as typeof clearTimeout;
			let releaseA = () => {};
			f.holdCamera(
				new Promise<void>((resolve) => {
					releaseA = resolve;
				}),
			);
			const openingA = f.button("Buka kamera dan lokasi")();
			await flush();
			const a = f.cameras[0];
			const streamA = new Stream();
			a.stream = streamA as unknown as MediaStream;
			if (!restart) f.button("Hentikan kamera dan lokasi")();
			else f.videoEvent("onError"); // A startup failure makes the same control restart.
			let releaseB = () => {};
			f.holdCamera(
				new Promise<void>((resolve) => {
					releaseB = resolve;
				}),
			);
			const openingB = f.button(
				restart ? "Mulai ulang pemindaian" : "Buka kamera dan lokasi",
			)();
			await flush();
			const b = f.cameras[1];
			const streamB = new Stream();
			b.stream = streamB as unknown as MediaStream;
			releaseB();
			await openingB;
			releaseA();
			await openingA;
			const visibility = (
				QrScanner.prototype as unknown as {
					_onVisibilityChange: (this: unknown) => void;
				}
			)._onVisibilityChange;
			for (const hidden of [true, false]) {
				f.document.hidden = hidden;
				for (const listener of f.visibilityListeners) listener();
				visibility.call(b);
				await flush();
			}
			f.videoEvent("onPlaying");
			for (const timer of timers.filter((timer) => timer.ms === 300))
				timer.run();
			await flush();
			expect(streamB.stops).toBe(0);
			expect(a.$video).not.toBe(b.$video);
			expect(streamA.stops).toBeGreaterThan(0);
			expect(b.$video.srcObject).toBe(streamB as unknown as MediaStream);
			expect(b._active).toBe(true);
			expect(b._destroyed).toBe(false);
			expect(
				f.logs.some((entry) => JSON.stringify(entry).includes("BACKGROUND")),
			).toBe(true);
			expect(
				f.logs.some((entry) => JSON.stringify(entry).includes("FOREGROUND")),
			).toBe(true);
			expect(f.requests).toHaveLength(0);
			f.watches[1].success(position());
			await flush();
			f.decoders[1]({ data: token });
			await flush();
			expect(f.requests).toHaveLength(1);
		} finally {
			f.unmount();
			await flush();
			globalThis.setTimeout = originalSet;
			globalThis.clearTimeout = originalClear;
			for (const [key, descriptor] of globals) {
				if (descriptor) Object.defineProperty(globalThis, key, descriptor);
				else Reflect.deleteProperty(globalThis, key);
			}
		}
	},
);

test("Buka Kamera starts GPS immediately without blocking decoding; a pending location allows only one submission", async () => {
	const f = scannerFixture();
	try {
		let release = () => {};
		f.holdCamera(
			new Promise<void>((resolve) => {
				release = resolve;
			}),
		);
		const opening = f.button("Buka kamera dan lokasi")();
		expect(f.watches).toHaveLength(1);
		expect(f.requests).toHaveLength(0);
		await flush();
		f.decoders[0]({ data: token });
		f.decoders[0]({ data: token });
		expect(f.requests).toHaveLength(0);
		f.watches[0].success(position(70));
		expect(f.requests).toHaveLength(0);
		f.watches[0].success(position(20));
		await flush();
		expect(f.requests).toHaveLength(1);
		expect(f.requests[0].qrToken).toBe(token);
		expect(f.successes).toHaveLength(1);
		f.decoders[0]({ data: token }); // Queued decoder after success is also ignored.
		expect(f.requests).toHaveLength(1);
		release();
		await opening;
		expect(
			f.render().find((item) => item.type === "ActionDialog")?.props.title,
		).toBe("Check-in berhasil");
	} finally {
		f.unmount();
	}
});

test("timeout or persistently poor accuracy can recover with a new GPS window without rescanning", async () => {
	const originalSet = globalThis.setTimeout;
	const originalClear = globalThis.clearTimeout;
	try {
		let expire = () => {};
		globalThis.setTimeout = ((callback: () => void) => {
			expire = callback;
			return 1;
		}) as unknown as typeof setTimeout;
		globalThis.clearTimeout = (() => {}) as typeof clearTimeout;
		for (const inaccurate of [false, true]) {
			const f = scannerFixture();
			try {
				await f.button("Buka kamera dan lokasi")();
				f.decoders[0]({ data: token });
				if (inaccurate) f.watches[0].success(position(90));
				expire();
				await flush();
				expect(f.requests).toHaveLength(0);
				f.button("Perbarui Lokasi")();
				f.watches[1].success(position());
				await flush();
				expect(f.requests).toHaveLength(1);
				expect(f.decoders).toHaveLength(1);
				expect(f.cleared).toEqual([1, 2]);
			} finally {
				f.unmount();
			}
		}
	} finally {
		globalThis.setTimeout = originalSet;
		globalThis.clearTimeout = originalClear;
	}
});

test("permission recovery and manual fresh GPS retry preserve QR only in memory, without rescanning", async () => {
	const f = scannerFixture();
	try {
		await f.button("Buka kamera dan lokasi")();
		f.decoders[0]({ data: token });
		f.watches[0].failure({ code: 1 } as GeolocationPositionError);
		await flush();
		expect(f.requests).toHaveLength(0);
		const retry = f.button("Perbarui Lokasi");
		retry();
		retry();
		expect(f.watches).toHaveLength(2);
		f.watches[0].success(position()); // Old watcher cannot submit.
		expect(f.requests).toHaveLength(0);
		f.watches[1].success(position());
		await flush();
		expect(f.requests).toHaveLength(1);
		expect(f.decoders).toHaveLength(1);
		expect(f.cleared).toEqual([1, 2]);
	} finally {
		f.unmount();
	}
});

test("location-only recovery never calls backend and stale prepared positions require a fresh acquisition", async () => {
	const f = scannerFixture();
	try {
		await f.button("Buka kamera dan lokasi")();
		f.watches[0].failure({ code: 1 } as GeolocationPositionError);
		await flush();
		f.button("Perbarui Lokasi")();
		const reading = position();
		f.watches[1].success(reading);
		await flush();
		expect(f.requests).toHaveLength(0);
		Object.defineProperty(reading, "timestamp", {
			value: Date.now() - GPS_FRESH_MS - 1,
		});
		f.decoders[0]({ data: token });
		expect(f.watches).toHaveLength(3);
		expect(f.requests).toHaveLength(0);
		f.watches[2].success(position());
		await flush();
		expect(f.requests).toHaveLength(1);
	} finally {
		f.unmount();
	}
});

test("cancel/reopen and unmount suppress old GPS/scanner callbacks, pending results and duplicate submissions", async () => {
	const f = scannerFixture();
	try {
		await f.button("Buka kamera dan lokasi")();
		f.button("Hentikan kamera dan lokasi")();
		await f.button("Buka kamera dan lokasi")();
		f.watches[0].success(position());
		f.decoders[0]({ data: token });
		expect(f.requests).toHaveLength(0);
		let release = () => {};
		f.holdRequest(
			new Promise<void>((resolve) => {
				release = resolve;
			}),
		);
		f.decoders[1]({ data: token });
		f.watches[1].success(position());
		await flush();
		f.decoders[1]({ data: token });
		expect(f.requests).toHaveLength(1);
		f.unmount();
		release();
		await flush();
		expect(f.successes).toHaveLength(0);
		expect(f.cleared).toEqual([1, 2]);
	} finally {
		f.unmount();
	}
	const pending = scannerFixture();
	await pending.button("Buka kamera dan lokasi")();
	pending.decoders[0]({ data: token });
	pending.unmount();
	pending.watches[0].success(position());
	await flush();
	expect(pending.requests).toHaveLength(0);
	expect(pending.cleared).toEqual([1]);
});

test("backend QR expiry/revocation after GPS wait discards token and requires a new scan", async () => {
	for (const code of ["QR_EXPIRED", "QR_REVOKED", "OUTSIDE_GEOFENCE"]) {
		const f = scannerFixture();
		try {
			f.setFailure(new TRPCClientError(code));
			await f.button("Buka kamera dan lokasi")();
			f.decoders[0]({ data: token });
			f.watches[0].success(position());
			await flush();
			const dialog = f.render().find((item) => item.type === "ActionDialog");
			expect(dialog?.props.onRetry).toBeFunction();
			expect(
				f.render().some((item) => item.props.children === "Perbarui Lokasi"),
			).toBe(false);
			expect(
				f
					.render()
					.some((item) => item.props.children === scannerErrorMessage(code)),
			).toBe(true);
			expect(f.requests).toHaveLength(1);
			expect(f.successes).toHaveLength(0);
		} finally {
			f.unmount();
		}
	}
});

test("gallery reads locally, waits for live GPS and submits the same check-in payload without the image", async () => {
	const f = scannerFixture();
	try {
		const file = new File(["synthetic image"], "qr.png", { type: "image/png" });
		await f.button("Pilih gambar QR")();
		expect(f.pickerClicks()).toBe(1);
		expect(f.cameras).toHaveLength(0);
		expect(f.chooseImage(file).value).toBe("");
		await flush();
		expect(f.images).toEqual([file]);
		expect(f.requests).toHaveLength(0);
		expect(f.watches).toHaveLength(1);
		f.watches[0].success(position());
		await flush();
		expect(f.requests).toEqual([
			{
				qrToken: token,
				location: { latitude: -6.97, longitude: 107.63, accuracyMeters: 10 },
			},
		]);
		expect(f.successes).toHaveLength(1);
	} finally {
		f.unmount();
	}
});

test("gallery rejects empty, non-image and oversized files without GPS or network and retries the picker", async () => {
	for (const file of [
		new File([], "empty.png", { type: "image/png" }),
		new File(["text"], "qr.txt", { type: "text/plain" }),
		new File([new Uint8Array(10 * 1024 * 1024 + 1)], "large.png", {
			type: "image/png",
		}),
	]) {
		const f = scannerFixture();
		try {
			f.chooseImage(file);
			await flush();
			expect(f.images).toHaveLength(0);
			expect(f.watches).toHaveLength(0);
			expect(f.requests).toHaveLength(0);
			const dialog = f.render().find((item) => item.type === "ActionDialog");
			if (!dialog) throw new Error("Result dialog missing");
			expect(dialog?.props.open).toBe(true);
			(dialog.props.onRetry as () => void)();
			expect(f.pickerClicks()).toBe(1);
		} finally {
			f.unmount();
		}
	}
});

test("gallery handles unreadable images and invalid QR without requesting location", async () => {
	for (const invalidQr of [false, true]) {
		const f = scannerFixture();
		try {
			f.setImageResult(
				invalidQr
					? Promise.resolve({ data: "foreign-qr" })
					: Promise.resolve().then(() => {
							throw new Error("decode failed");
						}),
			);
			f.chooseImage(new File(["synthetic"], "qr.png", { type: "image/png" }));
			await flush();
			expect(f.watches).toHaveLength(0);
			expect(f.requests).toHaveLength(0);
			expect(
				f.render().find((item) => item.type === "ActionDialog")?.props.open,
			).toBe(true);
		} finally {
			f.unmount();
		}
	}
});

test("gallery replaces camera safely, ignores duplicate input and discards decoding after unmount", async () => {
	const f = scannerFixture();
	try {
		await f.button("Buka kamera dan lokasi")();
		await f.button("Pilih gambar QR")();
		expect(f.cameras[0].destroys).toBeGreaterThan(0);
		expect(f.cleared).toEqual([1]);
		let resolveImage = (_value: { data: string }) => {};
		f.setImageResult(
			new Promise((resolve) => {
				resolveImage = resolve;
			}),
		);
		const file = new File(["synthetic"], "qr.png", { type: "image/png" });
		f.chooseImage(file);
		f.chooseImage(file);
		await flush();
		expect(f.images).toHaveLength(1);
		f.decoders[0]({ data: token });
		f.unmount();
		resolveImage({ data: token });
		await flush();
		expect(f.watches).toHaveLength(1);
		expect(f.requests).toHaveLength(0);
	} finally {
		f.unmount();
	}
});

test("cancelled gallery selection does not start decoding, GPS or camera", async () => {
	const f = scannerFixture();
	try {
		await f.button("Pilih gambar QR")();
		f.chooseImage();
		await flush();
		expect(f.images).toHaveLength(0);
		expect(f.watches).toHaveLength(0);
		expect(f.cameras).toHaveLength(0);
	} finally {
		f.unmount();
	}
});

test("gallery GPS denial records no attendance and retries location without decoding again", async () => {
	const f = scannerFixture();
	try {
		f.chooseImage(new File(["synthetic"], "qr.png", { type: "image/png" }));
		await flush();
		f.watches[0].failure({ code: 1 } as GeolocationPositionError);
		await flush();
		expect(f.requests).toHaveLength(0);
		expect(f.successes).toHaveLength(0);
		const retry = f.button("Perbarui Lokasi")();
		f.watches[1].success(position());
		await retry;
		await flush();
		expect(f.images).toHaveLength(1);
		expect(f.requests).toHaveLength(1);
		expect(f.cameras).toHaveLength(0);
	} finally {
		f.unmount();
	}
});

test("scan covers the full visible preview in portrait and landscape, including outside the focus box", () => {
	for (const [width, height, viewport, expected] of [
		[
			1280,
			720,
			{ left: 0, top: 0, width: 320, height: 600 },
			{ x: 448, y: 0, width: 384, height: 720 },
		],
		[
			720,
			1280,
			{ left: 20, top: 30, width: 320, height: 600 },
			{ x: 19, y: 0, width: 683, height: 1280 },
		],
		[
			1280,
			720,
			{ left: 0, top: 0, width: 600, height: 320 },
			{ x: 0, y: 19, width: 1280, height: 683 },
		],
	] as const) {
		const region = scanRegion({
			videoWidth: width,
			videoHeight: height,
			getBoundingClientRect: () => viewport,
		} as HTMLVideoElement);
		expect(region).toMatchObject(expected);
		expect(region.downScaledWidth).toBeLessThanOrEqual(640);
		expect(region.downScaledHeight).toBeLessThanOrEqual(640);
	}
});

test("frozen preview recovers once automatically, then offers manual recovery without reload", async () => {
	const f = scannerFixture();
	try {
		await f.button("Buka kamera dan lokasi")();
		expect(f.cameras[0].options.maxScansPerSecond).toBe(10);
		expect(
			f.cameras[0].options.calculateScanRegion?.(f.cameras[0].$video),
		).toMatchObject({ x: 192, y: 0, width: 256, height: 480 });
		f.advance(3000);
		await flush();
		expect(f.cameras).toHaveLength(2);
		expect(f.cameras[0].destroys).toBeGreaterThan(0);
		expect(f.healthChecks.size).toBe(1);
		f.advance(3000);
		await flush();
		expect(f.cameras).toHaveLength(2);
		await f.button("Mulai ulang pemindaian")();
		expect(f.cameras).toHaveLength(3);
		f.unmount();
		expect(f.healthChecks.size).toBe(0);
	} finally {
		f.unmount();
	}
});

test("healthy empty frames show a three-second hint without restarting the camera", async () => {
	const f = scannerFixture();
	try {
		await f.button("Buka kamera dan lokasi")();
		for (let i = 1; i <= 6; i++) {
			f.cameras[0].$video.currentTime = i;
			f.decodeErrors[0](QrScanner.NO_QR_CODE_FOUND);
			f.advance(1000);
		}
		expect(f.cameras).toHaveLength(1);
		expect(f.button("Mulai ulang pemindaian")).toBeFunction();
		expect(
			f.logs.filter((entry) => JSON.stringify(entry).includes("SLOW_SCAN")),
		).toHaveLength(1);
		expect(
			f.logs.some((entry) => JSON.stringify(entry).includes("SCAN_STALLED")),
		).toBe(false);
	} finally {
		f.unmount();
	}
});

test("decoder silence recovers even if the camera keeps producing frames", async () => {
	const f = scannerFixture();
	try {
		await f.button("Buka kamera dan lokasi")();
		for (let i = 1; i <= 5; i++) {
			f.cameras[0].$video.currentTime = i;
			f.advance(1000);
		}
		await flush();
		expect(f.cameras).toHaveLength(2);
		expect(f.requests).toHaveLength(0);
	} finally {
		f.unmount();
	}
});

test("background pause and resume reset health deadlines without a competing camera loop", async () => {
	const f = scannerFixture();
	try {
		await f.button("Buka kamera dan lokasi")();
		f.document.hidden = true;
		for (const run of f.visibilityListeners) run();
		f.advance(10000);
		expect(f.cameras).toHaveLength(1);
		f.document.hidden = false;
		for (const run of f.visibilityListeners) run();
		f.advance(1000);
		expect(f.cameras).toHaveLength(1);
		f.cameras[0].$video.currentTime = 1;
		f.decodeErrors[0](QrScanner.NO_QR_CODE_FOUND);
		f.advance(1000);
		expect(f.cameras).toHaveLength(1);
	} finally {
		f.unmount();
	}
});

test("QR acknowledgement is immediate, remains locked beyond two seconds and success waits for server", async () => {
	const f = scannerFixture();
	try {
		let release = () => {};
		f.holdRequest(
			new Promise<void>((resolve) => {
				release = resolve;
			}),
		);
		await f.button("Buka kamera dan lokasi")();
		f.decoders[0]({ data: token });
		expect(f.healthChecks.size).toBe(0);
		expect(
			f
				.render()
				.some(
					(item) =>
						typeof item.props.children === "string" &&
						item.props.children.startsWith("QR terbaca, memverifikasi"),
				),
		).toBe(true);
		expect(f.successes).toHaveLength(0);
		f.watches[0].success(position());
		await flush();
		f.advance(10000);
		for (let i = 0; i < 20; i++) f.decoders[0]({ data: token });
		expect(f.requests).toHaveLength(1);
		expect(f.successes).toHaveLength(0);
		expect(f.cameras).toHaveLength(1);
		release();
		await flush();
		expect(f.successes).toHaveLength(1);
		expect(
			f.logs.some((entry) =>
				JSON.stringify(entry).includes("SERVER_CONFIRMED"),
			),
		).toBe(true);
		for (const entry of f.logs)
			expect(
				(entry[1] as { elapsedMs: number }).elapsedMs,
			).toBeGreaterThanOrEqual(0);
	} finally {
		f.unmount();
	}
});

test("lost server response stays unconfirmed and retries current location without reopening camera", async () => {
	const f = scannerFixture();
	try {
		f.setFailure(new TypeError("private network details"));
		await f.button("Buka kamera dan lokasi")();
		f.decoders[0]({ data: token });
		f.watches[0].success(position());
		await flush();
		expect(
			f.render().find((item) => item.type === "ActionDialog")?.props.title,
		).toBe("Status kehadiran belum terkonfirmasi");
		expect(f.successes).toHaveLength(0);
		f.setFailure(undefined);
		await f.button("Coba verifikasi lagi")();
		f.watches[1].success(position());
		await flush();
		expect(f.requests).toHaveLength(2);
		expect(f.requests[1].qrToken).toBe(token);
		expect(f.cameras).toHaveLength(1);
		expect(f.successes).toHaveLength(1);
		expect(JSON.stringify(f.logs)).not.toContain("private network details");
	} finally {
		f.unmount();
	}
});

test("confirmed attendance is displayed without waiting for recap and history refetch", async () => {
	const f = scannerFixture();
	let release = () => {};
	try {
		f.holdRefresh(
			new Promise<void>((resolve) => {
				release = resolve;
			}),
		);
		await f.button("Buka kamera dan lokasi")();
		f.decoders[0]({ data: token });
		f.watches[0].success(position());
		await flush();
		expect(f.successes).toHaveLength(1);
		expect(
			f.render().find((item) => item.type === "ActionDialog")?.props.title,
		).toBe("Check-in berhasil");
	} finally {
		release();
		f.unmount();
	}
});
