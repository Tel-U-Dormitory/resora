import { expect, test } from "bun:test";
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
