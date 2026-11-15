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
