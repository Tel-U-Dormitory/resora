import sharp from "sharp";

const maxInputPixels = 40_000_000;
const maxOutputBytes = 10 * 1024 * 1024;

export async function validateKtmImage(
	input: Uint8Array,
	declaredContentType: string,
) {
	try {
		const image = sharp(input, {
			failOn: "error",
			limitInputPixels: maxInputPixels,
			sequentialRead: true,
		});
		const metadata = await image.metadata();
		const expectedFormat = {
			"image/jpeg": "jpeg",
			"image/png": "png",
			"image/webp": "webp",
		}[declaredContentType];
		if (
			!expectedFormat ||
			metadata.format !== expectedFormat ||
			!metadata.width ||
			!metadata.height ||
			metadata.width > 12_000 ||
			metadata.height > 12_000 ||
			(metadata.pages ?? 1) > 1
		)
			throw new Error("Image format does not match declared type");

		if (input.byteLength < 1 || input.byteLength > maxOutputBytes)
			throw new Error("Image size is invalid");
		// Decode every pixel to reject truncated/corrupt payloads; only the client compresses.
		await image.stats();
		return { sizeBytes: input.byteLength, contentType: declaredContentType };
	} catch {
		throw new Error("VIOLATION_KTM_INVALID");
	}
}
