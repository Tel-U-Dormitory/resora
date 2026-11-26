export const buildings = ["Gedung A", "Gedung B"] as const;
export const periods = ["SR 14", "SR 13"] as const;
export const currentActor = "SR Simulasi";
export const emptyFields = { name: "", nim: "", date: "", description: "" };
export type Fields = typeof emptyFields;
type Change = { actor: string; at: string; reason: string };
export type Report = Fields & {
	code: string;
	actor: string;
	building: string;
	period: string;
	created: string;
	image?: Blob;
	corrections: (Change & {
		before: Fields;
		after: Fields;
		imageChanged: boolean;
	})[];
	deleted?: Change;
};

export const fixtures: Report[] = [
	["2026-11-24", "Gedung A", currentActor, "SR 14"],
	["2026-11-25", "Gedung B", "SR Contoh", "SR 14"],
	["2026-11-25", "Gedung A", currentActor, "SR 14"],
	["2025-11-20", "Gedung B", "SR Contoh", "SR 13"],
].map(([date, building, actor, period], index) => ({
	code: `PLG-DEMO-${index + 1}`,
	name: `Mahasiswa Contoh ${index + 1}`,
	nim: `000000000${index + 1}`,
	date,
	description: "Contoh catatan kejadian untuk simulasi.",
	building,
	actor,
	period,
	created: `${date}T08:00:00.000Z`,
	corrections: [],
	...(index === 2
		? {
				deleted: {
					actor,
					at: `${date}T09:00:00.000Z`,
					reason: "Contoh laporan ganda.",
				},
			}
		: {}),
}));

export function localDate() {
	return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Jakarta" }).format(
		new Date(),
	);
}

export function formatTime(at: string) {
	return `${new Intl.DateTimeFormat("id-ID", {
		dateStyle: "medium",
		timeStyle: "short",
		timeZone: "Asia/Jakarta",
	}).format(new Date(at))} WIB`;
}

export async function compressKtm(file: File) {
	if (
		!["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
		file.size > 10 * 1024 * 1024
	)
		throw new Error(
			"Pilih foto JPG, PNG, atau WebP yang ukurannya maksimal 10 MB.",
		);
	const bitmap = await createImageBitmap(file, {
		imageOrientation: "from-image",
	}).catch(() => {
		throw new Error("Foto tidak bisa dibaca. Pilih foto lain.");
	});
	try {
		const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
		const canvas = document.createElement("canvas");
		canvas.width = Math.max(1, Math.round(bitmap.width * scale));
		canvas.height = Math.max(1, Math.round(bitmap.height * scale));
		const context = canvas.getContext("2d", { alpha: false });
		if (!context) throw new Error("Foto tidak bisa diproses di browser ini.");
		context.fillStyle = "white";
		context.fillRect(0, 0, canvas.width, canvas.height);
		context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
		return await new Promise<Blob>((resolve, reject) =>
			canvas.toBlob(
				(blob) =>
					blob
						? resolve(blob)
						: reject(new Error("Foto tidak bisa dikompresi. Pilih foto lain.")),
				"image/jpeg",
				0.82,
			),
		);
	} finally {
		bitmap.close();
	}
}
