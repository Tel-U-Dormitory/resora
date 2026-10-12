import { TRPCClientError } from "@trpc/client";

const statuses: Record<string, { label: string; style: string }> = {
	DRAFT: { label: "Draft", style: "bg-muted text-muted-foreground" },
	PUBLISHED: {
		label: "Dipublikasikan",
		style: "bg-primary-soft text-primary-soft-foreground",
	},
	CLOSED: { label: "Ditutup", style: "bg-muted text-muted-foreground" },
	INACTIVE: { label: "Belum aktif", style: "bg-muted text-muted-foreground" },
	ACTIVE: { label: "Aktif", style: "bg-success/10 text-success" },
	EXPIRED: { label: "Kedaluwarsa", style: "bg-warning/10 text-warning" },
	REVOKED: { label: "Dibatalkan", style: "bg-danger/10 text-danger" },
	NONE: { label: "Belum tersedia", style: "bg-muted text-muted-foreground" },
};

export function StatusBadge({ status }: { status: string }) {
	const { label, style } = statuses[status] ?? statuses.NONE;
	return (
		<span
			className={`inline-flex items-center rounded-full px-3 py-1 font-semibold text-xs ${style}`}
		>
			{label}
		</span>
	);
}

export function formatEventTime(value: string) {
	return `${new Date(value).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" })} WIB`;
}

export function eventErrorMessage(error: unknown) {
	if (error instanceof TRPCClientError) {
		if (error.message === "PASSWORD_CHANGE_REQUIRED")
			return "Ganti password terlebih dahulu untuk melanjutkan.";
		switch (error.data?.code) {
			case "UNAUTHORIZED":
				return "Sesi telah berakhir. Silakan masuk kembali.";
			case "FORBIDDEN":
				return "Anda tidak memiliki akses untuk tindakan ini.";
			case "BAD_REQUEST":
				return "Periksa kembali informasi event, jadwal, dan konfigurasi yang diisi.";
			case "NOT_FOUND":
				return "Event tidak tersedia atau Anda tidak memiliki akses.";
			case "CONFLICT":
				return "Status event atau QR telah berubah. Muat ulang sebelum mencoba kembali.";
		}
	}
	return "Layanan belum dapat memproses permintaan. Silakan coba kembali.";
}
