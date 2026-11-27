import {
	EVALUATION_STATUS_LABELS,
	type EvaluationReadinessStatus,
	type gformSourceTypeSchema,
	parseGformCsv,
} from "@resora/api/modules/penilaian/penilaian.contracts";
import { TRPCClientError } from "@trpc/client";
import type { z } from "zod";

const numberFormatter = new Intl.NumberFormat("id-ID", {
	maximumFractionDigits: 2,
});

export function formatPenilaianScore(value: number | null | undefined): string {
	if (value === null || value === undefined || !Number.isFinite(value)) {
		return "—";
	}
	return numberFormatter.format(value);
}

export function formatPeriodStatusLabel(
	status:
		| "OPEN"
		| "FINAL"
		| "REVISING"
		| "BELUM_FINAL"
		| EvaluationReadinessStatus,
): string {
	if (status === "OPEN") return "Terbuka (Berjalan)";
	if (status === "FINAL") return "Final";
	if (status === "REVISING") return "Revisi Terbuka";
	if (status === "BELUM_FINAL") return "Belum Final";
	return EVALUATION_STATUS_LABELS[status] ?? status;
}

export function penilaianStatusBadgeClass(status: string): string {
	switch (status) {
		case "FINAL":
		case "APPROVED":
		case "VALID":
		case "MEMENUHI_STANDAR":
		case "SIAP_DIFINALISASI":
			return "border-border bg-[var(--success-tint)] text-success";
		case "OPEN":
		case "REVISING":
		case "PENDING":
		case "DUPLICATE":
		case "BELUM_LENGKAP":
		case "BELUM_FINAL":
			return "border-border bg-[var(--warning-tint)] text-warning";
		case "REJECTED":
		case "INVALID":
		case "PERLU_PENINGKATAN":
			return "border-border bg-[var(--danger-tint)] text-danger";
		default:
			return "border-border bg-surface-subtle text-text-secondary";
	}
}

export function buildGformCsvPreviewRows(
	csvText: string,
	sourceType: z.infer<typeof gformSourceTypeSchema>,
) {
	return parseGformCsv(csvText, sourceType).filter(
		(row) =>
			row.respondentKey.trim().length > 0 &&
			row.targetNim.trim().length > 0 &&
			row.answers.length > 0,
	);
}

export function sampleGformCsvTemplate(
	sourceType: z.infer<typeof gformSourceTypeSchema>,
): string {
	const count = sourceType === "SR_MABA" ? 20 : 10;
	const qCols = Array.from({ length: count }, (_, idx) => `q${idx + 1}`).join(
		",",
	);
	const sampleVals = Array.from({ length: count }, () => "4").join(",");
	const role = sourceType === "SR_MABA" ? "MABA" : "ASUS";
	return `respondent_id,respondent_role,target_nim,building_code,${qCols},comment\nresp-001,${role},1301220001,A1,${sampleVals},Kinerja baik\n`;
}

export function triggerCsvDownload(filename: string, content: string): void {
	const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
	const url = URL.createObjectURL(blob);
	const link = document.createElement("a");
	link.href = url;
	link.download = filename;
	document.body.append(link);
	link.click();
	link.remove();
	URL.revokeObjectURL(url);
}

const errorMessages: Record<string, string> = {
	EVALUATION_ACCESS_DENIED: "Kamu belum memiliki akses ke modul Penilaian SR.",
	HCO_REQUIRED:
		"Aksi ini hanya dapat dilakukan oleh pengurus HCO aktif atau SUPERADMIN.",
	HCO_KADEP_OR_SUPERADMIN_REQUIRED:
		"Aksi tata kelola periode ini hanya dapat dilakukan oleh Kadep HCO atau SUPERADMIN.",
	EVALUATION_PERIOD_NOT_FOUND: "Periode evaluasi tidak ditemukan.",
	EVALUATION_PERIOD_EXISTS:
		"Periode menjabat tersebut sudah memiliki periode evaluasi.",
	EVALUATION_PERIOD_NAME_EXISTS: "Nama periode evaluasi sudah digunakan.",
	EVALUATION_PERIOD_FINALIZED:
		"Periode sudah berstatus FINAL. Buka revisi terlebih dahulu untuk mengubah data.",
	EVALUATION_PERIOD_ALREADY_FINAL: "Periode evaluasi sudah berstatus FINAL.",
	EVALUATION_INCOMPLETE_CANNOT_FINALIZE:
		"Finalisasi ditolak karena masih ada SR aktif dengan komponen wajib belum lengkap.",
	EVALUATION_PREFINAL_ACCESS_DENIED:
		"Hasil sementara sebelum FINAL hanya dapat diakses oleh HCO, Inti, dan SUPERADMIN.",
	EVALUATION_TARGET_ACCESS_DENIED:
		"Kamu hanya dapat melihat rekap penilaian milikmu sendiri.",
	EVALUATION_ANALYTICS_ACCESS_DENIED:
		"Analitik periode hanya dapat diakses oleh HCO, Inti, SUPERADMIN, atau Kadep setelah FINAL.",
	SELF_EVALUATION_NOT_ALLOWED: "Penilai tidak dapat menilai diri sendiri.",
	NOT_EVENT_PARTICIPANT:
		"Kamu bukan peserta terdaftar pada event ini sehingga tidak dapat memberi nilai.",
	TARGET_NOT_EVENT_PARTICIPANT:
		"Target bukan peserta terdaftar pada event ini.",
	EVENT_NOT_EVALUATABLE_FOR_PERIOD:
		"Event harus berstatus PUBLISHED atau CLOSED dan masuk rentang periode.",
	DUPLICATE_SCORE_SUBMISSION:
		"Penilaian untuk target ini sudah dikirim dan tidak dapat dikirim ulang.",
	DEPARTMENT_EVALUATION_FORBIDDEN:
		"Kamu tidak berwenang menilai kinerja departemen anggota SR ini.",
	GFORM_ROWS_INVALID:
		"Format jawaban GForm pada CSV tidak valid. Pastikan jumlah dan rentang pertanyaan sesuai.",
	GFORM_IMPORT_HAS_INVALID_OR_DUPLICATE:
		"Impor ditolak karena masih ada baris tidak valid atau duplikat tanpa melewati duplikat.",
	POINT_PROPOSAL_KADEP_REQUIRED:
		"Pengajuan poin tambahan/pengurangan hanya untuk Kadep atau SUPERADMIN.",
	POINT_APPROVAL_HCO_OR_INTI_REQUIRED:
		"Persetujuan transaksi poin hanya dapat dilakukan oleh HCO, Inti, atau SUPERADMIN.",
	POINT_TRANSACTION_ALREADY_DECIDED:
		"Transaksi poin ini sudah diputuskan sebelumnya.",
	CORRECTION_REQUIRES_REVISION_OR_OPEN:
		"Koreksi nilai hanya diizinkan saat periode berstatus OPEN atau REVISING.",
	PASSWORD_CHANGE_REQUIRED: "Ganti password terlebih dahulu untuk melanjutkan.",
};

export function penilaianErrorMessage(error: unknown): string {
	if (error instanceof TRPCClientError) {
		const mapped = errorMessages[error.message];
		if (mapped) return mapped;
		switch (error.data?.code) {
			case "UNAUTHORIZED":
				return "Sesi telah berakhir. Silakan masuk kembali.";
			case "FORBIDDEN":
				return "Kamu belum memiliki izin untuk tindakan penilaian ini.";
			case "BAD_REQUEST":
				return "Periksa kembali data penilaian atau format CSV yang diisi.";
			case "NOT_FOUND":
				return "Data periode atau anggota tidak ditemukan.";
			case "CONFLICT":
				return "Data telah berubah atau sudah pernah dikirim sebelumnya. Muat ulang halaman.";
			case "PRECONDITION_FAILED":
				return "Syarat kelengkapan sebelum finalisasi belum terpenuhi.";
		}
	}
	return "Layanan penilaian belum dapat memproses permintaan. Silakan coba kembali.";
}
