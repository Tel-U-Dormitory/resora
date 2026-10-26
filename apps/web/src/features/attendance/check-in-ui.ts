import type QrScanner from "qr-scanner";

const gpsHelp = "Hubungi KADEP HCO untuk pencatatan kehadiran secara manual.";
const messages: Record<string, string> = {
	INVALID_QR:
		"QR tidak valid. Gunakan QR kehadiran RESORA yang ditampilkan HCO.",
	QR_EXPIRED: "QR telah kedaluwarsa. Minta HCO menampilkan QR baru.",
	QR_REVOKED:
		"QR telah dibatalkan atau diganti. Minta HCO menampilkan QR terbaru.",
	SESSION_INACTIVE: "Sesi kehadiran belum aktif. Hubungi HCO.",
	SESSION_CLOSED: "Sesi kehadiran sudah ditutup.",
	NOT_INVITED: "Anda tidak termasuk dalam daftar undangan event ini.",
	NOT_ELIGIBLE:
		"Akun Anda tidak memenuhi syarat check-in SR. Hubungi pengelola akun.",
	PASSWORD_CHANGE_REQUIRED:
		"Ganti password terlebih dahulu untuk melakukan check-in.",
	GPS_DENIED: `Izin lokasi ditolak. Aktifkan lokasi untuk RESORA melalui pengaturan browser/perangkat, lalu coba Perbarui Lokasi atau buka kamera kembali. ${gpsHelp}`,
	GPS_TIMEOUT: `Pengambilan lokasi terlalu lama. Pilih Perbarui Lokasi di tempat dengan sinyal lebih baik. ${gpsHelp}`,
	GPS_UNAVAILABLE: `Lokasi tidak tersedia. ${gpsHelp}`,
	INVALID_LOCATION: `Lokasi yang diterima tidak valid. ${gpsHelp}`,
	GPS_INACCURATE: `Akurasi GPS belum mencapai 40 meter. Coba Perbarui Lokasi di area terbuka. ${gpsHelp}`,
	OUTSIDE_GEOFENCE: `Lokasi Anda di luar radius event. ${gpsHelp}`,
	HTTPS_REQUIRED:
		"Kamera dan lokasi memerlukan koneksi aman. Gunakan alamat HTTPS RESORA.",
	CAMERA_DENIED:
		"Izin kamera ditolak. Izinkan kamera melalui pengaturan browser, lalu coba lagi.",
	CAMERA_UNAVAILABLE:
		"Kamera tidak tersedia atau sedang digunakan aplikasi lain. Periksa kamera dan coba lagi.",
	SESSION_EXPIRED:
		"Sesi telah berakhir atau akun tidak lagi eligible. Silakan masuk kembali.",
	SERVER_FAILED:
		"Koneksi atau layanan tidak tersedia. Coba lagi; catatan kehadiran yang sudah tersimpan tidak akan ditimpa.",
};

export function scannerErrorMessage(code: string) {
	return messages[code] ?? messages.SERVER_FAILED;
}

export type CameraHandle = Pick<QrScanner, "stop" | "destroy" | "$video">;
export function releaseCamera(
	scanner: CameraHandle | null,
	video: HTMLVideoElement | null,
	destroy = false,
) {
	// Capture tracks before the library detaches srcObject or React clears the video ref.
	const stream = video?.srcObject ?? scanner?.$video.srcObject;
	if (destroy) scanner?.destroy();
	else scanner?.stop();
	if (stream && "getTracks" in stream)
		for (const track of stream.getTracks()) track.stop();
}
