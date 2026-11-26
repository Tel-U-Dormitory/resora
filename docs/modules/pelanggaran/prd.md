# PRD — Pencatatan dan Analitik Pelanggaran Maba

**Modul:** P1-03 Pelanggaran · **Epic:** RSA-7
**Baseline sumber diperiksa:** 25 November 2026 (WIB)
**Pemilik keputusan:** Fariza (PM), dengan Nafi untuk keputusan teknis
**Status dokumen:** Turunan keputusan PM pada spreadsheet; bukan bukti implementasi, ACC desain teknis, UAT, atau rilis. Detail bertanda TBD belum disetujui.

## 1. Sumber dan batas dokumen

- [Spreadsheet backlog PM](https://docs.google.com/spreadsheets/d/1qIdHqQZ2JpArt4z6eV3AEasj8RuWvy0c2Zxggqg0TVU/edit): `FR!A1:G28` untuk keputusan FR, `Backlog!A1:J18` untuk cakupan/acceptance criteria, dan `'Pembagian Tugas'!A1:F18` untuk kontribusi serta target kerja.
- [FR Modul Sistem](https://docs.google.com/spreadsheets/d/1oDqX5oEaxT7wscJVUJHIsRL_y6rlSXeiVOiDTx2hr2Y/edit#gid=102) adalah sumber FR Pelanggaran; tab [P1-04 Dashboard RESORA](https://docs.google.com/spreadsheets/d/1oDqX5oEaxT7wscJVUJHIsRL_y6rlSXeiVOiDTx2hr2Y/edit#gid=103) menentukan kontrak pemakaian ringkasan lintas modul. Keduanya dibaca saat dokumen ini disusun.
- [PRD sistem](../../prd.md), [Architecture](../../architecture.md), dan [ADR 0006](../../decisions/0006-modular-monolith.md) tetap berlaku untuk identitas, keamanan dan batas modul.
- [RSA-22](https://telkomdormitory.atlassian.net/browse/RSA-22), [RSA-23](https://telkomdormitory.atlassian.net/browse/RSA-23), [RSA-24](https://telkomdormitory.atlassian.net/browse/RSA-24), [RSA-25](https://telkomdormitory.atlassian.net/browse/RSA-25), dan [RSA-26](https://telkomdormitory.atlassian.net/browse/RSA-26) adalah referensi item backlog saja. Arahan terbaru PM: spreadsheet menjadi backlog/status kerja, koordinasi dan persetujuan melalui WA. Status Jira tidak menentukan status pelaksanaan atau persetujuan PM.

PRD menjelaskan perilaku dan batas persetujuan. Rencana fase, kontribusi tim, dan prompt Codex berada di [roadmap](roadmap.md). Bentuk tabel, endpoint, transaksi, dan desain storage final dicatat di Architecture/ADR yang relevan setelah review; tidak ditetapkan diam-diam oleh PRD ini. Nama folder ini tidak menetapkan NEED ID baru.

**Batas dengan Dashboard RESORA:** P1-04 adalah satu modul **frontend** untuk overview utama RESORA. Frontend itu mengonsumsi ringkasan dari API modul sumber dan menautkan pengguna ke modul tujuan. Ia tidak membuat backend dashboard agregator dan tidak menggantikan analitik detail di modul Pelanggaran. RSA-26 tetap membutuhkan statistik/tren Pelanggaran; API itu menjadi sumber ringkasan Pelanggaran untuk kartu P1-04. Integrasi frontend P1-04 bukan assignment backend Nafi di RSA-22–RSA-26.

## 2. Tujuan dan hasil yang diharapkan

SR aktif dapat mencatat pelanggaran penghuni secara manual, melihat catatan lintas gedung, mengoreksi atau menghapus catatan sendiri dengan alasan, dan membaca analitik berdasarkan laporan aktif. SUPERADMIN sah memiliki akses penuh lintas periode sesuai gate identitas existing.

Alur demo PM: **buat → daftar/detail → edit/hapus dengan alasan dan audit → dashboard/filter**. Tidak ada target numerik performa atau adopsi yang disetujui dalam sumber; jangan mengarang SLA atau KPI produk.

## 3. Cakupan dan traceability FR

Kolom Keputusan PM menjadi acuan, termasuk ketika kolom Status Sumber masih menyebut Proposed. Total: **20 Approved, 1 Pending, 6 Rejected**.

| FR-VIOL | Perilaku yang disetujui | Issue |
| --- | --- | --- |
| 001 | SR aktif membuat laporan pelanggaran penghuni | RSA-22 |
| 002 | Nama dan NIM diinput manual; tanpa direktori mahasiswa | RSA-22 |
| 003 | Nama, NIM, tanggal, keterangan, dan tepat satu foto KTM wajib | RSA-22 |
| 004 | Kesalahan validasi ditampilkan kepada pelapor | RSA-22 |
| 005 | Nomor laporan unik dan waktu pencatatan otomatis ditampilkan setelah sukses | RSA-22 |
| 010 | Riwayat berdasarkan mahasiswa, gedung pencatat, dan periode kejadian | RSA-23 |
| 011 | Daftar seluruh laporan sesuai akses | RSA-23 |
| 012 | Pencarian nama/NIM serta filter gedung dan tanggal | RSA-23 |
| 013 | Detail laporan dan informasi pencatat | RSA-23 |
| 014 | Pelapor mengedit miliknya dengan alasan; SUPERADMIN dapat mengedit semua | RSA-24 |
| 017 | Dashboard analitik pelanggaran | RSA-26 |
| 018 | Jumlah laporan per gedung SR pencatat pada periode tertentu | RSA-26 |
| 019 | Tren jumlah laporan menurut waktu dan gedung | RSA-26 |
| 021 | Filter dashboard berdasarkan periode, gedung dan tanggal | RSA-26 |
| 022 | Statistik lintas gedung dan akses detail; nama/NIM dapat dilihat SR aktif | RSA-23, RSA-26 |
| 023 | Statistik laporan aktif sesuai gedung dan rentang tanggal; hapus dikecualikan | RSA-26 |
| 024 | Modal konfirmasi gedung SR sebelum penyimpanan | RSA-22 |
| 025 | Hapus laporan sendiri dengan alasan dan konfirmasi; SUPERADMIN semua | RSA-25 |
| 026 | Informasi penghapusan memuat kode, nama penghapus, alasan dan waktu | RSA-25 |
| 027 | Riwayat koreksi/penghapusan sesuai peran; audit penuh untuk SUPERADMIN | RSA-24, RSA-25 |

**Di luar scope implementasi:**

- FR-VIOL-006 Pending: kategori resmi belum tersedia; [RSA-31](https://telkomdormitory.atlassian.net/browse/RSA-31) adalah keputusan backlog dan tidak memblokir P1. Jangan menambah field kategori, termasuk opsional, sebelum persetujuan baru.
- FR-VIOL-007/008/009 Rejected: status dan workflow verifikasi/validator beserta riwayat status. Audit koreksi yang disetujui FR-014/027 tetap wajib; penolakan FR-009 tidak menghapus kewajiban tersebut.
- FR-VIOL-015/016/020 Rejected: pembatalan laporan final oleh validator, validasi eligibility penghuni terhadap master, dan metrik menunggu verifikasi.
- Tidak ada master mahasiswa, sanksi/poin pelanggaran, notifikasi, ekspor, restore laporan terhapus, atau portal mahasiswa yang disetujui pada baseline ini.

## 4. Aktor dan akses

Semua pemeriksaan akses dilakukan server-side pada laporan maupun KTM. Reuse Identity, auth, eligibility/tenure dan gate password existing; jangan membuat login atau role baru. SUPERADMIN adalah privilege eksplisit, bukan jabatan/departemen. Dedicated SYSTEM_ADMIN tidak diberi assignment SR fiktif.

| Operasi | SR aktif pelapor | SR aktif lain, termasuk lintas gedung | SUPERADMIN sah |
| --- | --- | --- | --- |
| Buat laporan | Ya, dengan gedung assignment dan konfirmasi | Ya untuk laporan yang dibuat sendiri | Full access; cara menentukan gedung bagi SYSTEM_ADMIN tanpa assignment masih TBD |
| Daftar/detail laporan aktif dan KTM | Ya | Ya | Ya, lintas periode |
| Edit/hapus | Milik sendiri, alasan wajib | Ditolak | Semua laporan, alasan wajib |
| Riwayat koreksi | Laporan sendiri | Tidak ada persetujuan untuk audit penuh laporan SR lain | Audit penuh |
| Riwayat penghapusan | Tombstone saja; tanpa detail payload laporan | Tombstone saja; tanpa detail payload laporan | Detail laporan terhapus dan audit penuh |
| Dashboard/filter/detail terkait | Ya | Ya | Ya |

Akun tidak aktif, sesi tidak sah, atau akses yang gagal gate Identity ditolak. Akses penuh lintas periode bukan pembebasan dari gate aktif, privilege dan password existing. SR aktif dapat membaca histori lintas gedung tanpa batas umur data, tetapi hanya melihat tombstone laporan yang dihapus; SUPERADMIN dapat melihat detail terhapus dan audit penuh.

## 5. Alur dan aturan bisnis

### 5.1 Buat laporan — RSA-22

1. Server memeriksa identitas dan hak akses, lalu memperoleh gedung dari assignment SR pelapor; jangan mempercayai gedung kiriman klien sebagai authority.
2. Pelapor mengisi nama, NIM, tanggal kejadian, keterangan dan satu foto KTM. Identitas mahasiswa dimasukkan manual, bukan dicocokkan ke master penghuni.
3. Untuk SR, tampilkan modal **“Apakah pelanggar adalah penghuni Gedung X?”** dengan X dari assignment aktif SR. Untuk SYSTEM_ADMIN/SUPERADMIN tanpa assignment SR, pilih gedung aktif secara eksplisit sebelum konfirmasi. Ya melanjutkan penyimpanan; Tidak membatalkan tanpa record laporan. Penanganan upload yang sudah telanjur terjadi mengikuti lifecycle file yang direview.
4. Server memvalidasi input, konfirmasi dan foto yang benar-benar tersedia/valid. Assignment SR kosong atau ambigu ditolak; gedung tidak ditebak. Tanggal kejadian masa depan ditolak.
5. Penyimpanan sukses menghasilkan satu laporan dengan kode unik, aktor pencatat dan timestamp server. Retry/double submit tidak boleh membuat duplikat. Upload gagal atau KTM belum valid tidak menghasilkan laporan lengkap.

Gedung berarti **gedung pencatat yang dikonfirmasi**, bukan bukti terverifikasi gedung asal mahasiswa. Jangan menggunakan aturan NIM akun SR untuk NIM mahasiswa.

### 5.2 Daftar, pencarian dan detail — RSA-23

Semua SR aktif dapat melihat lintas gedung, termasuk nama/NIM, pencatat dan kode laporan. Pencarian/filter mencakup nama/NIM, gedung pencatat serta tanggal; hasil kosong ditampilkan dengan benar. Detail dan akses foto memerlukan otorisasi backend yang sama. Jangan menambahkan filter kategori atau status verifikasi.

### 5.3 Edit — RSA-24

Pelapor hanya mengedit miliknya; SUPERADMIN dapat mengedit semua sesuai gate existing. Alasan wajib. Nama, NIM, tanggal kejadian dan keterangan dapat diedit; KTM dapat diganti. Kode, aktor pencatat dan snapshot gedung tidak dapat diubah. Laporan terhapus tidak dapat diedit atau dipulihkan. Simpan aktor, waktu, alasan serta nilai sebelum/sesudah agar koreksi dapat ditelusuri. Koreksi dan audit tidak boleh terpisah sehingga salah satunya berhasil sendiri.

### 5.4 Hapus dan histori — RSA-25

Hapus memerlukan konfirmasi dan alasan serta pemeriksaan ownership/privilege di server. Gunakan soft delete agar data tetap dapat diaudit. SR aktif hanya dapat melihat riwayat/tombstone **“Laporan [kode] dihapus oleh [nama SR] karena [alasan]”** beserta waktu; mereka tidak dapat membuka detail payload laporan atau KTM terhapus. SUPERADMIN dapat melihat detail laporan terhapus, audit penuh, dan KTM melalui URL privat berjangka pendek. Laporan terhapus tidak dihitung statistik aktif dan tidak dapat dipulihkan. KTM di object storage dipertahankan setidaknya sampai periode kepengurusan SR baru dimulai. Kebijakan purge setelah perpindahan periode dan retensi objek upload yatim belum ditentukan; tidak ada purge otomatis sebelum kebijakan itu jelas.

`violations.history` menolak akses SR ke payload audit laporan terhapus, termasuk pelapornya, dengan `FORBIDDEN` / `VIOLATION_HISTORY_ACCESS_DENIED`. Tombstone tetap tersedia melalui list/detail; hanya SUPERADMIN sah yang dapat mengambil audit penuh laporan terhapus.

### 5.5 Analitik modul Pelanggaran — RSA-26

RSA-26 menyediakan **API statistik sumber**: jumlah laporan aktif dan tren/perbandingan gedung pencatat. Filter periode/gedung/tanggal harus konsisten dengan daftar. Hitungan adalah **jumlah laporan**, bukan jumlah mahasiswa unik atau tingkat pelanggaran terverifikasi. Koreksi/hapus harus tercermin pada hitungan. Definisi periode, acuan tanggal, batas rentang, zona waktu dan interval tren harus dikunci agar UI dan backend tidak menghitung dengan makna berbeda.

Hanya ada **satu modul frontend Dashboard RESORA** untuk overview, kartu ringkasan dan visual analitik. Frontend itu mengonsumsi API sumber tiap backend, termasuk API statistik Pelanggaran, lalu menautkan pengguna ke detail terkait. Modul backend Pelanggaran tidak memiliki dashboard UI tersendiri dan tidak membangun aggregator.

### 5.6 Kontrak statistik Pelanggaran untuk Dashboard RESORA

P1-04 adalah satu modul frontend Dashboard RESORA yang mengonsumsi API statistik sumber. Tidak ada dashboard UI per backend dan tidak ada backend aggregator. Setiap prosedur memeriksa sesi dan identitas live sendiri. Kontrak tRPC yang tersedia:

```ts
violations.statistics({ dateFrom: "YYYY-MM-DD", dateTo: "YYYY-MM-DD", buildingId? }) => {
  totalActive: number;
  byBuilding: Array<{ buildingId: string; buildingName: string; count: number }>;
  trend: Array<{ date: "YYYY-MM-DD"; buildingId: string; buildingName: string; count: number }>;
  appliedFilters: { dateFrom: string; dateTo: string; buildingId: string | null; dateField: "incidentDate"; bucket: "day"; dateSemantics: "calendar-date-inclusive" };
}
```

Tanggal inklusif diinterpretasikan sebagai tanggal kalender tanpa konversi zona waktu; tren harian dikelompokkan menurut tanggal kejadian dan gedung pencatat snapshot. Hanya laporan aktif yang dihitung. API list memakai `violations.list({ query?, buildingId?, dateFrom?, dateTo?, limit=20, offset=0 })`; detail memakai `violations.detail({ reportId })`. Delete menggunakan `violations.remove({ reportId, reason })`. Edit menggunakan `violations.update({ reportId, expectedVersion, reason, studentName?, studentNim?, incidentDate?, description?, uploadIntentId? })`; kirim hanya field yang berubah, minimal satu. Ganti KTM melalui upload intent privat dan unggahan baru. Respons list/detail menyertakan `version` terkini; klien mengirim nilai yang dibaca sebagai `expectedVersion` saat edit dan memuat ulang detail setelah konflik. Versi mencegah overwrite diam-diam; perubahan dan audit disimpan dalam satu transaksi. KTM lama tetap di object storage sesuai keputusan retensi. Untuk membuat laporan, klien meminta `violations.createUploadIntent({ contentType })`, mengunggah bytes ke URL privat, lalu memanggil `violations.create({ studentName, studentNim, incidentDate, description, uploadIntentId, idempotencyKey, confirmedBuildingId })`. SYSTEM_ADMIN/SUPERADMIN tanpa assignment SR memilih dari `violations.activeBuildings({}) => Array<{ id: string; code: string; name: string }>`; backend memvalidasi pilihan melalui public contract Identity dan menyimpan snapshot gedung di laporan Pelanggaran. Detail aktif mengembalikan KTM sebagai signed URL privat berumur 60 detik. Tanggal kejadian masa depan ditolak berdasarkan tanggal kalender `Asia/Jakarta`. Error tRPC memakai kode standar; pesan stabil Pelanggaran meliputi `VIOLATIONS_ACCESS_DENIED`, `VIOLATIONS_BUILDING_UNAVAILABLE`, `VIOLATION_NOT_FOUND`, `VIOLATION_KTM_INVALID`, `VIOLATION_UPLOAD_INTENT_INVALID`, `VIOLATION_IDEMPOTENCY_CONFLICT`, dan `VIOLATION_VERSION_CONFLICT`.

### Implementasi lokal — 25 November 2026

`packages/api/src/modules/violations` menyediakan pilihan gedung aktif admin, upload intent, create, list, detail, history, edit berversi, soft-delete, dan statistik. Kontrak tipe router tersedia melalui `AppRouter`; validasi input berada di `violations.contracts.ts`. Identity mengekspor kontrak server sempit `getActiveSrCandidate`, `getActiveBuilding`, dan `getActiveBuildings`; Pelanggaran tidak mengimpor tabel Identity secara langsung atau memuat seluruh direktori SR saat memproses satu laporan. Browser mengompresi gambar sebelum PUT langsung ke private R2; presigned URL menandatangani Content-Type dan `If-None-Match: *` untuk mencegah overwrite selama objek masih ada. Backend tetap memeriksa size, signature, format, dimensi/pixel dan decode penuh dengan Sharp; ia tidak mengompresi atau mengunggah ulang byte. Sesudah validasi, R2 melakukan copy internal ke key final. Batas foto JPEG/PNG/WebP dan 10 MiB. Frontend perlu mengizinkan `If-None-Match` pada R2 CORS. Text API dibatasi panjang/format, karakter kontrol ditolak, dan input object menolak field tak dikenal; UI harus tetap me-render teks sebagai text node. Database menyimpan metadata dan key, bukan URL signed permanen. Migrasi telah diterapkan ke Development DB, 0 pending, dan skema lolos verifikasi read-only; uji integrasi API+R2 end-to-end masih berjalan. Tidak ada aksi ke Production.

## 6. Data dan foto KTM

Konsep minimum: laporan (identitas manual, tanggal, keterangan, pencatat, gedung, kode, timestamp), referensi satu KTM tervalidasi, audit koreksi, dan metadata penghapusan. Ini kebutuhan data, bukan persetujuan bentuk tabel atau migrasi.

- Cloudflare R2 **private** adalah provider yang dipilih PM. PostgreSQL menyimpan object key dan metadata, bukan binary atau signed URL permanen. Credential hanya di server; lingkungan development/staging dan production diisolasi.
- Pelanggaran hanya memiliki tabel domain `violations_*`. Identitas SR, assignment/gedung, status aktif, dan kewenangan dibaca lewat public contract server-side milik Identity (misalnya `getLiveOperationalIdentity`, `getActiveSrCandidate`, `getActiveBuildings`); Pelanggaran tidak menduplikasi tabel referensi itu atau membaca implementasi/tabel privat Identity secara langsung. Simpan snapshot gedung pencatat pada laporan untuk menjaga histori.
- Browser mengompresi gambar secara lokal, lalu mengunggah langsung ke R2 private memakai presigned PUT; transfer file tidak melewati API server. URL mensyaratkan header bertanda tangan `If-None-Match: *` agar satu key hanya dapat dibuat sekali selama objek ada. Backend tetap memeriksa permission, intent/tujuan dan keterikatan ke laporan, lalu membaca serta mendekode gambar untuk validasi format/ukuran/isi aktual. Backend tidak mengompresi atau mengunggah ulang byte. Validasi klien tidak menggantikan validasi server.
- Pertahankan invariant satu KTM valid saat laporan dibuat, retry aman, serta cleanup orphan. Jangan mengarang TTL, kuota, periode retensi atau hak purge.
- Ikuti desain upload/validation/binding di Architecture setelah review skema dan kontrak. Status teknis file tidak menciptakan status approval laporan.
- Backup file terpisah dari DB dan pemulihan perlu rencana serta bukti uji. Jangan menyalin KTM/NIM asli, signed URL atau credential ke fixture, log, Git atau laporan tes.

## 7. Keputusan yang harus dikunci

### 7.1 Arahan PM terbaru — 25 November 2026

PM mendelegasikan solusi best practice untuk keputusan teknis yang tidak mengubah proses bisnis. Koordinasi melalui WA, backlog/status melalui spreadsheet, dan Jira hanya referensi item. Tidak perlu komentar Jira untuk memberlakukan arahan PM yang disampaikan user.

Keputusan teknis yang diterapkan: tabel domain `violations_*`, kode unik `PLG-` + 10 karakter Crockford Base32, snapshot gedung/nama SR, batas upload JPEG/PNG/WebP 10 MiB, kompresi klien memakai `createImageBitmap` + canvas browser (orientasi dari metadata, maksimum 1600x1600, JPEG quality 0.82), lalu pemeriksaan signature, format, ukuran, resolusi dan decode penuh oleh backend memakai Sharp. Backend tidak mengompresi atau mengunggah ulang byte; setelah validasi, R2 menyalin objek secara internal ke key final yang tidak pernah diberikan ke browser. Presigned PUT 300 detik mensyaratkan `If-None-Match: *`; browser CORS harus mengizinkan header ini. Tidak ditemukan library kompresi gambar React yang sudah terpasang, jadi tidak perlu dependency baru. Presigned download berlaku 60 detik; create tetap idempotent dan audit atomik. Lihat [Architecture](../../architecture.md).

**Status lokal:** fondasi schema, API create/read/history/edit/delete/statistics dan kontrak tersedia pada source; migrasi telah diterapkan dan diverifikasi pada Development DB (0 pending; tabel/RLS/trigger/constraints tersedia; tabel kosong). Validasi input dan foto backend tersedia. Alur FE kompresi dan unggah langsung masih handoff ke developer frontend.

**Keputusan PM terbaru:** D02—assignment SR kosong/ambigu ditolak; admin tanpa assignment boleh memilih gedung aktif. D03—tanggal kejadian masa depan ditolak. D05—soft delete mempertahankan data untuk audit; SR aktif hanya melihat riwayat/tombstone, SUPERADMIN dapat melihat detail terhapus dan audit; KTM R2 disimpan setidaknya sampai periode kepengurusan SR baru dimulai. D07—SR aktif dapat melihat seluruh histori lintas gedung tanpa batas umur. D08—SR pelapor boleh mengedit nama, NIM, tanggal, keterangan dan mengganti KTM; record terhapus tidak dapat diedit/dipulihkan. D09—Nafi adalah reviewer, pemberi go/no-go, serta penentu lingkungan dan data UAT. Retensi data audit/PII selain KTM, purge setelah periode SR baru, dan cleanup file yatim masih perlu kebijakan sebelum penghapusan fisik otomatis. Statistik memakai tanggal kejadian inklusif per hari sebagai pilihan teknis.

Koneksi Development DB melalui konfigurasi khusus Development lolos `SELECT 1`; tiga migrasi telah diterapkan dan pemeriksaan read-only sesudahnya menunjukkan 0 pending. Uji R2 Development mencakup signed PUT, metadata, baca object, signed GET, penolakan replay HTTP 412 dan cleanup objek sintetis. Pemeriksaan konfigurasi CORS read-only ditolak `AccessDenied` oleh kredensial storage-scoped; karena itu belum terkonfirmasi apakah header `If-None-Match` diizinkan dari origin web. Pemilik/admin bucket perlu memastikan allowlist header ini sebelum browser UAT. Tidak ada aksi ke Production.

### 7.2 Paket usulan terdahulu — baca bersama arahan terbaru

Bagian teknis pada tabel/paket berikut telah digantikan oleh §7.1 dan Architecture. Bagian proses bisnis tetap **TBD**; angka/aturan usulan bukan otomatis Approved. Tidak diperlukan ACC PM tambahan untuk keputusan teknis non-bisnis dalam delegasi tersebut.

| ID | Keputusan yang diperlukan | Bagian yang bergantung |
| --- | --- | --- |
| D01 | Skema laporan/audit/file, kontrak minimum dan rencana migrasi | Coding skema dan API terkait; penerapan DB remote perlu izin terpisah |
| D02 | Respons/pemulihan assignment kosong/ambigu; create oleh SYSTEM_ADMIN tanpa gedung | Konteks create dan konfirmasi gedung; jangan menebak atau mencabut full access secara permanen |
| D03 | Format kode, batas nama/NIM/keterangan/alasan, validasi tanggal | Validasi input dan identitas laporan |
| D04 | Snapshot gedung/pencatat historis dan efek perubahan assignment | Histori, audit dan agregasi lintas waktu |
| D05 | Retensi PII/KTM/audit, akses payload/KTM terhapus, cleanup orphan dan purge authority | Read terhapus, penggantian file, cleanup/penghapusan fisik |
| D06 | Format/ukuran foto, pemeriksaan isi, TTL/kuota dan kebijakan proses gambar | Upload/KTM dan uji R2 |
| D07 | Definisi periode, cakupan periode SR biasa, acuan tanggal/zona waktu, inklusivitas dan granularitas tren | Daftar/filter/dashboard/drilldown |
| D08 | Field editable, penggantian KTM, edit record terhapus dan hasil retry/konflik edit–hapus | Edit/audit/lifecycle file; strategi concurrency adalah desain teknis untuk direview |
| D09 | Lingkungan UAT, data sintetis, backup/rollback, reviewer dan persetujuan konfigurasi/release | Uji live, staging, production; perubahan eksternal harus diotorisasi |

### Paket keputusan awal — konteks historis

Tabel ini adalah paket usulan sebelum jawaban PM terbaru. D02, D03, D05, D07, D08, dan D09 telah diperbarui menurut §7.1; bila isi tabel historis berbeda, keputusan terbaru pada §7.1 yang berlaku.

| ID | Usulan keputusan yang diminta | Alasan dan dampak |
| --- | --- | --- |
| D01 — model data/API minimum | Domain `violations` memiliki `violations_reports` (UUID internal, kode publik unik, nama/NIM manual, tanggal kejadian, keterangan, user pelapor, gedung pencatat, metadata satu KTM, timestamp, soft-delete metadata) dan `violations_audits` append-only (laporan, aktor, aksi, alasan, perubahan sebelum/sesudah, waktu). Mutasi laporan dan audit berada dalam satu transaksi. Object key/metadata disimpan di PostgreSQL; binary dan signed URL tidak. Migrasi additive dan dimiliki domain Pelanggaran; tidak diterapkan ke DB remote oleh keputusan ini. | Mendukung FR-003/005/014/025–027, audit atomik, satu KTM wajib, dan batas pemilik data. Nama tabel/kolom final tetap disesuaikan dengan konvensi Drizzle sesudah review teknis. |
| D02 — assignment gedung | SR aktif hanya membuat laporan bila Identity memberi tepat satu gedung aktif; gedung berasal dari server dan modal konfirmasi tetap wajib. Assignment kosong/ambigu ditolak tanpa record. SYSTEM_ADMIN/SUPERADMIN tanpa assignment harus memilih gedung aktif secara eksplisit dari pilihan server sebelum konfirmasi; simpan aktor admin sebenarnya, jangan membuat assignment SR palsu. Jika PM tidak ingin admin memilih gedung, alternatifnya admin tidak dapat membuat laporan tanpa assignment yang sah. | Menjaga arti “gedung SR pencatat” dan tidak menebak gedung. PM perlu memilih apakah opsi pemilihan gedung untuk admin diterima; akses penuh untuk baca/edit/hapus tidak otomatis menentukan gedung saat create. |
| D03 — kode dan batas input | Kode publik server-generated `PLG-` + 10 karakter Crockford Base32 acak; unik di DB dan retry bila konflik. Usulan batas setelah trim: nama 150 karakter, NIM 64 karakter tanpa regex/normalisasi kehilangan nol awal, keterangan 5.000 karakter, alasan edit/hapus 1.000 karakter. Tanggal kejadian memakai `YYYY-MM-DD` yang valid; usulan menolak tanggal masa depan. | Kode tidak membocorkan urutan/volume laporan dan tidak memuat PII. Batas memberi proteksi input yang jelas; aturan tanggal masa depan adalah keputusan produk, sehingga perlu ACC atau penggantian nilai sebelum validator dibuat. |
| D04 — snapshot historis | Saat create, simpan `reporterUserId` dan snapshot `recordedBuildingId`/nama gedung dari assignment yang dikonfirmasi. Assignment yang berubah kemudian tidak mengubah atribusi laporan atau statistik lama; query tren memakai snapshot gedung ini. | Membuat laporan historis konsisten dengan gedung pencatat ketika laporan dibuat dan mencegah statistik bergeser setelah perpindahan SR. |
| D05 — deleted, retensi, dan orphan | Soft-deleted tetap menyimpan record dan audit serta dikecualikan dari statistik. Semua SR aktif melihat tombstone yang disetujui FR-026; SUPERADMIN melihat audit penuh. Usulan: KTM tidak dapat diunduh setelah soft delete oleh role mana pun. Tidak ada restore atau purge otomatis. PM menetapkan masa retensi numerik untuk PII, KTM, audit, dan object upload yatim; sebelum nilai itu disepakati, tidak ada purge permanen. | Memisahkan jejak penghapusan yang perlu tampil dari akses payload sensitif dan mencegah penghapusan irreversibel tanpa kebijakan retensi. Nilai masa retensi dan akses KTM setelah hapus masih perlu dipilih PM. |
| D06 — file KTM | Usulan format JPEG/PNG saja, maksimum 10 MiB per file. Server memeriksa ukuran, signature bytes dan keberhasilan decode gambar; MIME/ekstensi klien saja ditolak sebagai bukti. Pertahankan URL upload R2 300 detik dan URL download 60 detik yang saat ini menjadi default adapter, kecuali PM meminta TTL lain. Tambahkan inspeksi bytes server-side karena adapter sekarang hanya menyediakan HEAD metadata. | Memenuhi foto wajib/private dan mencegah file palsu/berlebih. Limit format/ukuran adalah pilihan produk-operasional yang perlu ACC. TTL di adapter adalah default teknis saat ini, bukan batas produk yang telah disetujui. |
| D07 — statistik/periode/akses | Tanggal statistik adalah `incidentDate`; `periodStart` dan `periodEnd` wajib berupa tanggal kalender inklusif `YYYY-MM-DD` di zona `Asia/Jakarta`. Gedung agregasi mengikuti snapshot D04. Usulan bucket tren otomatis: harian untuk rentang ≤31 hari, mingguan untuk 32–366 hari, bulanan untuk >366 hari. Semua SR aktif dapat mencari riwayat lintas gedung tanpa pembatasan periode tambahan; list tetap berpaginasi. Usulan rentang awal Dashboard Pelanggaran: 30 hari terakhir. Dashboard utama menerima ringkasan berizin dari API ini dan membuka Pelanggaran dengan filter yang sama. | Menghasilkan hitungan yang konsisten antara statistik dan drilldown serta tidak menambahkan cutoff akses yang tidak tercantum di FR. Granularitas bucket, rentang awal, dan akses rentang historis perlu ACC karena mengubah tampilan/perilaku pengguna. |
| D08 — edit dan konflik konkuren | SR pelapor dapat mengedit nama, NIM, tanggal kejadian, dan keterangan; kode, pencatat, waktu pencatatan, dan snapshot gedung tidak dapat diubah. Penggantian KTM diperbolehkan dengan validasi RSA-22 dan hanya satu KTM aktif; file lama tetap privat dan mengikuti retensi D05. Record terhapus tidak dapat diedit atau dipulihkan. Setiap perubahan data/file + alasan + audit terjadi atomik. Update menyertakan versi yang dibaca; versi stale ditolak sebagai konflik tanpa menimpa perubahan lain atau menambah audit, lalu klien memuat ulang sebelum mencoba lagi. | Memastikan koreksi tidak mengubah identitas historis, tidak memulihkan laporan yang dihapus tanpa fitur restore, dan mencegah lost update. Penggantian KTM bergantung pada retensi D05; model concurrency final mengikuti pola repository. |
| D09 — UAT, backup dan rollback | Jalankan UAT hanya di staging yang disetujui, memakai akun dan data mahasiswa sintetis serta KTM dummy; reviewer Fariza (PM) dan Imba (QA), Nafi menyiapkan bukti backend. Sebelum migrasi staging, buat backup PostgreSQL dan bukti restore yang berhasil; backup/restore objek R2 diuji terpisah tanpa data nyata. Rilis memakai migrasi additive dan kompatibel; rollback aplikasi boleh dilakukan tanpa drop tabel/kolom atau menghapus data baru. Perubahan schema remote, konfigurasi/credential R2, staging dan deployment tetap memerlukan otorisasi eksplisit per lingkungan. | Menjaga UAT aman dan membuat pemulihan dapat diverifikasi. Persetujuan rencana tidak sama dengan izin untuk mengubah database, secret store, storage, atau deploy. |

Persetujuan desain/migrasi pada D01 tidak memberi izin menerapkan migrasi ke database remote, mengisi credential R2, mengubah layanan eksternal, atau deploy. D09 menentukan rekomendasi kontrolnya; setiap tindakan eksternal tetap menunggu otorisasi tindakan/lingkungan secara eksplisit.

TBD hanya menahan pekerjaan yang bergantung padanya. Inspeksi, rancangan, kontrak usulan, fixture sintetis dan tes kebijakan yang sudah jelas tetap dapat dikerjakan. Keputusan minimum tidak boleh ditunda dengan alasan BA/SA as-built menyusul.

## 8. Acceptance criteria dan bukti minimum

| ID | Skenario yang harus dibuktikan | FR / issue |
| --- | --- | --- |
| AC01 | SR aktif create dengan seluruh input valid + satu KTM + konfirmasi Ya menghasilkan satu kode unik dan timestamp; retry paralel tidak ganda | 001–005, 024 / RSA-22 |
| AC02 | Field wajib hilang, KTM invalid/gagal, konfirmasi Tidak atau gedung tak dapat ditentukan tidak menghasilkan laporan lengkap; pesan validasi benar | 003–004, 024 / RSA-22 |
| AC03 | SR aktif gedung lain dapat list/detail/KTM; pencarian nama/NIM, gabungan filter dan hasil kosong benar | 010–013, 022 / RSA-23 |
| AC04 | Sesi tidak sah/inactive/revoked ditolak pada API data dan file; tebakan ID/key atau lampiran milik intent lain tidak membuka akses | 003, 011, 013 / RSA-22–23 |
| AC05 | Pelapor edit miliknya dengan alasan; SR lain ditolak; SUPERADMIN sah lintas periode berhasil; before/after/aktor/waktu/alasan tersimpan bersama mutasi | 014, 027 / RSA-24 |
| AC06 | Hapus memerlukan konfirmasi/alasan; owner/admin saja; jejak penghapusan terlihat SR aktif; audit tetap utuh | 025–027 / RSA-25 |
| AC07 | Akses audit membedakan pelapor, SR lain dan SUPERADMIN; tidak membocorkan audit penuh melalui list/detail | 014, 026–027 / RSA-24–25 |
| AC08 | Dashboard/tren/perbandingan gedung sesuai fixture; deleted dikecualikan; klik statistik dan daftar konsisten untuk filter sama | 017–019, 021–023 / RSA-26 |
| AC09 | Kegagalan transaksi tidak meninggalkan koreksi/hapus tanpa audit; retry dan edit–hapus bersamaan mengikuti kontrak yang telah disetujui | RSA-22, RSA-24–26 |
| AC10 | Tidak ada kategori, workflow/status verifikasi, validator atau validasi master mahasiswa yang tersisip | Seluruh scope |

CLI unit/integration, typecheck, lint dan build sesuai perubahan adalah bukti engineering. Tes integrasi menggunakan database lokal terisolasi dan data sintetis; tes offline memakai fake storage. Uji live DB/R2, staging, browser/manual UAT dan release memiliki izin/bukti terpisah. Tes yang dilewati atau gate belum terpenuhi dilaporkan, bukan dihitung lulus.

## 9. Target penerimaan

Target PM adalah **Jumat, 27 November 2026, development/staging siap UAT**, bukan komitmen rilis production atau bukti semua fase selesai. Penerimaan membutuhkan alur demo di atas, hasil tes akses/audit/statistik, PR yang direview, hasil build, daftar bug dan keputusan go/no-go PM. Staging/deployment dan migrasi remote tidak diotorisasi oleh target tanggal. Tidak ada pengurangan KTM wajib, audit atau akses server demi mengejar jadwal.
