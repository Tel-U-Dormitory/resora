import { expect, test } from "bun:test";
import { matchesKtmImageSignature } from "./ktm-validation";

test("accepts JPEG, PNG, and WebP signatures and rejects mismatched content", () => {
	expect(
		matchesKtmImageSignature("image/jpeg", Uint8Array.from([0xff, 0xd8, 0xff])),
	).toBe(true);
	expect(
		matchesKtmImageSignature(
			"image/png",
			Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]),
		),
	).toBe(true);
	expect(
		matchesKtmImageSignature(
			"image/webp",
			new TextEncoder().encode("RIFF1234WEBP"),
		),
	).toBe(true);
	expect(
		matchesKtmImageSignature(
			"image/png",
			new TextEncoder().encode("not an image"),
		),
	).toBe(false);
	expect(
		matchesKtmImageSignature(
			"image/svg+xml",
			new TextEncoder().encode("<svg/>"),
		),
	).toBe(false);
});
