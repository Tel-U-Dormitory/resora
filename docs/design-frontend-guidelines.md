# Panduan Kerja Frontend dan UX

Panduan ini mengatur cara menerapkan skill desain pada pekerjaan frontend RESORA. Sumber kebenaran visual tetap [`design-system.md`](design-system.md); aturan produk tetap berasal dari PRD, dokumen modul, dan ADR yang disetujui.

## Pemilihan skill

| Skill | Gunakan ketika |
| --- | --- |
| `ui-ux-pro-max` | Mendesain, membangun, mengubah, atau meninjau struktur UI, responsivitas, aksesibilitas, interaksi, tipografi, warna, dan komponen. |
| `design-taste-frontend` | Membuat atau merombak antarmuka frontend dan perlu menentukan komposisi, hierarki visual, tipografi, ritme, atau detail visual. Adaptasikan arahan visualnya ke sistem RESORA; jangan menerapkan aturan landing page secara mentah pada konsol operasional. |
| `uxui-principles` | Menentukan arsitektur informasi, alur, pencegahan kesalahan, umpan balik, atau keputusan usability berbasis prinsip UX. |
| `ux-copy` | Menulis atau mengulas label, CTA, pesan validasi/error, konfirmasi, tooltip, empty state, loading state, dan onboarding. |
| `review-ux-ui` | Menilai UI atau alur yang sudah ada terhadap usability, heuristik, aksesibilitas, formulir, dan pemulihan dari kesalahan. |

Untuk pekerjaan desain atau implementasi frontend, gunakan `ui-ux-pro-max` dan `design-taste-frontend`. Tambahkan skill lain sesuai bagian yang disentuh; gunakan `review-ux-ui` untuk review UX/accessibility yang memang termasuk ruang lingkup tugas. Jika suatu skill belum tersedia, lanjutkan dengan panduan project yang ada dan nyatakan keterbatasannya.

## Urutan penerapan

1. Baca persyaratan fitur yang relevan, implementasi di sekitarnya, komponen yang tersedia, serta `docs/design-system.md` dan `DESIGN.md` jika ada.
2. Turunkan kebutuhan UI dari pengguna, tujuan tugas, data yang benar-benar tersedia, dan state alur. Tandai asumsi; jangan menciptakan field, status, aksi, atau data contoh yang tidak disetujui.
3. Tetapkan struktur, hirarki, responsivitas, dan perilaku dengan skill desain yang berlaku. Gunakan Figma sebelum coding bila fitur memerlukan eksplorasi layout atau perbandingan beberapa arah desain; selain itu implementasikan langsung di kode. Rancangan Figma tetap mengikuti token pusat dan keputusan produk RESORA. Evaluasi komponen existing dan library gratis yang sesuai; adaptasi/penggantian diperbolehkan mengikuti kontrak komponen pusat.
4. Prioritaskan data untuk shell/aksi utama, lalu ambil detail sekunder secara asynchronous sesuai [kontrak loading dan cache](design/interaction-spec.md#7-pengambilan-data-bertahap-cache-lokal-dan-optimistic-ui). Lengkapi state cache/stale/offline, loading, kosong, berhasil, validasi, error, disabled, serta mutation pending/rollback. Optimistic UI hanya untuk mutasi aman yang dapat dipulihkan; server tetap menentukan hasil. Pastikan keyboard, fokus, label, kontras, ukuran target sentuh, serta urutan baca mendukung pengguna.
5. Tulis copy yang menyebut aksi atau keadaan secara jelas, konsisten dengan istilah produk, ringkas, dan memberi langkah pemulihan yang berguna saat terjadi error.
6. Periksa hasil terhadap persyaratan, design system, responsivitas, aksesibilitas, dan alur pengguna. Pisahkan temuan UX dari preferensi visual dan beri lokasi serta dampak yang konkret.

## Katalog library frontend

Library berikut dapat dijadikan referensi, sumber komponen terpilih, atau dasar adaptasi sesuai kebutuhan desain. Daftar ini bukan rekomendasi untuk memasang semuanya atau mengganti stack project.

### Komponen dan animasi

Aceternity UI, Animate UI, Animata (`animata.design`), Cult UI (`cult-ui.com`), Eldora UI (`eldoraui.site`), Evilbuttons (`evilbuttons.com`), Fancy Components, Hover.dev (`hover.dev`), Lightswind UI, Magic UI, Motion Primitives, React Bits, Skiper UI (`skiper-ui.com`), dan SmoothUI (`smoothui.dev`).

### Tailwind CSS, utility, dan blocks

AlignUI, Amicro UI, Beautiful UI, daisyUI, Easy UI, Eternity UI, Extra UI, Float UI, Flowbite, FlyonUI, Franken UI, Hese UI, HextaUI, HyperUI, Kibo UI, Kokonut UI (`kokonutui.com`), Meraki UI, MVP Blocks, Ninna UI, Origin UI / OriginKit (`originkit.dev`), Podie (`podie.dev`), Preline UI, ReUI, Reverse UI, shadcn/ui, Spectrum UI, TailArk, TailGrids, dan UI Layouts (`uselayouts.com`).

### Primitif, headless, dan komponen lengkap

Ant Design, Base UI (BaseCN), Chakra UI, Headless UI, HeroUI, Jolly UI, Mantine, MUI, Park UI, Radix UI, dan Ripple UI.

### Gaya khusus

8bitcn UI, RetroUI, dan Tremor untuk dashboard serta chart.

### Direktori dan marketplace

21st.dev.

## MCP untuk workflow desain

MCP membantu agent mencari/membaca aset atau mengerjakan artefak desain. MCP tidak menggantikan [Design System RESORA](design-system.md), PRD, batas lisensi, maupun sign-off PM. Gunakan seperlunya; jangan menyalin tema atau pola referensi mentah-mentah ke produk.

| MCP | Workflow yang didukung | Status Codex (26 November 2026) | Batas penggunaan |
| --- | --- | --- | --- |
| Figma | Membaca, membuat, meninjau, dan meneruskan desain ke implementasi; diagram/kolaborasi desain | Plugin Figma terdaftar dan telah disarankan untuk dipasang; status katalog saat dicek menunjukkan belum terpasang/terhubung | File/proyek tetap mengikuti akses akun; desain yang dibawa ke kode harus cocok dengan token RESORA dan lisensi aset |
| Spline | Membuat dan mengedit aset/scene visual 3D serta layout 2D Hana | Tool Spline tersedia pada sesi Codex ini | Gunakan hanya jika kebutuhan visual memang terbantu; bukan dekorasi default untuk layar operasional. Fitur generatif dapat memakai kredit akun |
| Penpot MCP (`https://design.penpot.app/mcp/stream`) | Membaca dan mengedit file desain, token, komponen, dan menerjemahkan desain ke kode | Alternatif gratis/open-source yang direkomendasikan bila Figma tidak sesuai biaya; belum dikonfigurasi | Perlu akun/instance Penpot, persetujuan akses, serta file yang dibuka dan disambungkan. Remote MCP hanya mengakses hal yang diekspos Penpot, bukan filesystem lokal |

Status “tersedia” berarti konektor/tool ditemukan pada lingkungan yang diperiksa, bukan bukti semua akun, file, atau fitur eksternal dapat diakses. UI8 tidak dipakai: endpoint-nya sudah dihapus dari konfigurasi Codex global setelah diketahui membutuhkan paket berbayar. Catat jika status koneksi berubah. Jangan menaruh token OAuth, kredensial, atau aset berlisensi di dokumentasi atau repository.

### Aturan pemilihan

- Mulai dari kebutuhan fitur, kontrak design system dan komponen yang tersedia. Komponen existing boleh diadaptasi/diganti dengan library gratis sesuai kebutuhan visual dan fungsi; tidak wajib mempertahankan seluruh fondasi lama.
- Sebelum mengambil library atau komponennya, periksa dukungan framework dan versi, lisensi, dependensi, cara styling, ukuran bundle, aksesibilitas, dan state interaksinya. Jangan menganggap katalog ini sebagai verifikasi bahwa setiap library masih aktif, kompatibel, gratis, atau aman untuk produksi.
- Ambil hanya pola atau komponen yang diperlukan. Sesuaikan warna, tipografi, radius, spacing, feedback, responsivitas, dan perilaku gerak ke design system RESORA; jangan membawa seluruh tema default library.
- Hanya gunakan komponen gratis. Periksa lisensi paket/aset dan catat atribusi yang diwajibkan. Setiap tambah/ubah/hapus dependency, library atau arsitektur dicatat di dokumentasi proyek; esai alasan pemilihan tidak diwajibkan.
- Jika memilih animasi, pastikan animasi menjelaskan respons atau hierarki, tidak menghalangi tugas, dan menghormati `prefers-reduced-motion`. Efek visual tidak boleh menggantikan status, label, atau feedback aksesibel.

## Batas dan prioritas

- PRD, persyaratan modul, ADR dan design system yang disetujui mengalahkan contoh/default skill. Implementasi aktual merupakan bukti, bukan aturan yang mengalahkan desain baru.
- Skill adalah panduan kerja, bukan persetujuan untuk mengubah behavior produk, mengakses layanan eksternal, menjalankan browser, mengambil screenshot, atau melakukan deployment.
- Ikuti [sumber pusat](design-system.md) dan kontrak verifikasi yang dirujuknya: PM telah memberi otorisasi tetap browser lokal untuk setiap perubahan visual. Review statis tetap disebut review statis, bukan hasil uji visual.
- Gunakan review UX/accessibility untuk menemukan masalah dan usulan. Jangan menyatakan kepatuhan WCAG atau keberhasilan alur tanpa bukti yang sesuai.
- Untuk UI konsol operasional, utamakan keterbacaan data, hierarki aksi, status yang jelas, dan efisiensi kerja; jangan menambahkan dekorasi atau gerak hanya karena contoh skill menyarankannya.
