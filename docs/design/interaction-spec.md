# Spesifikasi IA dan interaksi

Lampiran normatif [Design System 1.1](../design-system.md), 26 November 2026. Persyaratan target, bukan laporan fitur sudah berjalan.

## 1. Shell dan navigasi

PM mengonfirmasi empat tujuan navbar, kiri ke kanan: **Beranda → Inbox → Profil → Apps**, ditambah tombol bulat **Scan QR** terpisah di kanan. Statistik, riwayat dan detail absensi pribadi berada dalam Profil. Navbar mobile/tablet mengambang berbentuk pill; posisi dan ukuran tidak berubah antar tujuan. Selected memakai indikator visual dan `aria-current`; jangan hanya mengubah warna. Link untuk tujuan, button untuk membuka launcher. Gunakan label Indonesia yang konsisten; Inbox dan Apps adalah nama yang dipilih PM.

Bottom nav menyisakan safe area dan ruang konten sebesar tinggi aktualnya + gap. Pada layar sangat sempit, label boleh membungkus rapi tanpa target tumpang tindih. Navbar tidak menghilang hanya karena scroll. Scanner full-screen menyembunyikan shell dan menyediakan Kembali yang jelas; saat keyboard terbuka, form boleh menyembunyikan navbar untuk memberi ruang input, sambil mempertahankan navigasi kembali. CTA form tidak ditumpuk di atas navbar secara sembarang. Pengaturan ini adalah spesifikasi presentasi; perubahan flow baru memerlukan PM.

Apps membuka launcher berupa grid ikon + label di sheet mobile/tablet, dengan scroll bila panjang, header dan tombol Tutup. Modul yang tersedia berasal dari capability pengguna; belum dibangun tidak dibuat seolah aktif. Item mengarah ke route modul. Fokus kembali ke pemicu saat ditutup; Back menutup lapisan sebelum meninggalkan layar. Launcher bukan ARIA menu desktop jika interaksinya grid link biasa.

Desktop: sidebar collapsible, preferensi tersimpan; utility bar berisi breadcrumb, konteks periode/pencarian sesuai fitur dan profil. Navigasi dan kemampuan tetap ekuivalen dengan mobile. Sidebar collapsed tetap punya accessible name dan tooltip; hover tidak dibutuhkan untuk mengaktifkan fitur.

## 2. Pemetaan layar existing ke target

Inventaris sumber diperiksa 26 November 2026; route bukan janji izin untuk semua pengguna. Detail access tetap berasal dari policy server/PRD.

| Route/surface saat ini | Letak target dan adaptasi |
| --- | --- |
| `/dashboard` | Beranda; ringkasan berizin, aksi cepat, jadwal; komposisi sesuai peran/data tersedia |
| `/broadcasts`, `/broadcasts/history` | Kandidat sumber Inbox; bedakan konsumsi pengumuman dari pengiriman/riwayat pengurus |
| `/profile`, `/attendance/history` | Profil; identitas dan riwayat pribadi, statistik hanya metrik yang sah |
| `/scan` | Tombol Scan QR, full-screen; hanya untuk actor yang eligible |
| `/events`, `/events/[eventId]` | Apps → jadwal/kegiatan; shortcut jadwal di Beranda |
| `/events/new`, `/events/[eventId]/edit` | Form sesuai capability; single column mobile, grouping desktop |
| `/events/points` | Rekap berizin; tabel desktop, ringkasan/kartu mobile; bukan statistik pribadi otomatis |
| `/committees`, `/committees/[committeeId]` | Apps → Kepanitiaan; daftar, detail dan anggota sesuai izin |
| `/admin/users`, `/admin/users/new` | Apps/sidebar → Kelola akun; admin saja |
| `/admin/periods` | Apps/sidebar → Periode; admin saja |
| Pelanggaran dan kebersihan kamar | Belum menjadi route aktif pada inventaris ini; ikuti PRD modul dan readiness |

**TBD sebelum implementasi bagian terkait:** Inbox belum boleh diasumsikan memiliki unread, read receipt, badge count atau agregasi baru; periksa API dan minta PM untuk semantik yang belum ditetapkan. Dashboard/personal statistics memerlukan pemetaan metrik/data lengkap. Istilah “anggota” tidak memperluas eligibility ke aktor baru. Tombol QR tidak boleh memberi hak absensi kepada SYSTEM_ADMIN; sembunyikan untuk yang tidak memiliki capability berdasarkan kebijakan existing.

## 3. Daftar, tabel, grafik dan pencarian

Mobile: kartu tersusun berisi identitas, status, data utama dan aksi berikutnya. Detail panjang di halaman, filter singkat di sheet. Default daftar panjang menggunakan **Muat lagi**; posisi, pencarian, filter, tab dan item yang telah dimuat dipulihkan saat kembali. Revalidate data; jangan menganggap cache lama sebagai fakta terkini. Parameter filter yang aman dapat ada di URL; informasi sensitif tidak dimasukkan ke URL.

Desktop: tabel dengan heading, sorting berlabel, filter sesuai kebutuhan dan pagination bila sesuai API. Jangan memotong nama/status tanpa cara mengakses nilai lengkap. Pilih beberapa item harus menjelaskan cakupan pilihan (halaman atau seluruh hasil); tidak mengarang bulk action.

Pengecualian horizontal scroll: matriks rekap/perbandingan antarkolom dapat menggunakan region tabel scroll berlabel, header jelas, indikator ada kolom lanjutan dan akses keyboard. Halaman keseluruhan tetap tidak overflow. Kandidat: rekap kehadiran/poin dengan banyak kolom event. Putuskan per layar dengan bukti tugas; kartu menjadi default, tidak memaksa semua tabel menjadi kartu bila kehilangan makna.

FE hanya boleh menghitung ringkasan presentasi yang telah didefinisikan dan diizinkan oleh kontrak modul, dengan dataset/cakupan lengkap dan tanpa mengubah BE. Ketentuan Dashboard P1-04 yang melarang formula FE tertentu (misalnya skor/kelengkapan penilaian) tetap mengikat. Catat formula, unit, periode, denominasi dan cakupan dataset. Data satu halaman tidak boleh dipresentasikan sebagai total organisasi. Jangan mendefinisikan skor/ranking baru atau mengubah pembulatan resmi. Jika dataset tidak lengkap, beri label cakupan atau jangan tampilkan agregat. Status tanpa data, belum dimuat dan nol adalah keadaan berbeda. Grafik memiliki judul, unit, legenda, label nonwarna dan alternatif tabel/ringkasan; tooltip dapat diakses keyboard/touch.

## 4. Form dan draf lokal

Simpan/kirim tetap eksplisit. Single column mobile; label terlihat, required dan bantuan jelas, inputmode/autocomplete tepat. Validasi lokal membantu, server tetap otoritatif. Fokus ke error pertama atau summary yang menautkan field; input lain tidak hilang.

Draf adalah salinan lokal **belum terkirim**, tersimpan lintas reload/tutup browser, bukan state React atau sessionStorage saja. Adapter localStorage/IndexedDB dipilih saat implementasi sesuai jenis data; scoped per akun + organisasi bila ada + form/resource + schemaVersion. Persist hanya allowlist field yang aman, setelah perubahan dengan debounce pendek; jangan bergantung pada event penutupan browser. Muat hanya setelah identitas terverifikasi. Restore menampilkan “Draf di perangkat ini dipulihkan. Belum dikirim.” dan waktu simpan terakhir. Dua tab tidak boleh diam-diam menimpa draf terbaru; beri pilihan pemulihan yang jelas.

Hapus draf setelah sukses server yang terkonfirmasi atau tindakan Hapus draf eksplisit. Tutup browser bukan alasan menghapus draf. Ketika data sumber/izin berubah, validasi ulang sebelum kirim. Jangan menyimpan password, token, QR payload, koordinat presisi atau rahasia di draf. Untuk data pribadi/sensitif modul pelanggaran/kebersihan, allowlist, masa retensi dan kebijakan logout **TBD dengan PM sebelum persistence fitur itu diaktifkan**. Akun lain tidak boleh melihat draf sebelumnya. Batas ukuran/storage gagal harus terlihat: “Draf belum tersimpan di perangkat ini. Jangan tutup halaman dulu.”

Browser dapat menghapus storage karena quota/eviction/private mode atau pengguna menghapus site data; draf tidak dijanjikan permanen atau lintas perangkat ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)). Tidak ada auto-submit setelah jaringan pulih. Coba lagi memakai data yang dipertahankan; cegah duplikasi dan verifikasi hasil jika respons sebelumnya tidak pasti.

Navigasi internal dengan perubahan belum dikirim menampilkan dialog/sheet aplikasi: lanjut mengisi atau tinggalkan, dengan penjelasan apakah draf sudah tersimpan. Untuk menutup tab/reload, browser membatasi custom dialog; `beforeunload` native hanya fallback teknis bila perlu dan didukung, bukan dialog produk utama. Persist proaktif tetap wajib. Jangan menjanjikan popup custom saat browser ditutup.

## 5. Feedback dan tindakan berisiko

| Jenis | Penggunaan | Aturan |
| --- | --- | --- |
| Inline validation | Salah input | Dekat field; teks, bukan hanya warna |
| Toast | Informasi singkat nonkritis | Tidak mengambil fokus; dapat dibaca pembaca layar |
| Snackbar beraksi | Urungkan/coba lagi | Aksi tetap terjangkau, cukup waktu; alternatif tetap tersedia bila konsekuensi penting |
| Banner | Status sistem berlangsung | Koneksi/data stale; hilang hanya saat status pulih |
| Hasil menetap | Absensi atau proses krusial | Menunggu server; jangan hanya toast |
| Bottom sheet / modal | Gangguan memblokir, konfirmasi | Mobile/tablet sheet, desktop modal; sesuai kontrak fokus |
| Badge | Notifikasi pasif | Count hanya dari data/semantik resmi; ada accessible label |

Tindakan berdampak rendah dan bisa dipulihkan: undo jika backend mendukung. Berdampak besar meski reversible: konfirmasi lingkup sebelum eksekusi, lalu undo jika tersedia. Tidak bisa dipulihkan: konfirmasi eksplisit dengan konsekuensi dan label aksi; tidak menampilkan undo palsu. Tombol default/fokus tidak otomatis pada aksi destruktif. Tombol konfirmasi tidak boleh hanya “OK”.

Gunakan overlay komponen aplikasi; bukan `window.alert/confirm/prompt`, bukan halaman tersendiri yang menyamar sebagai modal. Prompt izin kamera/lokasi dari OS/browser tetap diperlukan dan tidak dapat digantikan.

## 6. Scanner dan diagnosis absensi

**Arahan PM terbaru saat F3 (2026-11-26):** kamera otomatis dicoba saat masuk `/scan`, tetap tunduk izin OS/browser. Pilih gambar berada di pojok kanan atas; ikon scan di tengah dan teks petunjuk normal dihilangkan. Diagnosis hanya muncul setelah pemrosesan scan. Status pending serta pesan kegagalan dan pemulihan yang diperlukan tetap tersedia. Arahan ini menggantikan persiapan kamera manual atau petunjuk normal pada baseline/referensi sebelumnya.

Scanner memakai viewport full-screen (`100dvh` dengan safe area, bukan wajib Fullscreen API). Preview kamera dominan, tombol Kembali, petunjuk ringkas, status GPS/pengiriman, kontrol zoom dan akses bantuan tidak menutupi area baca QR. Navbar disembunyikan. Hentikan track kamera saat keluar, cleanup listener dan batalkan hasil async yang sudah tidak relevan.

Zoom: deteksi kemampuan video track, batas min/max/step lalu gunakan constraint yang didukung; sediakan tombol/slider berlabel serta nilai zoom. Jangan menampilkan kontrol yang tidak bekerja. Jika hardware/browser tidak mendukung, beri penjelasan singkat dan panduan mendekatkan kamera; digital crop hanya boleh disebut zoom digital dan area decoder harus konsisten. Jangan memblokir zoom halaman untuk meniru pinch kamera. Bukti dukungan harus diuji di perangkat nyata ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/MediaStreamTrack/getCapabilities)).

| State | Respons dan pemulihan |
| --- | --- |
| Persiapan | Jelaskan kebutuhan kamera/lokasi, belum meminta user menganggap absensi berhasil |
| Izin belum diberikan | Instruksi singkat sebelum prompt native |
| Kamera/lokasi ditolak | Cara membuka pengaturan izin dan Coba lagi; tidak mengulang prompt tanpa batas |
| Kamera tidak tersedia/terpakai | Pesan spesifik, coba lagi/kembali |
| GPS dicari/tidak akurat/timeout | Status nyata, langkah pemulihan sesuai kode dan kebijakan existing |
| QR terbaca | Tampilkan progres validasi; cegah submit paralel |
| QR invalid/kedaluwarsa | Pesan dan scan ulang; tidak mengubah aturan masa berlaku |
| Mengirim | Busy dan cegah duplikasi; hasil belum pasti |
| Jaringan gagal/hasil belum pasti | Coba lagi sesuai kontrak idempotensi/status server; tidak menampilkan sukses spekulatif |
| Di luar geofence | Hasil menetap, diagnosis dapat disalin dan Perbarui lokasi bila flow existing mengizinkan |
| Sudah absen/tidak eligible/event tutup | Ikuti kode/hasil server; jangan memberi cara melewati aturan |
| Berhasil terkonfirmasi | Hasil menetap + konteks yang tersedia; “Lihat diagnosis” berikon info, bukan warning palsu |

Diagnosis saat gagal mudah ditemukan dalam panel kegagalan, bukan tersembunyi setelah menutup error. Saat berhasil dapat dibuka melalui ikon info berlabel **Lihat diagnosis**. Tersedia Salin diagnosis, feedback “Diagnosis disalin”, dan teks dapat diseleksi sebagai fallback bila clipboard tidak tersedia. Diagnostik menjelaskan bukti, tidak memutuskan kehadiran. Radius/jarak server tidak diganti estimasi FE.

Format target contoh **sintetis** dari PM:

```text
Diagnosis lokasi RESORA
Waktu: 19/11/2026 19:06 WIB
Perangkat: iPhone / iOS
Browser: Safari
Kode: OUTSIDE_GEOFENCE
Permission: granted
Akurasi GPS: 11 m
Umur sampel: 198 ms
Durasi pengambilan: 3017 ms
Jarak server: 22 m
Radius event: 20 m
Selisih batas: +2 m
Percobaan: 3
ID diagnosis: LOC-EXAMPLE-001
Koordinat presisi: tidak disertakan.
```

Nilai tidak tersedia ditulis “Tidak tersedia”, bukan 0 atau angka contoh. Device/browser adalah informasi best effort, bukan fingerprint presisi; unknown dibolehkan. Permission tidak diasumsikan granted hanya karena API izin tidak tersedia. Selisih batas = jarak server − radius, hanya jika kedua angka berasal dari respons yang sama. Untuk kegagalan lokasi, proyeksi BE saat ini membulatkan jarak dan akurasi ke atas ke meter penuh, sedangkan radius dikirim apa adanya; FE menampilkan nilai yang dikirim. DTO sukses harus mendokumentasikan aturan pembulatan yang sama sebelum dipakai. Selisih batas dihitung dari nilai proyeksi yang ditampilkan dan tidak menentukan eligibility. Field “Percobaan” wajib pada format final, tetapi arti dan sumber counternya TBD sebelum ditampilkan. ID diagnosis wajib tersedia dalam teks salinan seperti contoh PM. Sumber kontrak/format ID (client opaque reference atau ID respons server) **TBD sebelum implementasi**; jangan mengarang bahwa ID dapat dicari/ditelusuri di server. ID tidak boleh mengandung identitas/QR. Arti dan satuan “Percobaan” (retry lokasi, scan QR atau submit check-in) juga **TBD** sebelum menampilkan counter; jangan menebak dari jumlah callback kamera.

Jangan menyalin koordinat, token, QR mentah, ID akun/event sensitif, raw user-agent atau exception bebas. Waktu memakai organisasi/WIB. Diagnosis hanya dibagikan lewat aksi pengguna; tidak otomatis mengirim telemetry.

Existing `features/attendance/check-in-diagnostics.ts` baru menyediakan kode, akurasi, umur sampel, durasi, jarak dan radius. Penambahan metadata, diagnosis sukses, ID dan zoom adalah pekerjaan implementasi berikutnya; availability tiap field wajib dipetakan sebelum membangun UI. Jika perubahan kontrak backend diperlukan, tangani melalui Architecture/PRD, bukan mengarang field.

## 7. Pengambilan data bertahap, cache lokal, dan optimistic UI

Tujuan: layar terasa cepat dibuka dan responsif tanpa membuat data cache tampak sebagai kebenaran terbaru. Gunakan cache untuk mempercepat presentasi; server tetap menjadi sumber otoritatif untuk sesi, permission, eligibility, transaksi, dan status proses.

Baseline implementasi yang diperiksa: aplikasi sudah memakai TanStack Query v5 untuk cache dalam memori, tetapi belum memasang persister cache query lintas reload. Aturan di bawah adalah target refactor, bukan klaim bahwa penyimpanan query lokal sudah berjalan. Draft formulir lokal yang sudah ditentukan di §4 adalah mekanisme terpisah.

### Prioritas baca

1. **Shell**: render kerangka route dan navigasi secepatnya. Data privat/capability tidak boleh ditampilkan sebelum sesi saat ini diverifikasi oleh server.
2. **Utama**: ambil data minimum yang diperlukan agar tujuan halaman dan aksi utama bisa dipakai. Query independen boleh paralel; hindari waterfall yang tidak dibutuhkan.
3. **Pendukung**: mulai ambil ringkasan atau detail sekunder setelah konten utama terlihat/siap, tanpa menahan interaksi utama. Gunakan prioritas browser/idle seperlunya; jangan menjadwalkan fetch tugas penting sedemikian rendah hingga tak pernah jalan.
4. **Sesuai kebutuhan**: detail berat, tab yang belum dibuka, grafik sekunder, serta halaman lanjutan dimuat saat diminta atau mendekati kebutuhan. Daftar panjang tetap mengikuti pagination API dan pola **Muat lagi**.

Jika cache akun yang sama dapat dipulihkan setelah sesi dikonfirmasi, tampilkan snapshot itu segera sambil melakukan revalidasi server di latar belakang. Tandai snapshot lama secara jelas, misalnya **“Data tersimpan · memperbarui…”**; bila offline gunakan **“Menampilkan data tersimpan. Belum diperbarui.”** Jangan tampilkan angka contoh, skeleton yang menggantikan nilai cache valid, atau indikator sukses sebelum server mengonfirmasi. Tanpa cache, gunakan placeholder yang mempertahankan ruang/layout agar tidak terjadi layout shift. Konten dari cache tidak menjanjikan data terkini/offline permanen; browser dapat menghapus storage.

### Kontrak cache

- Gunakan cache query TanStack Query yang sudah ada sebagai dasar state server di memori. Persistence ke IndexedDB atau adapter lain adalah tahap implementasi; jangan membuat cache global duplikat atau menyimpan seluruh respons tRPC secara membabi buta. Tentukan allowlist query per modul, serialisasi, ukuran, batas usia, versi/buster dan strategi eviction. Cache hasil query; bukan kredensial atau mutation queue. TanStack menyediakan mekanisme persistence resmi; pilih adapter saat implementasi dan catat jika menambah paket.
- Cache key harus mencakup semua parameter hasil, termasuk akun pengguna, organisasi/tenant bila berlaku, filter, periode, paging dan versi bentuk data. Jangan menghidrasikan query personal sebelum sesi aktif cocok. Saat logout, akun berganti, sesi tidak sah, atau akses dicabut, hapus cache privat akun yang terkait dan tampilkan route sesuai otoritas server.
- Revalidasi query penting saat masuk route/awal sesi, focus kembali, koneksi pulih, refresh eksplisit, dan setelah mutation yang memengaruhinya. Hindari refetch semua dataset tanpa kebutuhan; invalidasi query dependen secara terarah. Bila API tidak menyediakan ETag/revision, jangan mengasumsikan tidak ada perubahan dari cache saja—gunakan endpoint yang ada untuk revalidasi. Penambahan kontrak server memerlukan persetujuan pemilik modul/PM.
- Tidak ada TTL seragam untuk seluruh aplikasi. Pemilik modul menetapkan stale time/max age berdasarkan volatilitas, risiko keputusan, dan API; tampilkan waktu pembaruan/cakupan saat snapshot lama dapat mengubah keputusan user. Session, capability/permission, eligibility QR, hasil absensi, transaksi, dan data yang menentukan tindakan harus diverifikasi server sebelum tindakan; cache hanya boleh membantu tampilan awal bila aman.
- Persist hanya data yang diizinkan klasifikasinya. Jangan simpan token/password, reset credential, QR payload, koordinat presisi, diagnosis sensitif, respons export, atau data yang dilarang modul. Data pribadi/sensitif yang belum punya allowlist, retensi, penghapusan logout, dan batas akun tetap **TBD** serta tidak boleh dipersist sampai disetujui. Storage browser adalah best-effort; tangani quota/eviction tanpa memblokir aplikasi.
- Mutasi serta draf form memiliki lifecycle tersendiri; cache query tidak menggantikan kontrak draf lokal di §4 dan tidak melakukan auto-submit setelah reconnect.

### Optimistic UI

- Optimistic update boleh untuk aksi berisiko rendah, mudah dipulihkan, memiliki hasil lokal deterministik, dan kontrak backendnya sudah jelas. Sebelum mengubah cache, simpan snapshot untuk rollback; batalkan refetch yang dapat menimpa state sementara. Tampilkan state **“Menyimpan…”** atau penanda pending yang dapat dibaca teknologi bantu.
- Saat server sukses, ganti state sementara dengan respons server lalu invalidate query terkait. Saat gagal, rollback snapshot, pertahankan input/draf yang boleh disimpan, dan beri pesan dengan tindakan **Coba lagi** yang tidak menggandakan transaksi.
- Jangan optimistically mengumumkan berhasil untuk absensi/scan QR, perubahan permission, proses kritis atau tak dapat dipulihkan, operasi yang berdampak besar, validasi eligibility, atau data resmi. Tampilkan pending lalu hasil hanya setelah konfirmasi server. Jika hasil request tidak pasti, tampilkan status belum diketahui dan verifikasi status server sebelum retry; jangan mengasumsikan gagal atau sukses.
- Undo hanya ditawarkan bila backend dapat membatalkan operasi itu. Mutasi offline tidak masuk antrean kirim otomatis kecuali kontrak modul secara eksplisit mendukung idempotensi, resolusi konflik, dan persetujuan PM.

### Konflik dan batas domain

Cache presentasi tidak mengubah aturan PRD, perhitungan resmi, hak akses, format data, atau kontrak API. Perubahan server tidak boleh disimpulkan dari kebutuhan cache. Stale data tidak boleh diberi label “terbaru”; data hilang dari cache tidak sama dengan nilai nol. Bila update dari perangkat/tab lain datang, revalidasi dan tampilkan nilai server; jangan menimpa optimistic state yang masih pending tanpa resolusi yang terdokumentasi.

## 8. Keputusan terbuka yang tidak menghalangi fondasi
| Item | Penanganan |
| --- | --- |
| Font sekunder | TBD; gunakan primer/fallback |
| Paket/versi Iconsax | Verifikasi lisensi dan kompatibilitas; Lucide fallback disetujui |
| Top tasks pengurus | Belum ditentukan per jabatan/departemen; hanya capability resmi |
| Inbox read/unread dan badge | Pemetaan API dan semantik PM sebelum fitur baru |
| Statistik pribadi | Pemetaan metrik approved dan dataset lengkap |
| Draf sensitif, retensi/logout | PM memutuskan per modul sebelum persistence tersebut |
| Cache query data pribadi/sensitif | Allowlist, max age, logout/account-switch purge dan klasifikasi per modul sebelum persistence diaktifkan |
| Kebersihan kamar | Modul belum ada; jangan menciptakan scope |
| Batas versi browser/iOS | Profil perangkat disetujui; versi minimum support perlu baseline implementasi |
