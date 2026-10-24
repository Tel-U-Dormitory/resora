export const committeePositionLabels: Record<string, string> = {
	ANGGOTA: "Anggota",
	SEKDEP: "Sekdep",
	KADEP: "Kadep",
	SEKRE: "Sekre",
	BENDAHARA: "Bendahara",
	PIC1: "PIC 1",
	PIC2: "PIC 2",
	PJ: "PJ",
};

export function committeeError(error: unknown) {
	const message = error instanceof Error ? error.message : "";
	if (
		(error as { data?: { code?: string } } | null)?.data?.code ===
		"UNAUTHORIZED"
	) {
		return "Sesi berakhir. Silakan masuk kembali.";
	}
	const messages: Record<string, string> = {
		COMMITTEE_ACCESS_DENIED:
			"Anda tidak memiliki izin mengelola kepanitiaan. Muat ulang untuk memeriksa akses terbaru.",
		COMMITTEE_NOT_FOUND:
			"Kepanitiaan tidak ditemukan. Muat ulang daftar kepanitiaan.",
		COMMITTEE_DUPLICATE:
			"Nama divisi atau keanggotaan sudah terdaftar. Gunakan nama lain atau muat ulang data.",
		COMMITTEE_REFERENCE_IN_USE:
			"Data masih digunakan. Keluarkan anggota sebelum menghapus divisi atau kepanitiaan.",
		COMMITTEE_NOT_EMPTY:
			"Kepanitiaan masih memiliki divisi atau anggota dan tidak dapat dihapus.",
		COMMITTEE_DIVISION_NOT_FOUND:
			"Divisi tidak tersedia pada kepanitiaan ini. Muat ulang data.",
		COMMITTEE_MEMBER_NOT_FOUND:
			"Keanggotaan sudah tidak tersedia. Muat ulang data.",
		COMMITTEE_MEMBER_INELIGIBLE:
			"SR tidak memenuhi syarat aktif, penugasan struktural, atau periode kepengurusan.",
		UNAUTHORIZED: "Sesi berakhir. Silakan masuk kembali.",
		PASSWORD_CHANGE_REQUIRED:
			"Ganti password terlebih dahulu untuk melanjutkan.",
	};
	return (
		messages[message] ??
		"Permintaan belum dapat diproses. Periksa isian dan koneksi, lalu coba kembali."
	);
}
