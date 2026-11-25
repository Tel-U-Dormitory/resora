export function matchesKtmImageSignature(type: string, bytes: Uint8Array) {
	if (type === "image/jpeg")
		return (
			bytes.length >= 3 &&
			bytes[0] === 0xff &&
			bytes[1] === 0xd8 &&
			bytes[2] === 0xff
		);
	if (type === "image/png")
		return (
			bytes.length >= 8 &&
			[137, 80, 78, 71, 13, 10, 26, 10].every(
				(value, index) => bytes[index] === value,
			)
		);
	return (
		type === "image/webp" &&
		bytes.length >= 12 &&
		new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" &&
		new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP"
	);
}
