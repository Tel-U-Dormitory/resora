import type QrScanner from "qr-scanner";

const gpsHelp = "Hubungi KADEP HCO untuk pencatatan kehadiran secara manual.";
const messages: Record<string, string> = {
	IMAGE_INVALID: "Pilih file gambar yang tidak kosong dari galeri atau Files.",
	IMAGE_TOO_LARGE:
		"Ukuran gambar maksimal 10 MB. Pilih gambar yang lebih kecil.",
	IMAGE_SCAN_FAILED:
		"Gambar tidak dapat dibaca atau QR tidak ditemukan. Pilih gambar QR yang jelas dalam format JPG atau PNG, atau gunakan kamera.",
	INVALID_QR:
		"QR tidak valid. Gunakan QR kehadiran RESORA yang ditampilkan HCO.",
	QR_EXPIRED: "QR telah kedaluwarsa. Minta HCO menampilkan QR baru.",
	QR_REVOKED:
		"QR telah dibatalkan atau diganti. Minta HCO menampilkan QR terbaru.",
	DT_ONLY_QR:
		"QR ini khusus untuk check-in anggota Dorm Team (DT). Gunakan QR Senior Resident (SR) dari HCO.",
	SR_ONLY_QR:
		"QR ini khusus untuk Senior Resident (SR). Gunakan QR Dorm Team (DT) dari Adaptif atau HCO.",
	SESSION_INACTIVE: "Sesi kehadiran belum aktif. Hubungi HCO.",
	SESSION_CLOSED: "Sesi kehadiran sudah ditutup.",
	NOT_INVITED: "Kamu tidak termasuk dalam daftar undangan kegiatan ini.",
	NOT_ELIGIBLE:
		"Akun kamu belum memenuhi syarat check-in SR. Hubungi pengelola akun.",
	PASSWORD_CHANGE_REQUIRED:
		"Ganti password terlebih dahulu untuk melakukan check-in.",
	GPS_DENIED: `Izin lokasi ditolak. Aktifkan lokasi untuk RESORA di pengaturan browser atau perangkat, lalu ketuk Perbarui Lokasi. ${gpsHelp}`,
	GPS_INTERRUPTED: `Pengambilan lokasi terhenti setelah berpindah aplikasi. Kembali ke RESORA dan pilih Perbarui Lokasi. ${gpsHelp}`,
	GPS_TIMEOUT: `Pengambilan lokasi terlalu lama. Pilih Perbarui Lokasi di tempat dengan sinyal lebih baik. ${gpsHelp}`,
	GPS_UNAVAILABLE: `Lokasi tidak tersedia. ${gpsHelp}`,
	INVALID_LOCATION: `Lokasi yang diterima tidak valid. ${gpsHelp}`,
	GPS_INACCURATE: `Akurasi GPS belum mencapai 40 meter. Coba Perbarui Lokasi di area terbuka. ${gpsHelp}`,
	OUTSIDE_GEOFENCE: `Titik lokasi perangkat terdeteksi di luar radius kegiatan. Jika kamu sudah di lokasi, pilih Perbarui Lokasi untuk mencoba lagi tanpa scan ulang. ${gpsHelp}`,
	HTTPS_REQUIRED:
		"Kamera dan lokasi memerlukan koneksi aman. Gunakan alamat HTTPS RESORA.",
	CAMERA_DENIED:
		"Izin kamera ditolak. Izinkan kamera melalui pengaturan browser, lalu coba lagi.",
	CAMERA_UNAVAILABLE:
		"Kamera tidak tersedia atau sedang digunakan aplikasi lain. Periksa kamera dan coba lagi.",
	VIDEO_NOT_READY:
		"Kamera belum siap memindai. Ketuk tombol kamera untuk memuat ulang.",
	STREAM_ENDED:
		"Stream kamera berhenti. Ketuk tombol kamera untuk memulai ulang pemindaian.",
	DECODER_FAILED:
		"Pemindai mengalami kendala teknis. Ketuk tombol kamera untuk memulai ulang pemindaian.",
	SESSION_EXPIRED:
		"Sesi telah berakhir atau akun tidak lagi eligible. Silakan masuk kembali.",
	SERVER_FAILED:
		"Koneksi atau layanan tidak tersedia. Coba lagi; catatan kehadiran yang sudah tersimpan tidak akan ditimpa.",
	CHECK_IN_UNCONFIRMED:
		"Belum dapat memastikan kehadiran karena koneksi atau layanan terputus. Coba verifikasi lagi; kehadiran yang sudah tersimpan tidak akan dicatat dua kali.",
};

export type ScannerDiagnostic =
	| "STARTING"
	| "RESTARTING"
	| "START_FAILED"
	| "VIDEO_READY"
	| "VIDEO_NOT_READY"
	| "STREAM_ENDED"
	| "FRAMES_NO_QR"
	| "DECODER_FAILED"
	| "QR_CALLBACK"
	| "QR_CALLBACK_IGNORED"
	| "WAITING_GPS"
	| "SUBMITTING"
	| "GPS_READY"
	| "SERVER_CONFIRMED"
	| "SCAN_STALLED"
	| "SLOW_SCAN"
	| "BACKGROUND"
	| "FOREGROUND"
	| "STOPPED";

export function scannerErrorMessage(code: string) {
	return messages[scannerDiagnosticCode(code)] ?? messages.SERVER_FAILED;
}

export function scannerDiagnosticCode(code: string) {
	return Object.hasOwn(messages, code) ? code : "SERVER_FAILED";
}

export type CameraHandle = Pick<QrScanner, "stop" | "destroy" | "$video">;
export function releaseCamera(
	scanner: CameraHandle | null,
	video: HTMLVideoElement | null,
	destroy = false,
) {
	// Capture tracks before the library detaches srcObject or React clears the video ref.
	// A stale instance may only release its own video, never a replacement ref.
	const stream = scanner ? scanner.$video.srcObject : video?.srcObject;
	if (destroy) scanner?.destroy();
	else scanner?.stop();
	if (stream && "getTracks" in stream)
		for (const track of stream.getTracks()) track.stop();
}
