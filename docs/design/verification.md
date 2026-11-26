# Verifikasi dan kepatuhan frontend

Lampiran normatif [Design System 1.1](../design-system.md). Pemilik sign-off akhir: PM.

## Otorisasi tetap dan batas

Keputusan PM 26 November 2026 memberi **otorisasi tetap pengujian UI lokal**. Setiap fitur yang berdampak visual wajib diverifikasi tampilan dan interaksinya di browser lokal **sebelum melanjutkan fitur visual berikutnya**, tanpa meminta izin browser lagi. Ini menggantikan aturan lama explicit request per tugas. Gunakan data sintetis, lingkungan lokal, dan screenshot tanpa data pribadi. Browser lokal yang tersambung backend production bukan lingkungan uji aman otomatis.

Otorisasi ini tidak mencakup deployment, mutasi DB remote, akun nyata, pengiriman pesan eksternal, atau sign-off UAT. Jika browser/tool/server lokal tidak tersedia, catat blocker dan jangan klaim gate lulus. Dokumentasi saja tidak membutuhkan browser aplikasi. Emulasi desktop tidak membuktikan kamera/GPS/Safari/safe area di perangkat nyata.

## Gate per perubahan

1. Baca sumber pusat dan PRD/modul terkait; tandai perubahan flow yang belum disetujui.
2. Daftar layar/state/role yang disentuh; cek route publik tetap aman dari efek shared style.
3. Jalankan CLI relevan setelah memeriksa script: focused tests, typecheck, lint read-only, build bila perlu. Root `check` memakai `--write`; `lint` read-only. Jangan otomatis menjalankan seed/migrasi/deploy.
4. Browser lokal: jalankan alur positif, negatif, back/refresh, network failure/retry dan izin yang relevan; cek light/dark dan ukuran berikut. Rekam route, viewport/browser, fixture, langkah, expected/actual, hasil dan screenshot bila bermanfaat.
5. Review usability/aksesibilitas manual dan otomatis sesuai scope; perbaiki temuan yang menghalangi task atau target AA. Semua kriteria WCAG yang relevan perlu dievaluasi, bukan hanya skor otomatis.
6. Catat hasil dan batas; UAT PM terpisah. Jangan lanjut fitur visual lain bila gate visual fitur ini belum dijalankan atau masih gagal, kecuali PM menyetujui pengecualian tercatat.

## Matriks minimum

| Dimensi | Pemeriksaan |
| --- | --- |
| Viewport | 320px reflow, 390px mobile, 768px tablet portrait, 1024px tablet landscape, 1440px desktop; portrait/landscape |
| Tema | Light default, dark eksplisit, preference reload, kontras semua state |
| Input | Touch, mouse, keyboard; software keyboard, safe area, long label |
| Browser target | Safari iOS (iPhone 12+), Chrome Android (Android 12+, RAM ≥4GB), Brave; versi aktual dicatat saat uji |
| Koneksi | Stabil, lambat, offline saat form/submit, respons hilang dan retry |
| Akses | Anggota dan pengurus sesuai capability, aktor tanpa izin, SYSTEM_ADMIN tanpa hak peserta |
| Scanner | Kamera/lokasi granted/denied/unavailable, GPS gagal, QR invalid, batas radius, sukses, diagnosis/copy, zoom supported/unsupported |
| Persistensi | Reload, tutup/buka browser, akun berbeda, storage failure, submit sukses, multi-tab, draf schema lama |

Minimum versi browser/iOS belum disepakati; jangan menyimpulkan iPhone 12 berarti versi iOS tertentu. Kamera/GPS harus memperoleh bukti perangkat nyata sebelum native-feel/UAT scanner dinyatakan lulus; akses perangkat nyata dijadwalkan bersama PM bila tidak tersedia.

## Checklist aksesibilitas

- Semantik heading/landmark/list/table dan label kontrol benar; skip link, urutan baca/Tab sesuai visual.
- Semua aksi dapat dilakukan keyboard; fokus terlihat dan tidak tertutup navbar/CTA/overlay. Tidak ada keyboard trap selain containment modal yang dapat ditutup.
- Kontras teks/kontrol sesuai pusat; warna bukan satu-satunya penanda. Ukuran target produk 44px untuk touch; cek AA 2.5.8 dan pengecualiannya secara benar.
- Zoom teks 200%, reflow setara 320 CSS px dan text-spacing adjustment tidak merusak task; zoom browser tidak dinonaktifkan.
- Sheet/drag memiliki aksi sederhana alternatif (2.5.7); target tidak bergantung hover atau gesture presisi.
- Error terhubung field; status diumumkan tanpa mengganggu; focus kembali setelah modal; toast tidak menjadi satu-satunya informasi penting.
- Input ulang data yang sudah tersedia tidak dipaksakan tanpa alasan (3.3.7); bantuan konsisten (3.2.6); autentikasi yang tersentuh mendukung persyaratan accessible authentication (3.3.8).
- Reduced motion, screen reader (VoiceOver/TalkBack/NVDA sesuai ketersediaan), grafik alternatif, nama ikon diuji. Inspeksi ARIA saja bukan bukti uji screen reader.

## Performa dan jaringan

**REKOMENDASI target awal:** LCP ≤2.5s, INP ≤200ms, CLS ≤0.1 pada persentil 75 data lapangan, dengan pengukuran lab sebagai petunjuk terpisah ([Web Vitals](https://web.dev/articles/vitals)). Belum ada baseline atau angka hasil RESORA. Ukur sebelum menetapkan budget bundle wajib. Hindari memuat scanner/chart/library besar di semua route; lazy-load per kebutuhan, reserve ruang skeleton/media, optimalkan font, batasi motion dekoratif. Jangan mengorbankan feedback demi angka performa.

Untuk setiap layar dengan query/cache/optimistic mutation, verifikasi juga: cold start tanpa cache; warm start dengan cache akun yang sama dan data tidak berubah; warm start dengan perubahan server; cache stale ketika offline; koneksi pulih; cache kosong/expired/evicted atau quota penuh; logout, account switch dan perubahan permission; mutation sukses, gagal (rollback), timeout/hasil tidak pasti, serta retry tanpa duplikasi. Pastikan shell dan aksi utama tidak menunggu query sekunder, data privat tidak sempat terlihat sebelum sesi terverifikasi, dan cache tidak pernah memberi sukses/izin palsu. Catat sumber cache, umur data, query yang direvalidasi, dan hasil tampilan.

Target pengalaman warm-start ialah cache yang aman dapat langsung memperlihatkan snapshot sambil revalidasi; bila belum berubah, UI tetap stabil. Ini bukan jaminan 0 request atau data selalu terkini. Tolak cache untuk akses/eligibility yang perlu otoritas saat ini, dan nyatakan status snapshot/offline dengan teks.

Penyimpanan browser bersifat best-effort dan dapat dihapus/ditolak oleh quota; kegagalannya tidak boleh merusak alur online ([MDN: storage quotas and eviction](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)). Untuk persistensi query, implementasi harus mengecek mekanisme resmi TanStack Query versi terpasang dan menentukan usia maksimum serta pembatalan cache ([TanStack Query: persistQueryClient](https://tanstack.com/query/latest/docs/framework/react/plugins/persistQueryClient)).

## Penegakan bertahap

Tahap sekarang: instruksi agent terhubung, dokumen versi dan checklist review. Tahap implementasi: token tunggal di kode, katalog contoh/state, pemeriksaan lint/token/a11y yang relevan dan integrasi gate CI. CI baru **belum dipasang** oleh dokumen ini. Jangan mengklaim instruksi Markdown dapat memaksa semua tool secara teknis.

Template bukti PR/tugas:

```text
Design system version:
Layar/komponen dan state:
Keputusan PM/pengecualian:
CLI (command + hasil):
Browser lokal (versi/viewport/fixture/alur + hasil):
Aksesibilitas (otomatis/manual + temuan):
Perangkat nyata (atau belum diverifikasi):
Dependency/library/arsitektur berubah:
TBD/blocker dan dampaknya:
UAT PM: pending / disetujui, tanggal dan referensi
```

Acceptance akhir refactor: seluruh layar dalam scope sesuai guideline; state penting lengkap; CLI lulus atau pengecualian PM tercatat; browser lokal dan review aksesibilitas selesai; bukti hardware untuk alur yang membutuhkannya; UAT PM disetujui. Status proposed, documented, implemented, tested, accepted dan released tidak dipertukarkan.

## Bukti pemeriksaan dokumentasi 1.0

26 November 2026: tautan lokal dokumen pusat/lampiran/pintu masuk diperiksa dan tersedia; `git diff --check` lulus. Perhitungan luminansi sRGB untuk teks `#333333`: coral 4.67:1, kuning 11.08:1, ungu 4.65:1, hover 5.38:1. Shade pressed awal yang gagal diganti sebelum penyelesaian. Ini pemeriksaan token statis, bukan sertifikasi render atau WCAG aplikasi.

Tidak ada perubahan kode aplikasi, dependency, schema, data atau environment dalam tugas dokumentasi ini. Browser aplikasi, CLI build/typecheck dan UAT tidak dijalankan karena implementasi belum dimulai. Perubahan manifest/kode lain yang telah ada di working tree bukan bagian tugas ini.
