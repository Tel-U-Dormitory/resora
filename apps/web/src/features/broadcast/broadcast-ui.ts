import { broadcastFieldsSchema } from "@resora/api/modules/broadcast/broadcast.schema";
import { TRPCClientError } from "@trpc/client";
import type { trpcClient } from "@/utils/trpc";
import {
	parseWibDateTimeInput,
	toWibDateTimeInput,
} from "../attendance/event-ui";

export type Broadcast = Awaited<
	ReturnType<typeof trpcClient.broadcast.detail.query>
>;
export type BroadcastAction =
	| { kind: "create" }
	| { kind: "detail" | "edit" | "archive"; id: string };
export type BroadcastFields = {
	title: string;
	content: string;
	linkUrl: string;
	expiry: string;
};

export function broadcastInput(
	fields: BroadcastFields,
	originalExpiry?: string,
) {
	let expiresAt: string | undefined;
	if (
		fields.expiry &&
		fields.expiry !==
			(originalExpiry ? toWibDateTimeInput(originalExpiry, true) : "")
	) {
		const expiry = parseWibDateTimeInput(fields.expiry);
		if (!Number.isFinite(expiry.getTime()))
			throw Error("BROADCAST_EXPIRATION_INVALID");
		expiresAt = expiry.toISOString();
	}
	const parsed = broadcastFieldsSchema.safeParse({
		title: fields.title,
		content: fields.content,
		linkUrl: fields.linkUrl.trim() || null,
		...(expiresAt ? { expiresAt } : {}),
	});
	if (!parsed.success) throw Error("BROADCAST_INPUT_INVALID");
	return parsed.data;
}

export function safeBroadcastLink(value: string | null) {
	if (!value || /\s/.test(value)) return null;
	try {
		return ["http:", "https:"].includes(new URL(value).protocol) ? value : null;
	} catch {
		return null;
	}
}

const messages: Record<string, string> = {
	BROADCAST_ACCESS_DENIED: "Anda tidak memiliki akses ke pengumuman ini.",
	BROADCAST_NOT_OWNER: "Anda tidak lagi berhak mengelola pengumuman ini.",
	BROADCAST_NOT_FOUND: "Pengumuman tidak ditemukan atau tidak tersedia.",
	BROADCAST_EXPIRATION_INVALID:
		"Waktu berakhir harus valid dan masih di masa depan. Gunakan waktu WIB.",
	BROADCAST_EXPIRATION_EXCEEDS_SEVEN_DAYS:
		"Waktu berakhir tidak boleh melewati 7 hari sejak publikasi pertama.",
	BROADCAST_ALREADY_ARCHIVED:
		"Pengumuman sudah diarsipkan dan tidak dapat diubah lagi.",
	BROADCAST_EXPIRED:
		"Pengumuman sudah kedaluwarsa dan tidak dapat diubah lagi.",
	BROADCAST_INPUT_INVALID:
		"Periksa judul, isi plain text, dan link HTTP(S). Judul maksimal 150, isi 5000, dan link 2048 karakter.",
	PASSWORD_CHANGE_REQUIRED: "Ganti password terlebih dahulu untuk melanjutkan.",
};
export function broadcastError(error: unknown) {
	if (error instanceof Error && Object.hasOwn(messages, error.message))
		return messages[error.message];
	if (error instanceof TRPCClientError) {
		if (error.data?.code === "UNAUTHORIZED")
			return "Sesi telah berakhir. Silakan masuk kembali.";
		if (error.data?.code === "FORBIDDEN")
			return "Anda tidak memiliki akses untuk tindakan ini.";
		if (error.data?.code === "BAD_REQUEST")
			return messages.BROADCAST_INPUT_INVALID;
		if (error.data?.code === "CONFLICT")
			return "Status pengumuman berubah. Periksa data terbaru sebelum mencoba kembali.";
	}
	return "Layanan pengumuman belum dapat memproses permintaan. Silakan coba kembali.";
}
export function broadcastNeedsRefresh(error: unknown) {
	return (
		error instanceof Error &&
		([
			"BROADCAST_ACCESS_DENIED",
			"BROADCAST_NOT_OWNER",
			"BROADCAST_NOT_FOUND",
			"BROADCAST_ALREADY_ARCHIVED",
			"BROADCAST_EXPIRED",
		].includes(error.message) ||
			(error instanceof TRPCClientError &&
				["FORBIDDEN", "CONFLICT", "NOT_FOUND"].includes(error.data?.code)))
	);
}
