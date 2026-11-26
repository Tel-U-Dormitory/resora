# Frontend refactor — F3 Scanner

Tanggal: 2026-11-26. Branch: `refactor/ui-ux-f3-scanner`. Scope: `/scan` dan komponen scanner terkait. F2 tersimpan lokal pada `b16c111`; tidak ada push.

## Implementasi

- Shell `/scan` tanpa sidebar, utility bar atau mobile dock. Preview memakai minimal `100dvh`, safe area, tombol kembali 44 px di kiri atas serta ikon pilih gambar 44 px di kanan atas. Kamera mulai otomatis saat route dibuka. Tombol scan dan petunjuk normal di tengah dihapus sesuai revisi PM.
- Decoder QR, GPS, retry, batas akurasi, geofence, eligibility dan kontrak check-in existing dipertahankan. Tidak ada perubahan backend, auth, schema, dependensi atau konfigurasi produksi.
- Zoom hanya muncul jika track melaporkan min/max/step dan nilai aktual yang valid. Constraint dibatasi sesuai kemampuan, nilai aktual dibaca kembali setelah perubahan; kegagalan zoom tidak memutus scan. Perangkat tanpa dukungan tidak menampilkan slider; penjelasan fallback tersedia untuk pembaca layar, sementara petunjuk normal disembunyikan sesuai revisi PM. Tidak ada digital crop tambahan atau pembatasan zoom halaman.
- Diagnosis hanya muncul setelah QR diproses, dalam dialog kegagalan/hasil; hasil sukses menyediakan ikon info berlabel “Lihat diagnosis”. Salin diagnosis memberi feedback dan fallback seleksi teks saat clipboard tidak tersedia.
- Proyeksi teks memakai allowlist: waktu WIB, label perangkat/browser kasar, izin best effort, kode aman, akurasi, umur sampel, durasi, jarak/radius respons server serta selisih dari nilai proyeksi tersebut. Tidak menyalin koordinat, QR, identitas, user agent mentah atau exception. Metadata hanya berada di memori komponen.
- Pembatalan GPS tidak menimpa diagnosis kegagalan kamera; status izin kamera dibaca best effort karena decoder dapat menyamarkan DOMException. Cleanup mengizinkan siklus mount ulang Strict Mode tanpa membiarkan startup lama mengambil alih.
- Jarak/radius lama dikosongkan sebelum submit baru agar diagnosis sukses tidak memakai proyeksi kegagalan sebelumnya.

## Batas kontrak

Sesuai F3 prompt dan interaction-spec §6, ID diagnosis, arti/sumber counter Percobaan dan proyeksi jarak/radius pada respons sukses tetap **TBD**. UI menuliskan “Tidak tersedia”; tidak membuat ID/counter/estimasi server. PM perlu menetapkan kontrak sebelum nilai tersebut dapat diimplementasikan. Tidak ada telemetry baru.

## Referensi dan sumber

Mengikuti `docs/design-system.md`, `docs/design-frontend-guidelines.md`, interaction-spec §6, component catalog dan verification contract. Lima JPEG pada `docs/design/referensi acuan desain mobile/` sudah diinspeksi pada F2, bersama bagian scanner/navigasi referensi TSX kasar. Referensi dipakai untuk arah visual; aturan kanonik dan alur scanner existing menjadi batas implementasi.

## Verifikasi

Harness unit memanggil controller lifecycle secara eksplisit; auto-start route diuji melalui browser, bukan disimpulkan dari tes controller.

- Unit scanner: 52 tes, 419 assertion, lulus; termasuk lifecycle/cleanup, late callbacks, GPS retry, lost response, QR invalid/revoked, geofence, gallery dan request lock; ditambah validasi capability/constraint zoom dan proyeksi diagnosis.
- Typecheck frontend, Biome pada tujuh file F3 dan architecture check lulus; `git diff --check` lulus.
- Build produksi webpack terisolasi lulus. Font Google existing memakai adapter Next dengan cache font asli; Jakarta memakai file lokal. Tidak ada font palsu. CLI Next sempat menghentikan build untuk peringatan keamanan versi existing; pengulangan berhasil. Peringatan dependency tersebut memerlukan tindak lanjut terpisah; tidak dilakukan upgrade dalam fase ini.
- Chromium 158 lokal: 320/390/768/1024/1440 px, light/dark; auto-start kamera, shell tersembunyi, ikon galeri kanan atas 44 px, tidak ada kontrol scan/petunjuk normal di tengah, diagnosis tidak muncul sebelum scan, izin kamera ditolak sintetis, zoom supported dengan adapter constraint dan unsupported tanpa slider, cleanup track saat kembali, QR gambar dengan decoder asli + GPS/server fixture, satu submit, salin teks persis dan fallback manual, kamera menyala lagi setelah hasil ditutup, teks 200% pada 320 px. Header diperbaiki setelah inspeksi screenshot menemukan judul pecah pada teks 200%.
- Bukti: `output/playwright/f3/results.json`, `extra-results.json`, `unit.log`, `build.log` serta screenshot. Tidak ada pageerror pada kedua rangkaian browser. Fixture tidak menulis database atau menghubungi layanan eksternal.

## Batas verifikasi dan gate

Kamera/zoom perangkat nyata, Safari/iOS/Android aktual dan UAT PM belum diuji. Fixture browser tidak membuktikan dukungan hardware atau kebijakan check-in backend produksi. Kontrak TBD di atas tetap terbuka. Tidak ada deploy atau push. **Berhenti sebelum F4 untuk review PM.**
