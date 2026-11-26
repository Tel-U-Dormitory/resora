import { TRPCClientError } from "@trpc/client";

type BadgeTone = "success" | "warning" | "danger" | "info" | "neutral";

const statuses: Record<
	string,
	{ label: string; tone: BadgeTone; style: string }
> = {
	VISIBLE: {
		label: "Ditampilkan",
		tone: "success",
		style: "bg-[var(--success-tint)] text-success border-border",
	},
	HIDDEN: {
		label: "Disembunyikan",
		tone: "warning",
		style: "bg-[var(--warning-tint)] text-warning border-border",
	},
	ARCHIVED: {
		label: "Diarsipkan",
		tone: "neutral",
		style: "bg-surface-subtle text-text-secondary border-border",
	},
	PRESENT: {
		label: "Hadir",
		tone: "success",
		style: "bg-[var(--success-tint)] text-success border-border",
	},
	PENDING: {
		label: "Belum hadir",
		tone: "warning",
		style: "bg-[var(--warning-tint)] text-warning border-border",
	},
	ABSENT: {
		label: "Tidak hadir",
		tone: "danger",
		style: "bg-[var(--danger-tint)] text-danger border-border",
	},
	DRAFT: {
		label: "Draft",
		tone: "neutral",
		style: "bg-surface-subtle text-text-secondary border-border",
	},
	PUBLISHED: {
		label: "Dipublikasikan",
		tone: "info",
		style: "bg-[var(--info-tint)] text-info border-border",
	},
	CLOSED: {
		label: "Ditutup",
		tone: "neutral",
		style: "bg-surface-subtle text-text-secondary border-border",
	},
	INACTIVE: {
		label: "Belum aktif",
		tone: "neutral",
		style: "bg-surface-subtle text-text-secondary border-border",
	},
	ACTIVE: {
		label: "Aktif",
		tone: "success",
		style: "bg-[var(--success-tint)] text-success border-border",
	},
	EXPIRED: {
		label: "Kedaluwarsa",
		tone: "warning",
		style: "bg-[var(--warning-tint)] text-warning border-border",
	},
	REVOKED: {
		label: "Dibatalkan",
		tone: "danger",
		style: "bg-[var(--danger-tint)] text-danger border-border",
	},
	NONE: {
		label: "Belum tersedia",
		tone: "neutral",
		style: "bg-surface-subtle text-text-secondary border-border",
	},
};

function StatusToneIcon({ tone }: { tone: BadgeTone }) {
	if (tone === "success") {
		return (
			<svg
				aria-hidden="true"
				viewBox="0 0 16 16"
				fill="none"
				stroke="currentColor"
				strokeWidth="1.75"
				className="size-3.5 shrink-0"
			>
				<circle cx="8" cy="8" r="6" />
				<path d="M5.5 8.2 7.2 9.9 10.7 6.4" />
			</svg>
		);
	}
	if (tone === "warning") {
		return (
			<svg
				aria-hidden="true"
				viewBox="0 0 16 16"
				fill="none"
				stroke="currentColor"
				strokeWidth="1.75"
				className="size-3.5 shrink-0"
			>
				<path d="M8 2.4 14 13H2L8 2.4Z" />
				<path d="M8 6.5v3.2" />
				<circle cx="8" cy="11.4" r="0.6" fill="currentColor" stroke="none" />
			</svg>
		);
	}
	if (tone === "danger") {
		return (
			<svg
				aria-hidden="true"
				viewBox="0 0 16 16"
				fill="none"
				stroke="currentColor"
				strokeWidth="1.75"
				className="size-3.5 shrink-0"
			>
				<circle cx="8" cy="8" r="6" />
				<path d="m5.8 5.8 4.4 4.4M10.2 5.8l-4.4 4.4" />
			</svg>
		);
	}
	if (tone === "info") {
		return (
			<svg
				aria-hidden="true"
				viewBox="0 0 16 16"
				fill="none"
				stroke="currentColor"
				strokeWidth="1.75"
				className="size-3.5 shrink-0"
			>
				<circle cx="8" cy="8" r="6" />
				<path d="M8 7.2v3.6" />
				<circle cx="8" cy="5.2" r="0.7" fill="currentColor" stroke="none" />
			</svg>
		);
	}
	return (
		<svg
			aria-hidden="true"
			viewBox="0 0 16 16"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.75"
			className="size-3.5 shrink-0"
		>
			<circle cx="8" cy="8" r="6" />
			<path d="M8 5v3l2 1.2" />
		</svg>
	);
}

export function StatusBadge({ status }: { status: string }) {
	const { label, tone, style } = statuses[status] ?? statuses.NONE;
	return (
		<span
			className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-bold text-xs ${style}`}
		>
			<StatusToneIcon tone={tone} />
			<span>{label}</span>
		</span>
	);
}

const scheduleFormatter = new Intl.DateTimeFormat("id-ID", {
	dateStyle: "medium",
	timeStyle: "short",
	timeZone: "Asia/Jakarta",
});

export function formatEventSchedule(startsAt: string, endsAt: string) {
	return `${scheduleFormatter.formatRange(new Date(startsAt), new Date(endsAt))} WIB`;
}

export function formatEventTime(value: string) {
	return `${new Date(value).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" })} WIB`;
}

export function toWibDateTimeInput(value: string, seconds = false) {
	return new Date(new Date(value).getTime() + 7 * 3600_000)
		.toISOString()
		.slice(0, seconds ? 19 : 16);
}

export function parseWibDateTimeInput(value: string) {
	return new Date(`${value}+07:00`);
}

export function eventErrorMessage(error: unknown) {
	if (error instanceof TRPCClientError) {
		if (error.message === "POINTS_EVENT_SELECTION_INVALID")
			return "Pilihan event tidak lagi tersedia untuk periode ini. Gunakan Reset default lalu Terapkan Filter, atau perbaiki pilihan event.";
		if (error.message === "SCORING_MODE_REQUIRES_PUBLISHED_EVENT")
			return "Penilaian kehadiran dapat diatur setelah event dipublikasikan.";
		if (error.message === "SCORING_MODE_INPUT_INVALID")
			return "Pilih penilaian kehadiran yang valid.";
		if (error.message === "EVENT_COMMITTEE_UNAVAILABLE")
			return "Kepanitiaan tidak tersedia. Pilih kembali kepanitiaan yang valid.";
		if (error.message === "EVENT_ORGANIZATION_FROZEN")
			return "Konteks dan kepanitiaan tidak dapat diubah setelah publikasi.";
		if (error.message === "EVENT_ORGANIZATION_CHANGED")
			return "Kepanitiaan draft telah berubah. Muat ulang sebelum menyimpan kembali.";
		if (error.message === "EVENT_INVITEE_INELIGIBLE")
			return "Undangan tambahan tidak lagi memenuhi syarat SR aktif. Tinjau ulang pilihan peserta.";
		if (error.message === "EVENT_VISIBILITY_CONFLICT")
			return "Visibilitas atau status event telah berubah. Muat ulang sebelum memilih tindakan yang tersedia.";
		if (error.message === "HIDDEN_EVENT_ACTIVATION_FORBIDDEN")
			return "Event disembunyikan. SUPERADMIN perlu menampilkannya kembali sebelum sesi dapat diaktifkan.";
		if (error.message === "DRAFT_DELETE_NOT_ALLOWED")
			return "Draft tidak dapat dihapus karena status sesi atau referensi operasional/audit. Muat ulang untuk memeriksa status terkini.";
		if (error.message === "ADVANCED_EDIT_END_INVALID")
			return "Waktu selesai harus setelah waktu mulai dan tidak boleh di masa lalu. Jadwal event yang sudah ditutup tidak dapat diubah.";
		if (error.message === "ADVANCED_EDIT_STATE_CHANGED")
			return "Status event atau kehadiran telah berubah. Muat ulang untuk melihat field yang masih dapat diedit.";
		if (error.message === "PASSWORD_CHANGE_REQUIRED")
			return "Ganti password terlebih dahulu untuk melanjutkan.";
		switch (error.data?.code) {
			case "UNAUTHORIZED":
				return "Sesi telah berakhir. Silakan masuk kembali.";
			case "FORBIDDEN":
				return "Kamu belum memiliki akses untuk tindakan ini.";
			case "BAD_REQUEST":
				return "Periksa kembali informasi event, jadwal, dan konfigurasi yang diisi.";
			case "NOT_FOUND":
				return "Event tidak tersedia atau kamu belum memiliki akses.";
			case "CONFLICT":
				return "Status event atau QR telah berubah. Muat ulang sebelum mencoba kembali.";
		}
	}
	return "Layanan belum dapat memproses permintaan. Silakan coba kembali.";
}
