# RESORA — sumber kebenaran UI/UX dan frontend

Versi **1.1** · 26 November 2026 · Pemilik keputusan dan sign-off: **PM**.
Status: **arah dan persyaratan PM disetujui; spesifikasi turunan terdokumentasi; refactor belum diimplementasikan atau diterima melalui UAT**.

## 1. Otoritas, cakupan, dan perubahan

Dokumen ini adalah sumber normatif pusat untuk seluruh halaman **setelah login**. `/` dan `/login` di luar refactor ini; perubahan shared token/komponen harus diisolasi agar tidak mengubah kedua halaman itu tanpa persetujuan PM. Semua arahan visual frontend lama, termasuk Google AI Studio/RESORA Red, Geist/Inter, Figma lama, dan larangan bottom navbar, **superseded**. Riwayatnya berada di [arsip](design/history/design-system-before-2026-11-26.md).

**WAJIB** berarti acceptance requirement; **REKOMENDASI** adalah default yang dapat disesuaikan dengan bukti; **OPSIONAL** hanya digunakan bila bermanfaat. Aturan tanpa penanda lain dalam bagian normatif adalah WAJIB. Angka token yang ditetapkan desainer di bawah adalah baseline teknis turunan dari delegasi PM, bukan klaim bahwa PM meninjau setiap nilai. Perubahan alur/interaksi pengguna di luar keputusan PM yang dicatat di sini tetap memerlukan konfirmasi PM, sekalipun tujuan fitur tidak berubah.

| Sumber | Wewenang |
| --- | --- |
| Dokumen ini dan lampiran yang dirujuk | Presentasi, navigasi yang disetujui, interaksi, komponen, copy, aksesibilitas, gate frontend |
| [PRD](prd.md) dan [modul](modules/) | Tujuan fitur, izin, eligibility, status dan transisi bisnis, semantik data |
| [Architecture](architecture.md) dan ADR aktif | Batas modul, integrasi, organisasi kode |
| [Panduan kerja](design-frontend-guidelines.md) | Skill dan katalog library; tidak memiliki aturan visual tandingan |
| Kode/tests | Bukti implementasi, bukan pembatal persyaratan baru |

Jika terjadi konflik nyata, catat aturan terkait, dampak dan usulan; hentikan hanya bagian yang bergantung pada konflik. PM memutuskan. Setelah persetujuan perubahan flow, PRD/modul dan acceptance criteria diselaraskan sebelum implementasi. Agent/developer tidak boleh membuat izin, KPI, fitur, atau transisi baru untuk melengkapi desain.

Lampiran normatif: [pola interaksi dan IA](design/interaction-spec.md), [katalog komponen dan copy](design/component-catalog.md), [verifikasi dan kepatuhan](design/verification.md). Referensi gambar adalah bukti arah, bukan aturan atau fitur produk. Tidak ada MASTER/desain alternatif yang boleh mengalahkan pusat ini. Pengecualian mencantumkan ID aturan/bagian, alasan, cakupan, PM approver, tanggal, dan kapan ditinjau ulang.

## 2. Produk dan pengalaman adaptif

Karakter **hangat profesional**, minimalist sebagai fondasi, dark mode yang lengkap, dan dashboard padat terukur. Mobile mengutamakan tugas cepat; desktop mengutamakan analisis/administrasi. Seluruh fitur yang tersedia sesuai izin tetap dapat diakses di kedua mode. Ukuran layar tidak menentukan permission.

Anggota: Scan QR absen → input pelanggaran/kebersihan kamar → jadwal terdekat. Input modul yang belum dibangun adalah prioritas masa depan, bukan izin membuat menu aktif atau form fiktif. Pengurus: susunan tugas mengikuti jabatan/departemen dan capability yang sudah disahkan; tiga tugas utama belum ditentukan. Pengecualian aktor yang sudah ada tetap berlaku, termasuk SYSTEM_ADMIN bukan peserta absensi SR.

PWA direncanakan setelah modul selesai. Saat ini siapkan shell, safe area, responsivitas, state recovery, dan capability detection; instalasi, service worker, offline submission dan push belum menjadi deliverable.

## 3. Warna dan tema

Light menjadi default kunjungan pertama, tanpa mengikuti OS. Pilihan light/dark eksplisit pengguna disimpan dan dipulihkan tanpa kilatan tema salah. Dark memakai abu arang netral. Warna brand:

| Token | Nilai | Peran |
| --- | --- | --- |
| brand.primary | `#FF6F6F` | Aksi utama dan identitas |
| brand.secondary | `#FFF46E` | Sorotan pendukung |
| brand.soft | `#F6F6F6` | Permukaan ringan dan kontrol sekunder pada light |
| brand.accent | `#A58BFF` | Penekanan selektif |
| neutral.white / neutral.ink | `#FFFFFF` / `#333333` | Netral dasar |

Rasio 40/30/20/10 adalah proporsi relatif penggunaan warna brand, **bukan luas layar atau kuota per komponen**. Permukaan netral mendominasi halaman data. Hover tidak menjadi satu-satunya penanda interaktivitas. Variasi shade diperbolehkan; identitas tetap konsisten.

Baseline semantic token berikut dipetakan ke token kode pada tahap implementasi; jangan memasukkan hex langsung di komponen fitur.

| Token semantik | Light | Dark |
| --- | --- | --- |
| canvas | `#F6F6F6` | `#181818` |
| surface | `#FFFFFF` | `#222222` |
| surface.raised | `#FFFFFF` | `#2C2C2C` |
| surface.subtle | `#F6F6F6` | `#303030` |
| text.primary | `#333333` | `#F6F6F6` |
| text.secondary | `#626262` | `#BDBDBD` |
| border.decorative | `#E2E2E2` | `#424242` |
| border.control | `#808080` | `#969696` |
| action.primary / on-primary | `#FF6F6F` / `#FFFFFF` | sama |
| action.hover / action.pressed | `#FF8585` / `#FF7474` | sama |
| action.secondary / on-secondary | `#FFF46E` / `#333333` | sama |
| action.accent / on-accent | `#A58BFF` / `#FFFFFF` | sama |
| link / focus | `#8C3434` | `#FF9A9A` |
| success.text | `#166534` | `#86EFAC` |
| warning.text | `#854D0E` | `#FDE047` |
| danger.text | `#B91C1C` | `#FCA5A5` |
| info.text | `#1E40AF` | `#93C5FD` |
| destructive.fill / on-destructive | `#B91C1C` / `#FFFFFF` | sama |

Semantic status text digunakan pada surface tema terkait, dengan ikon/teks. Tint status baru harus diverifikasi sebagai pasangan sendiri. Disabled menggunakan surface.subtle dan text.secondary disertai semantik disabled; tidak hanya opacity. Border dekoratif tidak cukup untuk batas input atau focus. Focus ring 2px dengan offset 2px; untuk kontrol berwarna gunakan ring netral kontras atau lapisan pemisah sesuai hasil ukur.

Aksesibilitas mengalahkan estetika: teks normal ≥4.5:1; teks besar menurut definisi WCAG ≥3:1; batas kontrol, indikator state dan visual penting ≥3:1. Elemen dengan latar belakang merah/coral (`#FF6F6F` / `#B91C1C`) dan ungu (`#A58BFF`) memakai teks dan ikon `#FFFFFF`; sorotan kuning (`#FFF46E`) memakai teks `#333333`. Semua pasangan/state/transparansi tetap diperiksa pada render aktual. Target WCAG 2.2 AA berlaku untuk seluruh kriteria yang relevan, tidak terbatas pada daftar ringkas ini ([W3C](https://www.w3.org/TR/WCAG22/)).

## 4. Tipografi, geometri, layout

Font primer **Plus Jakarta Sans**, fallback `system-ui, sans-serif`. Font sekunder **TBD**; jangan memasang font kedua sementara. Gunakan weight 400/500/600/700 seperlunya, font-display swap dan aset dengan lisensi yang sesuai. Angka pada tabel/rekap memakai tabular numerals bila tersedia; jangan mengubah data agar kolom tampak rapi.

| Token | Baseline |
| --- | --- |
| caption | 12px / 1.5; hanya metadata pelengkap |
| label / body.small | 14px / 1.5 |
| body / input mobile | 16px / 1.5 |
| heading.section | 20px / 1.35, 600 |
| heading.page | 24px mobile, 28px desktop / 1.25, 700 |
| metric | 28–36px / 1.2, 600 |
| spacing | 4, 8, 12, 16, 20, 24, 32, 40, 48, 64px; gunakan rem di kode |
| radius.control / card / overlay | 12 / 16 / 24px |
| radius.pill | 999px hanya nav/chip/badge dan tombol Scan bulat |
| icon | 20px inline, 24px navigasi; target sentuh terpisah |
| control touch | minimal 44×44px, CTA utama 48px tinggi |
| control compact desktop | 36px visual; min target 24px sesuai WCAG dan tetap 44px pada pointer coarse |
| page gutter | 16px mobile, 24px tablet, 32px desktop |
| form max width | 640px; halaman data sampai 1440px, terpusat |
| layer | content 0, sticky 10, navbar 20, backdrop 40, dialog/sheet 50, feedback 60 |

Membulat sedang; pill navbar merupakan pengecualian eksplisit. Shadow tipis hanya untuk floating nav/overlay; kartu biasa memakai permukaan/divider. Default desktop nyaman; compact hanya tabel yang memerlukan. Hindari kartu bertumpuk untuk setiap paragraf dan angka dekoratif tanpa konteks.

Breakpoint awal: compact <768px, medium 768–1199px, wide ≥1200px. Compact/medium memakai bottom navbar; wide memakai sidebar collapsible dengan preferensi tersimpan. Ini baseline berbasis ruang, bukan deteksi merek perangkat. Tablet berlayar lebar dengan pointer coarse tetap boleh mempertahankan shell sentuh; uji tablet landscape dan jangan tampilkan dua navigasi utama bersamaan. Hak akses tidak berubah saat breakpoint berubah.

Shell menggunakan `min-height:100dvh`, safe-area-inset dan konten dapat scroll. Jangan mengunci tinggi konten atau zoom browser. Bottom navigation/CTA/keyboard tidak boleh menutup fokus, error, atau baris terakhir. Hover hanya untuk perangkat yang mendukung; touch mendapat pressed feedback. Teks tetap dapat diseleksi, terutama diagnosis.

## 5. Ikon dan library

Iconsax adalah **preferensi visual**, dengan Lucide sebagai alternatif yang disetujui. Gunakan satu keluarga konsisten per shell: outline rounded saat biasa, selected memakai fill bila tersedia atau penanda bentuk/warna + label. Hindari campur stroke/fill secara acak. Ikon QR menggantikan tanda plus pada tombol terpisah. Label terlihat direkomendasikan untuk empat tujuan navbar; accessible name wajib untuk setiap ikon interaktif.

Paket Iconsax React tertentu **belum dipilih atau terverifikasi lisensinya**; repositori aset bukan jaminan lisensi wrapper. Verifikasi paket/versi/aset gratis, lisensi dan kompatibilitas sebelum adopsi; fallback Lucide yang sudah terpasang bila tidak memenuhi. Tidak ada pemasangan dependency dalam pekerjaan dokumentasi ini.

Library gratis dari [katalog](design-frontend-guidelines.md#katalog-library-frontend) boleh diadaptasi atau menggantikan komponen existing bila sesuai. Tidak wajib mempertahankan seluruh primitive lama. Hasilnya tetap memakai kontrak komponen, token, aksesibilitas dan batas Architecture yang sama. Hindari beberapa implementasi paralel untuk kontrol identik. Setiap tambah/ubah/hapus dependency/library/arsitektur dicatat di dokumentasi proyek (tanggal, paket/versi, lokasi pemakaian, lisensi/atribusi, dampak/migrasi); tidak diwajibkan esai alasan pemilihan.

## 6. Motion

Motion halus, fungsional, tidak menunda tugas. Baseline: feedback 100–150ms; transisi kontrol 150–200ms; sheet/dialog 200–280ms. Easing masuk `cubic-bezier(0.2,0,0,1)`, keluar ease-in lebih singkat. Nilai teknis ini dapat dituning lewat verifikasi lokal tanpa mengubah flow. Utamakan opacity/transform dan batalkan transisi lama bila input baru masuk.

| Prinsip | Penggunaan |
| --- | --- |
| Easing | Respons kontrol dan perpindahan konteks |
| Offset & Delay | Stagger kecil pada launcher; tidak menunda akses tindakan |
| Parenting | Sheet dan isi bergerak sebagai satu konteks |
| Transformation | Perubahan bentuk/state yang menjaga orientasi |
| Value Change | Perubahan angka boleh singkat; nilai final segera tersedia untuk pembaca layar |
| Masking | Reveal sheet/menu tanpa kehilangan fokus |
| Overlay | Lapisan sementara dengan backdrop dan fokus yang benar |
| Cloning | Opsional, membantu kontinuitas; salinan dekoratif tidak masuk accessibility tree |
| Obscuration | Hanya konteks latar overlay; jangan mengaburkan informasi penting |
| Parallax | Hindari pada input, scan dan pengolahan data |
| Dimensionality | Elevation ringan untuk hirarki; tanpa efek 3D dekoratif pada operasi |
| Dolly & Zoom | Hindari pada input/data; zoom kamera merupakan kontrol fungsional, bukan animasi dekoratif |

Tidak wajib menggunakan semua prinsip. `prefers-reduced-motion` menghapus gerakan nonesensial, stagger, parallax dan count-up; hasil/state tetap tersampaikan. Jangan memakai shimmer bergerak tanpa alternatif statis.

## 7. Kontrak kerja FE/BE

| Tanggung jawab | FE | BE / domain pemilik |
| --- | --- | --- |
| Navigasi dan presentasi | Layout adaptif, label, focus, sheet/modal, format tampilan | Tidak membaca permission dari keberadaan/ketiadaan tombol |
| Identitas/permission | Render capability yang diberikan; empty/forbidden jelas | Validasi actor/active/department/position/assignment/privilege pada setiap operasi; server adalah otoritas |
| Pengambilan data dan cache | Prioritaskan data inti, render cache akun yang cocok bila aman, revalidasi di latar; optimistic update terbatas dan dapat di-rollback | Menyediakan data/API otoritatif dan tetap memvalidasi setiap pembacaan/tindakan; kebutuhan ETag/revision atau kontrak cache baru perlu persetujuan pemilik modul/PM |
| Check-in QR | Kamera/GPS, local feedback, retry, no duplicate request | Token QR, invitation, session, eligibility, geofence, distance dan attendance write/transaksi adalah aturan backend |
| Diagnostik | Data lingkungan/acquisition lokal secara best effort; daftar allowlist; salin oleh aksi user | Whitelisted projection untuk angka server; jangan expose QR/coordinates/errors bebas; jangan simpan kegagalan |
| Draft | Penyimpanan lokal terpisah dari request; label belum terkirim; restore/clear | Jangan menganggap draf sebagai commit; validasi ulang data/izin saat submit |
| Dashboard | Format chart/kartu dan ringkasan hanya dari dataset lengkap yang diizinkan | Modul sumber memasok data/metric contract dan scope akses; tidak perlu backend aggregator baru kecuali PRD memutuskan |
| Tanggal/waktu | Presentasi `Asia/Jakarta`/WIB untuk tanggal event/operasional | Simpan timestamp UTC; aturan tanggal kalender/zone tetap dimiliki domain |

Strategi prioritas fetch, persistence, revalidation dan batas optimistic UI diatur di [spesifikasi data/cache](design/interaction-spec.md#7-pengambilan-data-bertahap-cache-lokal-dan-optimistic-ui). Cache dan prediksi FE tidak mengubah eligibility, permission, atau status final dari BE.

Saat ini check-in error untuk `GPS_INACCURATE`/`OUTSIDE_GEOFENCE` mengirim projection jarak, radius dan akurasi sesudah QR/invitation valid, tanpa menulis kegagalan. Success/duplicate belum mengirim jarak/radius. Karena PM mewajibkan diagnosis juga setelah berhasil, modul Attendance perlu menyepakati typed success diagnostic projection, semantik `ID diagnosis` dan field `Percobaan` sebelum FE mengimplementasikan hasil sukses. Spesifikasi detail serta status current-versus-needed ada di [scanner contract](design/interaction-spec.md#6-scanner-dan-diagnosis-absensi). Jangan hitung ulang jarak geofence di FE, jangan buat telemetry, dan jangan ubah server policy atau persistence tanpa keputusan modul yang sesuai.

P1-04 Dashboard sudah memiliki kontrak lebih spesifik: data produksi unavailable bila sumber tak terhubung; fixture hanya development/test; metric/formula yang dilarang dihitung FE tetap tidak boleh dihitung. Desain visual tidak membuat API atau permission baru.

## 8. Bukti, status dan tindak lanjut

Keputusan PM 26 November 2026: seluruh jawaban 1–55, klarifikasi navbar empat tujuan, dan arahan pemuatan data bertahap, cache browser, serta optimistic UI menjadi dasar versi ini. Detail baru yang belum disahkan tetap tercantum sebagai TBD pada lampiran, bukan izin implementasi diam-diam. Refactor diterima setelah guideline terpenuhi, state penting tercakup, CLI dan browser lokal lolos, review aksesibilitas selesai, serta UAT/sign-off PM.

Referensi visual yang ditinjau: Contoh UI01–05.jpeg dari PM (26 November 2026). Diambil: pill nav mengambang + aksi bulat terpisah; launcher grid; kartu ringan; progressive disclosure. Tidak diambil: branding ClickUp, fitur AI/chat, gradien pelangi, atau status data contoh. Gambar tidak disalin ke produk.

Referensi primer, diperiksa 26 November 2026:

- [WCAG 2.2](https://www.w3.org/TR/WCAG22/) — target aksesibilitas; ukuran 44px adalah standar produk yang lebih ketat dari minimum AA target-size 24px dengan pengecualian.
- [WAI modal dialog pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/) — fokus dan keyboard overlay.
- [MDN storage quotas/eviction](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria) — batas jaminan draf lokal.
- [TanStack Query persistence](https://tanstack.com/query/latest/docs/framework/react/plugins/persistQueryClient) — mekanisme persistence cache yang harus diverifikasi terhadap versi terpasang saat implementasi.
- [MDN media capabilities](https://developer.mozilla.org/en-US/docs/Web/API/MediaStreamTrack/getCapabilities) — deteksi kemampuan kamera, bukan asumsi berdasarkan perangkat.
- [Web Vitals](https://web.dev/articles/vitals) — rekomendasi target performa dan perbedaan data lab/lapangan.
- [Plus Jakarta Sans](https://fonts.google.com/specimen/Plus+Jakarta+Sans) dan [Iconsax upstream](https://github.com/lusaxweb/iconsax) — sumber aset untuk verifikasi saat implementasi.

Skill merupakan bantuan, bukan sumber aturan tertinggi. Hasil generator ui-ux-pro-max untuk query operasional menghasilkan pola landing yang tidak cocok; pencarian lanjutan dashboard tidak menemukan match produk. Pola tersebut tidak diadopsi. Dasar desain adalah brief PM, referensi primer dan prinsip umum skill. `uxui-principles` yang terpasang merupakan router; tidak diklaim telah menjalankan evaluator 168 prinsip. Checklist skill review yang masih menyebut WCAG 2.1 ditingkatkan ke persyaratan 2.2 di proyek ini.

Changelog: **1.1 / 2026-11-26** — menambahkan prioritas pengambilan data, cache query lokal dengan revalidasi, batas optimistic UI, dan verifikasi cold/warm/offline/account-switch. Implementasi persistence query masih tahap berikutnya.

Changelog: **1.0 / 2026-11-26** — menggantikan semua baseline visual lama; menambahkan mobile/tablet bottom nav, identitas baru, draft recovery, scanner specification dan otorisasi tetap verifikasi lokal. Implementasi aplikasi, CI tambahan dan adopsi library masih tahap berikutnya.
