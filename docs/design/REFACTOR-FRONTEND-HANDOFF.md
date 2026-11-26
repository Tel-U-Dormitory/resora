# RESORA — konteks awal refactor frontend

> Dokumen orientasi untuk memulai sesi AI/developer baru. **Bukan sumber persyaratan baru** dan bukan pengganti spesifikasi kanonis. Jika ringkasan ini berbeda dengan dokumen pusat, ikuti sumber yang dirujuk di bawah dan laporkan konflik yang nyata.

## Ringkasan satu menit

**Status eksekusi terbaru (2026-11-26):** F0–F5 telah dikerjakan di branch refactor masing-masing; laporan dan batas verifikasi tersedia di [F0](../reviews/frontend-refactor-f0.md), [F1](../reviews/frontend-refactor-f1.md), [F2](../reviews/frontend-refactor-f2.md), [F3](../reviews/frontend-refactor-f3.md), [F4](../reviews/frontend-refactor-f4.md), dan [F5](../reviews/frontend-refactor-f5.md). Commit lokal: F1 `a1abfe7`, F2 `b16c111`, F3 `e093cc6`, F4 `a20c287` dengan revisi kartu modul `e184d18`, F5 `6a6dd49`. Tidak di-push; F6 menunggu review PM. Laporan lintas branch adalah catatan pengerjaan, bukan klaim bahwa kode F2–F5 tersedia pada branch foundation atau sudah dirilis. UAT dan perangkat nyata tetap pending. Beranda menampilkan kartu pasif modul mendatang sesuai arahan PM; Inbox tidak menambahkan unread/notification atau search server.

RESORA sedang menjalankan refactor UI/UX dan frontend untuk seluruh halaman setelah login, kecuali `/` dan `/login`. PM sudah menyetujui arah desain dan spesifikasi target; **refactor belum dinyatakan selesai, belum diterima melalui UAT, dan beberapa detail fitur masih TBD**. Tahap berikutnya adalah review PM atas F5 sebelum melanjutkan F6, dengan aturan produk dan backend tetap di sumber masing-masing.

Gunakan dokumen ini untuk orientasi. Sebelum mengambil keputusan atau mengubah kode, baca dokumen normatif dan PRD/modul yang relevan. Jangan menganggap contoh UI sebagai fitur, mock data sebagai data produk, atau perilaku kode lama sebagai persetujuan untuk mempertahankan UI lama.

## Sumber kebenaran dan urutan baca

1. [`AGENTS.md`](../../AGENTS.md) — cara kerja agent, sumber persyaratan, batas keselamatan dan quality gates.
2. [`docs/design-system.md`](../design-system.md) — sumber normatif pusat untuk UI/UX dan frontend pasca-login, versi 1.1.
3. Lampiran normatif:
   - [`interaction-spec.md`](interaction-spec.md) — navigasi, layar, alur, scanner, diagnosis, draft, cache dan optimistic UI.
   - [`component-catalog.md`](component-catalog.md) — komponen, state, istilah dan copy.
   - [`verification.md`](verification.md) — browser/CLI, accessibility, performa dan acceptance gates.
4. [`docs/design-frontend-guidelines.md`](../design-frontend-guidelines.md) — pemilihan skill/library dan alur kerja frontend; tidak menggantikan aturan produk atau visual.
5. [`docs/prd.md`](../prd.md), dokumen modul terkait di `docs/modules/`, [`docs/architecture.md`](../architecture.md), serta ADR aktif — tujuan fitur, permission, aturan domain, API dan batas teknis. Gunakan sumber yang relevan untuk layar yang disentuh.

Dokumen desain visual lama yang bertentangan ditandai superseded/historis; lihat bagian otoritas dan tautan arsip di Design System. `DESIGN.md`, kode existing, skill, katalog komponen, MCP, dan gambar referensi tidak dapat membatalkan sumber kanonis.

## Keputusan PM yang sudah disetujui

- **Cakupan:** semua halaman sesudah login; `/` dan `/login` tidak masuk refactor. Perubahan shared style/token harus menjaga halaman yang dikecualikan kecuali PM menyetujui perubahan cakupan.
- **Mode produk:** pengalaman adaptif. Mobile/tablet memprioritaskan tugas singkat dan shell native-like; desktop memprioritaskan analisis dan administrasi. Semua kemampuan tetap tersedia sesuai hak akses, bukan ditentukan ukuran layar.
- **Navigasi mobile/tablet:** empat tujuan dari kiri ke kanan: **Beranda → Inbox → Profil → Apps**, dengan tombol bulat **Scan QR** terpisah. Profil berisi statistik, riwayat dan detail absensi pribadi. Apps adalah launcher capability. Jangan mengganti urutan/nama atau memindahkan konten tanpa keputusan PM.
- **Navigasi desktop:** sidebar kiri yang bisa diciutkan dan menyimpan preferensi, serta utility bar kontekstual. Jangan tampilkan dua navigasi utama bersamaan. Breakpoint awal dan penanganan tablet tercantum di Design System.
- **Visual:** minimalis, hangat profesional, dashboard padat secukupnya; light tema awal dan dark mode abu arang netral; Plus Jakarta Sans primer; bentuk membulat sedang. Palet brand: `#FF6F6F`, `#FFF46E`, `#F6F6F6`, `#A58BFF`, dengan netral putih dan `#333333`. Rasio 40/30/20/10 menunjukkan proporsi relatif penggunaan warna brand, bukan persentase piksel.
- **Aksesibilitas:** target wajib WCAG 2.2 AA; keterbacaan/fungsi menang bila bertentangan dengan estetika. Ikon tidak boleh menjadi satu-satunya pembawa makna. Target sentuh, fokus, keyboard, pembaca layar, zoom, kontras dan reduced motion dirinci di dokumen pusat.
- **UX writing:** Bahasa Indonesia, sapaan “kamu”, santai dan hangat untuk remaja/dewasa muda; pakai kamus istilah resmi di katalog. Waktu tampilan mengikuti standar organisasi dan berlabel WIB; penyimpanan backend UTC.
- **Interaksi dan data:** feedback sesuai urgensi; form menyimpan draf lokal terpisah dari data terkirim. Pengambilan data bertahap mendahulukan shell/aksi dan data penting; sisanya asynchronous. Cache lokal dapat membantu warm start, tetapi data penting direvalidasi dan status stale/offline dibuat jelas. Optimistic UI terbatas pada aksi berisiko rendah yang deterministik dan dapat di-rollback. Absensi/QR, permission, eligibility, transaksi penting dan hasil tak pasti menunggu konfirmasi server.
- **Perubahan alur:** agent boleh mengusulkan perbaikan selama goal fitur tetap, tetapi perubahan interaksi/flow tetap perlu konfirmasi PM. Setelah disetujui, selaraskan PRD/modul dan acceptance criteria sebelum implementasi.
- **Penerimaan akhir:** PM adalah pemilik keputusan dan pemberi sign-off UAT. Dokumentasi saja, implementasi, pengujian, penerimaan dan rilis adalah status yang berbeda.

## Peran dan batas yang tidak boleh diasumsikan

- Anggota biasa memprioritaskan Scan QR absen, jadwal terdekat, dan input pelanggaran/kebersihan kamar **setelah modulnya benar-benar tersedia**. Jangan membuat modul yang belum dibangun tampak aktif.
- Tugas pengurus bergantung pada jabatan, departemen dan capability yang disahkan. Tiga tugas utama pengurus belum ditentukan.
- Backend tetap otoritas untuk permission, eligibility, geofence, status absensi, validasi dan transaksi. FE merender capability yang diberikan; keberadaan/sembunyinya tombol bukan kontrol keamanan.
- Scanner harus full-screen, mendukung zoom kamera jika perangkat/API menyediakannya, dan menyediakan diagnosis yang dapat disalin sesuai allowlist. Diagnosis kegagalan yang ada harus dipertahankan; diagnosis sukses memerlukan kontrak typed dari modul/backend untuk field server. FE tidak boleh menghitung ulang aturan geofence atau mengarang diagnosis.
- Jaringan pengguna dapat berubah-ubah. Cache browser best-effort dan dapat dihapus sistem/browser. Jangan menjanjikan semua data tersedia offline atau tidak berubah tanpa revalidasi.
- Data pribadi/sensitif tidak boleh dipersist sebelum ada allowlist, retensi, aturan penghapusan saat logout/pergantian akun dan persetujuan modul. Jangan simpan credential, token, QR mentah, koordinat presisi, diagnosis sensitif atau respons export.
- Offline auto-submit, antrean mutasi offline, PWA/service worker/push, API/cache contract baru dan perubahan schema bukan konsekuensi otomatis dari desain ini; lihat PRD/ADR serta keputusan PM.

## Target desain vs implementasi

Spesifikasi pusat berstatus disetujui dan terdokumentasi, tetapi **jangan mengasumsikan refactor telah diterapkan ke seluruh layar**. Design System mencatat persistence query masih tahap berikutnya: baseline yang diperiksa memakai TanStack Query v5 in-memory; penerapan plugin persistence, cache allowlist dan lifecycle akun harus diverifikasi lagi pada kode saat implementasi. Periksa keadaan repository aktual—termasuk branch dan `git status`—sebelum menyimpulkan apa yang sudah berubah. Kode existing adalah bukti implementasi, bukan pengganti persyaratan.

## Cara memulai pekerjaan implementasi di sesi baru

1. Baca sumber di atas; pilih PRD/modul dan ADR untuk layar yang akan dikerjakan.
2. Cek `git status`, branch, route, komponen, query/cache, style token, scripts, dan implementasi sekitar. Pertahankan perubahan lokal yang sudah ada; jangan reset atau menimpa kerja pengguna.
3. Inventaris layar, role/capability, dan state yang terdampak. Tandai TBD/konflik dahulu; jangan menebak domain rule.
4. Buat irisan kerja kecil yang berujung layar dan state lengkap, bukan refactor massal semua route tanpa urutan. Catat dampak pada dependency, library atau arsitektur setiap kali ada perubahan.
5. Untuk pekerjaan frontend gunakan skill yang diwajibkan `AGENTS.md`: `ui-ux-pro-max` dan `design-taste-frontend`; tambahkan `uxui-principles` untuk IA/flow/usability, `ux-copy` untuk teks antarmuka, serta `review-ux-ui` untuk review yang masuk cakupan. Skill membantu, tetapi keputusan kanonis menang.
6. Terapkan gate dari [`verification.md`](verification.md). PM telah memberi otorisasi tetap untuk pengujian browser lokal pada perubahan visual; lakukan dan catat sebelum memulai fitur visual berikutnya. Otorisasi itu bukan UAT, deployment, akses production, atau izin mutasi eksternal.
7. Laporkan secara jujur apa yang diimplementasikan, perintah dan hasil verifikasi, yang belum diuji, dampak dependensi/arsitektur, TBD, dan status sign-off PM.

## Prompt awal untuk AI baru

> Kamu melanjutkan perencanaan dan implementasi refactor frontend RESORA. Mulai dengan membaca `AGENTS.md`, `docs/design-system.md`, lampiran `docs/design/interaction-spec.md`, `docs/design/component-catalog.md`, `docs/design/verification.md`, `docs/design-frontend-guidelines.md`, lalu PRD/modul/Architecture/ADR yang relevan. Dokumen handoff ini hanya orientasi; ikuti sumber kanonis jika ada perbedaan. Periksa branch, `git status`, dan implementasi aktual sebelum mengubah apa pun. Hormati scope pasca-login (`/` dan `/login` dikecualikan), keputusan navbar, aksesibilitas, batas FE/BE, dan aturan cache/optimistic UI. Jangan membuat permission, business rule, fitur atau perubahan flow baru; catat TBD/konflik dan minta keputusan PM bila pekerjaan bergantung padanya. Kerjakan bertahap per layar/state, ikuti skill dan verification gates dalam `AGENTS.md`, lalu berikan rencana singkat untuk irisan pertama sebelum memperluas cakupan. PM tetap pemilik sign-off akhir.

