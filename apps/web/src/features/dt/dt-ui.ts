import {
	DT_STATUS_LABELS,
	type DtEffectiveStatus,
} from "@resora/api/modules/dt/dt.contracts";
import { TRPCClientError } from "@trpc/client";

export { DT_STATUS_LABELS, type DtEffectiveStatus };

export function dtStatusBadgeClass(status: DtEffectiveStatus | string): string {
	switch (status) {
		case "ACTIVE":
		case "PRESENT":
			return "border-border bg-[var(--success-tint)] text-success";
		case "CANDIDATE":
		case "EXPIRED":
		case "PENDING":
			return "border-border bg-[var(--warning-tint)] text-warning";
		case "REJECTED":
		case "ENDED":
		case "ABSENT":
			return "border-border bg-[var(--danger-tint)] text-danger";
		default:
			return "border-border bg-surface-subtle text-text-secondary";
	}
}

export function dtStatusLabel(status: string): string {
	return DT_STATUS_LABELS[status as DtEffectiveStatus] ?? status;
}

const dateTimeFormatter = new Intl.DateTimeFormat("id-ID", {
	dateStyle: "medium",
	timeStyle: "short",
	timeZone: "Asia/Jakarta",
});

const dateFormatter = new Intl.DateTimeFormat("id-ID", {
	dateStyle: "medium",
	timeZone: "Asia/Jakarta",
});

export function formatDtDateTime(
	value: Date | string | null | undefined,
): string {
	if (!value) return "—";
	const date = value instanceof Date ? value : new Date(value);
	if (!Number.isFinite(date.getTime())) return "—";
	return `${dateTimeFormatter.format(date)} WIB`;
}

export function formatDtDate(value: string | null | undefined): string {
	if (!value) return "—";
	const parsed = new Date(`${value}T00:00:00+07:00`);
	if (!Number.isFinite(parsed.getTime())) return value;
	return dateFormatter.format(parsed);
}

export function formatDtPeriodRange(
	startsOn: string | null | undefined,
	endsOn: string | null | undefined,
): string {
	if (!startsOn && !endsOn) return "Periode belum ditetapkan";
	return `${formatDtDate(startsOn)} s/d ${formatDtDate(endsOn)}`;
}

const auditActionLabels: Record<string, string> = {
	CANDIDATE_REGISTERED: "Calon didaftarkan",
	MEMBERSHIP_ACTIVATED: "Keanggotaan diaktifkan",
	MEMBERSHIP_REJECTED: "Pendaftaran ditolak",
	PERIOD_EXTENDED: "Periode diperpanjang",
	MEMBERSHIP_ENDED: "Keanggotaan diakhiri",
	MEMBERSHIP_ARCHIVED: "Riwayat diarsipkan",
	ASSIGNMENT_UPDATED: "Penugasan diperbarui",
	PASSWORD_RESET: "Password akun direset",
};

export function formatDtAuditAction(action: string): string {
	return auditActionLabels[action] ?? action;
}

const errorMessages: Record<string, string> = {
	DT_ACCESS_DENIED:
		"Akses pengelolaan Dorm Team khusus untuk Departemen Adaptif atau SUPERADMIN.",
	DT_PERSONAL_ACCESS_DENIED:
		"Halaman portal ini hanya tersedia untuk anggota Dorm Team aktif.",
	DT_MEMBERSHIP_NOT_FOUND: "Data keanggotaan Dorm Team tidak ditemukan.",
	DT_INVALID_DEPARTMENT: "Departemen pembina tidak valid atau nonaktif.",
	DT_INVALID_BUILDING: "Gedung tugas tidak valid atau nonaktif.",
	DT_NIM_USED_BY_OTHER_ACTOR:
		"NIM sudah digunakan oleh akun SR atau Administrator sistem.",
	DT_EMAIL_EXISTS: "Email sudah digunakan oleh akun lain.",
	DT_ACTIVE_OR_CANDIDATE_EXISTS:
		"Mahasiswa ini masih memiliki keanggotaan DT aktif atau menunggu review.",
	DT_NOT_CANDIDATE: "Hanya pendaftaran berstatus Calon yang dapat ditinjau.",
	DT_NOT_EXTENDABLE: "Hanya keanggotaan aktif yang dapat diperpanjang.",
	DT_PERIOD_MUST_EXTEND:
		"Tanggal berakhir baru harus lebih lambat dari tanggal berakhir saat ini.",
	DT_NOT_ACTIVE: "Operasi ini hanya berlaku untuk anggota DT aktif.",
	DT_ARCHIVE_REQUIRES_INACTIVE:
		"Hanya keanggotaan yang telah berakhir, ditolak, atau melewati masa aktif yang dapat diarsipkan.",
	DT_DUPLICATE_STATE:
		"Terjadi konflik status keanggotaan untuk akun ini. Muat ulang data lalu coba lagi.",
	PASSWORD_CHANGE_REQUIRED:
		"Ganti password terlebih dahulu sebelum melanjutkan.",
	"Authentication required":
		"Sesi login telah berakhir. Silakan masuk kembali.",
};

export function dtErrorMessage(error: unknown): string {
	if (error instanceof TRPCClientError) {
		return (
			errorMessages[error.message] ??
			error.message ??
			"Permintaan modul Dorm Team belum dapat diproses."
		);
	}
	if (error instanceof Error) {
		return errorMessages[error.message] ?? error.message;
	}
	return "Terjadi kesalahan saat memproses data Dorm Team.";
}
