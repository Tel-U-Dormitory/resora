# Frontend refactor — F4 Beranda/Dashboard

Tanggal: 2026-11-26. Design System 1.1. Branch: `refactor/ui-ux-f4-dashboard`, dari commit lokal F3 `e093cc6`. PM mengizinkan lanjut F4 pada percakapan ini; F5 belum dikerjakan.

## Implementasi dan cakupan

- Perbaikan kecil pada CSS shell bersama diperlukan oleh gate F4: ukuran ikon/QR/gutter dibatasi, sementara label navbar tetap dapat membesar dan membungkus tanpa tumpang tindih. Empat tujuan, urutan, capability dan breakpoint tidak berubah.
- Urutan DOM/mobile: KPI → pengumuman → kegiatan (termasuk riwayat pribadi existing) → akses cepat. Desktop menempatkan pengumuman/kegiatan berdampingan; KPI dan akses cepat memakai lebar penuh. Pada layar sempit/pembesaran teks, kartu dapat turun kolom.
- Kartu memakai ikon Lucide konsisten, pastel dari token pusat, scope eksplisit, periode sumber dan angka locale `id-ID`. Kartu bukan tautan metrik sintetis ke detail nyata. Tidak menambah grafik karena sumber KPI/tren produksi belum tersedia.
- Sapaan dan copy memakai bahasa Indonesia/kamu. Mode personal/manajemen tetap mengikuti capability sesi existing; select memiliki label terlihat. Aksi cepat mempertahankan tujuan yang sudah ada, dengan header yang benar dan kartu lebih padat.
- Kebersihan Kamar hanya menjadi placeholder “Segera hadir” untuk SR, tanpa angka, periode fiktif, ekspor atau CTA. SYSTEM_ADMIN tidak mendapat placeholder peserta ini, Scan QR atau riwayat absensi pribadi.
- Penilaian, Kehadiran dan Pelanggaran produksi tetap unavailable bila belum ada sumber dashboard yang sah. Tidak mengambil angka agregat dari satu halaman kegiatan/riwayat. Formula fixture `hadir / total relevan × 100` beserta guard existing dipertahankan; tidak menghitung skor/kelengkapan penilaian atau agregat pelanggaran baru.
- Ekspor simulasi hanya muncul nonaktif pada preview sintetis, dengan penjelasan terlihat. Tidak menambah download, endpoint atau capability produksi.
- Indikator offline memberi tahu bahwa informasi yang sudah dimuat mungkin belum terbaru; mengikuti event koneksi browser secara best effort, tanpa membuat cache persisten atau menjanjikan submit offline.
- State loading, nilai nol, empty, not assessed, missing period, coming soon, unavailable, error dan forbidden dipertahankan terpisah. Pengumuman/kegiatan tetap memuat dan retry secara independen dari KPI.

## Sumber dan referensi

Mengikuti prompt F4, PRD P1-04, `docs/modules/dashboard/DASH-01-discovery.md`, `docs/design-system.md`, panduan frontend dan lampiran component/interaction/verification. Kode query/API dan policy existing diperiksa; tidak ada kontrak summary produksi baru.

Lima JPEG referensi sudah diinspeksi pada fase sebelumnya; UI01 ditinjau lagi pada F4. Bagian `BerandaPage` referensi kasar dibaca: diambil hierarki, kartu netral, aksen ikon dan komposisi adaptif. KPI/jadwal/pengumuman/poin contoh, grafik dan pencarian pada mockup tidak diadopsi menjadi requirement atau sumber data. Skill desain diadaptasi untuk dashboard operasional; aturan hero/foto/landing page tidak diterapkan. Pencarian skill Next.js kurang relevan; pencarian UX berikutnya memberi panduan empty state dan label kontrol yang sesuai.

## Bukti verifikasi

- CLI: 48 tes / 709 assertion pada dashboard fixtures, Broadcast UI dan workflow interaction lulus. Typecheck frontend, Biome sembilan file F4, architecture check dan `git diff --check` lulus.
- Build produksi webpack terisolasi lulus. Adapter font Next memakai cache aset Google asli untuk Geist existing; Jakarta tetap file lokal. CLI Next menampilkan peringatan keamanan versi existing dan meminta pengulangan; tidak dilakukan upgrade dependency pada F4.
- Browser Chromium 158: 320/390/768/1024/1440 px light/dark; anggota/pengurus/SYSTEM_ADMIN, unavailable produksi tanpa fixture, switch cakupan, loading/error/retry tiap feed, keyboard/Back, reflow 200% + text-spacing di 320 px, preview komponen dan state. Feed berisi data sintetis diuji dengan judul panjang, detail pengumuman/Escape, offline/reconnect dan respons forbidden. Seluruh rangkaian lulus tanpa pageerror.
- Regresi shell juga lulus pada 320/390/768/1024/1199/1200/1440 px, termasuk tema, launcher, Back/fokus dan preferensi collapse.
- Browser: hasil akhir dicatat di `output/playwright/f4/results.json` dan `populated-results.json`, bersama `shell-regression/results.json`, `unit.log`, `build.log` dan screenshot. Pengujian belum merupakan UAT/release sign-off.
- Preview browser memakai bundle QA terpisah yang me-mount komponen dashboard asli dengan fixture; provider aplikasi produksi tetap tidak diubah dan mengembalikan `null`. Harness QA tidak ditambahkan ke aplikasi atau commit.

## Review UX/aksesibilitas

Status informasi memakai teks, tidak hanya warna. Scope/periode terlihat; nol tidak dipakai menggantikan unavailable. Urutan baca sesuai prioritas mobile. Kontrol mode memiliki label dan target sentuh; kartu statis tidak menyamar sebagai button. Error feed menyediakan retry lokal; privilege tidak berasal dari elemen UI. Semantik heading/region dan dekorasi `aria-hidden` ditinjau. Tidak ada form bisnis atau mutasi baru.

Review heuristik: status, pemulihan error, konsistensi dan recognition didukung label/state/retry existing; kontrol dan kebebasan didukung navigasi/back; match dunia nyata lewat istilah kegiatan/pengumuman; pencegahan error lewat ekspor nonaktif dan guard capability; kepadatan disederhanakan tanpa metrik dekoratif. Tidak ada fitur bantuan/shortcut baru yang diciptakan untuk memenuhi checklist.

## Batas dan dampak

Tidak mengubah backend, autentikasi/otorisasi, schema, database, dependency, konfigurasi produksi atau storage/cache persisten. Tidak ada push/deploy. Perubahan pengguna yang sudah ada dipertahankan.

Belum diverifikasi: perangkat nyata, Safari iOS/Chrome Android/Brave aktual, pembaca layar native, metrik performa lapangan dan UAT PM. Pemeriksaan semantik/keyboard adalah proxy, bukan klaim telah menguji VoiceOver/TalkBack/NVDA atau sertifikasi WCAG penuh.

Sumber KPI/ekspor produksi dan scope detail manajemen tetap deferred sesuai DASH-01; tidak menjadi angka palsu di F4. Peringatan versi Next existing perlu tindak lanjut terpisah. **Berhenti sebelum F5 untuk review PM.**
