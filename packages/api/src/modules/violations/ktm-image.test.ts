import { expect, test } from "bun:test";
import sharp from "sharp";
import { validateKtmImage } from "./ktm-image";

test("KTM validation decodes the image without changing its bytes or type", async () => {
	const input = await sharp({
		create: {
			width: 2000,
			height: 1000,
			channels: 3,
			background: "#aabbcc",
		},
	})
		.png()
		.toBuffer();
	const output = await validateKtmImage(input, "image/png");

	expect(output).toEqual({
		sizeBytes: input.byteLength,
		contentType: "image/png",
	});
});

test("KTM validation rejects a mismatched type and malformed image", async () => {
	const image = await sharp({
		create: {
			width: 2,
			height: 2,
			channels: 3,
			background: "#ffffff",
		},
	})
		.png()
		.toBuffer();
	await expect(validateKtmImage(image, "image/jpeg")).rejects.toThrow(
		"VIOLATION_KTM_INVALID",
	);
	await expect(
		validateKtmImage(new Uint8Array([1, 2, 3]), "image/png"),
	).rejects.toThrow("VIOLATION_KTM_INVALID");
});
