import type QrScanner from "qr-scanner";

// Scan every visible pixel, excluding source pixels cropped by object-cover.
export function scanRegion(video: HTMLVideoElement): QrScanner.ScanRegion {
	const { videoWidth: width, videoHeight: height } = video;
	const bounds = video.getBoundingClientRect();
	if (!width || !height || !bounds.width || !bounds.height) return {};
	const scale = Math.max(bounds.width / width, bounds.height / height);
	const cropWidth = Math.min(
		width,
		Math.max(1, Math.round(bounds.width / scale)),
	);
	const cropHeight = Math.min(
		height,
		Math.max(1, Math.round(bounds.height / scale)),
	);
	const downscale = Math.min(1, 640 / Math.max(cropWidth, cropHeight));
	return {
		x: Math.round((width - cropWidth) / 2),
		y: Math.round((height - cropHeight) / 2),
		width: cropWidth,
		height: cropHeight,
		downScaledWidth: Math.max(1, Math.round(cropWidth * downscale)),
		downScaledHeight: Math.max(1, Math.round(cropHeight * downscale)),
	};
}

export type CameraZoom = {
	min: number;
	max: number;
	step: number;
	value: number;
};
type ZoomTrack = MediaStreamTrack & {
	getCapabilities: () => MediaTrackCapabilities & {
		zoom?: Omit<CameraZoom, "value">;
	};
	getSettings: () => MediaTrackSettings & { zoom?: number };
};

export function cameraZoom(
	track: MediaStreamTrack | undefined,
): CameraZoom | null {
	try {
		const zoomTrack = track as ZoomTrack | undefined;
		const capabilities = zoomTrack?.getCapabilities?.() as
			| (MediaTrackCapabilities & { zoom?: Omit<CameraZoom, "value"> })
			| undefined;
		const range = capabilities?.zoom;
		const value = zoomTrack?.getSettings?.().zoom;
		if (!range || typeof value !== "number") return null;
		const { min, max, step } = range;
		if (
			![min, max, step, value].every(Number.isFinite) ||
			min <= 0 ||
			max <= min ||
			step <= 0 ||
			value < min ||
			value > max
		)
			return null;
		return { min, max, step, value };
	} catch {
		return null;
	}
}

export async function setCameraZoom(
	track: MediaStreamTrack,
	value: number,
	range: CameraZoom,
) {
	if (!Number.isFinite(value)) throw new Error("INVALID_ZOOM");
	const bounded = Math.min(
		range.max,
		Math.max(
			range.min,
			range.min + Math.round((value - range.min) / range.step) * range.step,
		),
	);
	const constraint: MediaTrackConstraintSet & { zoom: number } = {
		zoom: bounded,
	};
	await track.applyConstraints({ advanced: [constraint] });
}
