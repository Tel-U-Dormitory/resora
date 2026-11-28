# PRD — Modul Manajemen Dorm Team (DT)

**Modul:** P2-04 Manajemen DT  
**Baseline sumber diperiksa:** 28 November 2026 (WIB)  
**Pengelola utama yang ditetapkan:** Departemen **Adaptif** (`ADAPTIF`) dan `SUPERADMIN` sah  
**Aktor baru yang ditetapkan:** `DT` (Dorm Team — pembantu bawahan Senior Resident)  
**Status dokumen:** PRD modul untuk MVP Manajemen DT berdasarkan tab `P2-04 Manajemen DT` pada spreadsheet *FR Modul Sistem* serta arahan implementasi MVP (Pengelola = Departemen Adaptif, Role = `DT`); bukan bukti UAT atau rilis produksi. Item bertanda **TBD** atau bergantung pada modul **PX** diisolasi dari implementasi MVP.

---

## 1. Sumber dan batas dokumen

- [FR Modul Sistem — Tab P2-04 Manajemen DT](https://docs.google.com/spreadsheets/d/1oDqX5oEaxT7wscJVUJHIsRL_y6rlSXeiVOiDTx2hr2Y/edit#gid=204): `A1:G23` (`FR-DT-001` s.d. `FR-DT-022`).
- [PRD sistem](../../prd.md), [Technical Architecture](../../architecture.md), [Data Ownership](../../module-data-ownership.md), [ADR 0006](../../decisions/0006-modular-monolith.md), dan [Design System RESORA v1.1](../../design-system.md) berlaku penuh untuk autentikasi, otorisasi server-side, isolasi kepemilikan tabel domain, dan standar UI/UX.
- Referensi arahan pengguna (28 November 2026):
  1. Pengelola DT adalah **Departemen Adaptif** (`departmentCode = 'ADAPTIF'`).
  2. Dibuat **role `DT`** sebagai aktor pembantu bawahan SR (`actor = 'DT'`).
  3. Diimplementasikan sebagai **MVP** terlebih dahulu berdasarkan FR yang ada, mengikuti pola UI frontend dan dokumentasi RESORA yang berlaku.

PRD ini menetapkan aturan bisnis MVP, matriks hak akses, batasan integrasi dengan modul `identity`, `committee`, `events`, dan `attendance`, serta daftar item `TBD`/dependensi masa depan yang tidak boleh dikarang diam-diam.

---

## 2. Tujuan dan hasil yang diharapkan

Modul Manajemen Dorm Team (`dt`) menyediakan pengelolaan terstruktur bagi anggota Dorm Team (mahasiswa pembantu bawahan Senior Resident) oleh Departemen Adaptif tanpa mencampuradukkan peran `DT` dengan `SR`:

1. **Identitas & Role `DT` Terpisah dari `SR` (`FR-DT-002`, `008`, `018`, `019`):**
   - `DT` memiliki nilai aktor tersendiri (`actor = 'DT'`) pada sistem Identity RESORA, tanpa baris `sr_profiles` dan tanpa hak struktural `SR`.
   - Satu akun pengguna hanya memiliki satu identitas login (`username` = NIM, password awal sekali tampil) yang terhubung dengan riwayat keanggotaan/periode DT.
   - Login dan sesi aktif `DT` otomatis sah hanya selama akun aktif **dan** memiliki keanggotaan DT berstatus `ACTIVE` dalam rentang tanggal kepengurusan (`startsOn <= today <= endsOn`, zona waktu `Asia/Jakarta`).
   - Saat masa keanggotaan berakhir atau diakhiri/diarsipkan oleh Adaptif, akses login dan sesi aktif `DT` dicabut secara otomatis di server tanpa menghapus data historis.
2. **Siklus Hidup Rekrutmen, Periode & Penugasan DT (`FR-DT-001`–`007`, `020`–`022`):**
   - Departemen Adaptif mendaftarkan mahasiswa sebagai calon DT (`CANDIDATE`), meninjau dan menetapkan keputusan (`ACTIVE` dengan tanggal mulai/berakhir, atau `REJECTED` dengan alasan), memperpanjang atau mengakhiri periode berjalan, mengarsipkan riwayat tidak aktif (`ARCHIVED`), serta mengelola perubahan penugasan berbasis **gedung** dan **program kerja** (DT tidak memiliki departemen) dengan jejak audit append-only.
   - `SUPERADMIN` memiliki akses penuh atas fitur pengelolaan keanggotaan DT (`/dt`) dan dapat mengelola akun SR maupun akun DT secara terpisah di halaman `/admin/users` melalui tab **Akun SR** dan **Akun DT** (edit profil/gedung, arsip/nonaktif, dan reset password).
3. **Integrasi Terbatas ke Kepanitiaan & Absensi Kegiatan (`FR-DT-009`–`014`):**
   - Pengelola kepanitiaan berwenang (HCO/SUPERADMIN) dapat menambahkan anggota `DT` aktif ke kepanitiaan event (`committee_members`) menggunakan modul Committee existing.
   - Event internal yang secara eksplisit mengizinkan partisipasi DT (melalui kepanitiaan yang memuat DT atau kriteria peserta DT eksplisit) mengundang `DT` aktif tersebut ke `event_participants`.
   - `DT` aktif dapat mengakses daftar kegiatan yang mengundangnya, melakukan check-in QR + geofence melalui modul Attendance existing, dan melihat riwayat kehadirannya sendiri tanpa mengakses event internal khusus SR yang tidak mengundangnya.
   - Departemen Adaptif dapat melihat rekap kehadiran serta partisipasi kepanitiaan anggota DT (jumlah kegiatan diundang, hadir, pending, tidak hadir, serta daftar kepanitiaan) tanpa memunculkan skor poin partisipasi fiktif.

---

## 3. Cakupan dan traceability FR (`FR-DT-001`–`FR-DT-022`)

Seluruh 22 FR pada tab `P2-04 Manajemen DT` dipetakan ke cakupan **MVP** atau **Ditunda / Dependensi Eksternal**:

| FR ID | Kemampuan Pengguna (Sumber Sheet) | Cakupan MVP | Perilaku & Batasan MVP | Status / Catatan Dependensi |
| --- | --- | --- | --- | --- |
| `FR-DT-001` | Lihat daftar anggota DT beserta status dan periode kepengurusan | **Ya (MVP)** | Daftar DT dengan status efektif (`CANDIDATE`, `ACTIVE`, `EXPIRED`, `ENDED`, `REJECTED`, `ARCHIVED`), label periode, rentang tanggal, dan penugasan terkini | Pengelola: `ADAPTIF` + `SUPERADMIN` |
| `FR-DT-002` | Daftarkan mahasiswa sebagai calon anggota DT | **Ya (MVP)** | Input manual nama, NIM, email, gedung tugas wajib, program kerja opsional, dan catatan pendaftaran | Tidak memvalidasi ke direktori mahasiswa atau status penghuni aktif (`TBD`) |
| `FR-DT-003` | Tinjau dan tetapkan status keanggotaan DT | **Ya (MVP)** | Review `CANDIDATE` → setujui/aktifkan (`ACTIVE`) atau tolak (`REJECTED` dengan alasan wajib) | Alur rekrutmen sederhana 1-tahap oleh `ADAPTIF` |
| `FR-DT-004` | Tetapkan tanggal mulai dan berakhirnya keanggotaan DT | **Ya (MVP)** | Wajib `startsOn <= endsOn` (kalender `Asia/Jakarta`) saat aktivasi atau pembaruan periode | Validasi di server |
| `FR-DT-005` | Perpanjang atau akhiri periode keanggotaan DT | **Ya (MVP)** | Perpanjang `endsOn` (termasuk perpanjangan/periode baru bagi mantan DT) atau akhiri dini (`ENDED`) dengan alasan wajib; riwayat tetap utuh | Tidak ada hard delete |
| `FR-DT-006` | Tetapkan keterikatan DT berdasarkan gedung dan program kerja | **Ya (MVP)** | DT tidak memiliki departemen; penugasan utama berbasis `buildingId` wajib (dari gedung aktif) dan `workProgram` (teks program kerja) opsional | Kolom historis `department_code` tetap `NULL` |
| `FR-DT-007` | Lihat riwayat periode dan penugasan DT | **Ya (MVP)** | Panel riwayat periode keanggotaan & perubahan penugasan pada detail DT (untuk `ADAPTIF`) dan pada profil/workspace DT sendiri (`DT`) | Data histori dibaca read-only dari log/tabel riwayat |
| `FR-DT-008` | Login ke RESORA menggunakan akun DT yang sudah diaktifkan | **Ya (MVP)** | Login NIM/password melalui Better Auth existing untuk `actor = 'DT'` dengan status `ACTIVE` dan periode berjalan | Aktivasi menghasilkan password sementara sekali lihat; `passwordResetRequired` tetap memaksa ganti password |
| `FR-DT-009` | Akses fitur absensi yang diperbolehkan untuk DT | **Ya (MVP)** | `DT` aktif dapat membuka `/events`, `/scan`, dan `/attendance/history` hanya untuk kegiatan yang mengundang dirinya | Event khusus SR yang tidak mengundang `DT` tetap tersembunyi/ditolak |
| `FR-DT-010` | Lakukan absensi pada kegiatan yang mengizinkan partisipasi DT | **Ya (MVP)** | Reuse `attendance.checkIn` existing (QR + geofence + timing) dengan validasi `actor = 'DT'` aktif dan tercantum di `event_participants` | Event hanya mengundang `DT` jika berada dalam kepanitiaan event terkait atau kriteria DT eksplisit |
| `FR-DT-011` | Lihat riwayat kehadiran kegiatan DT sendiri | **Ya (MVP)** | Reuse `attendance.ownHistory` untuk `actor = 'DT'` (hanya kegiatan sendiri, berpaginasi) | `ADAPTIF` melihat rekap lewat `FR-DT-012` |
| `FR-DT-012` | Lihat rekap kehadiran dan partisipasi anggota DT | **Ya (MVP)** | Rekap per anggota DT: jumlah diundang, hadir (`EARLY`/`ON_TIME`/`LATE`), pending, absen, dan daftar kepanitiaan | **Tanpa skor poin partisipasi** (belum disepakati) |
| `FR-DT-013` | Tambahkan anggota DT ke kepanitiaan event | **Ya (MVP)** | Reuse modul `committee`: `committee.candidates` menampilkan kandidat `SR` dan `DT` aktif (dengan penanda peran `SR`/`DT`); `committee_members` mendukung `DT` | Jabatan panitia tidak memberi hak akses sistem tambahan |
| `FR-DT-014` | Lihat event dan kepanitiaan yang diikuti DT | **Ya (MVP)** | Tampil pada halaman detail DT (`ADAPTIF`) dan workspace/portal DT (`/dt`) untuk diri sendiri | Hanya event `PUBLISHED`/`CLOSED` yang mengundang DT dan kepanitiaan tempat DT terdaftar |
| `FR-DT-015` | Akses modul berita acara harian sesuai hak akses DT | **Di luar MVP (Dependensi PX)** | Tidak dibuat menu/form berita acara fiktif | Menunggu persetujuan & pembangunan modul `PX-03 Berita Acara SR Harian` |
| `FR-DT-016` | Buat atau ikut mengelola catatan harian hanya jika diberi kewenangan | **Di luar MVP (Dependensi PX)** | Ditunda hingga `PX-03` disahkan | Menunggu keputusan kewenangan draft vs submit penuh |
| `FR-DT-017` | Kirim aspirasi anonim melalui fitur yang diperuntukkan bagi DT | **Di luar MVP (Dependensi PX)** | Tidak dibuat form aspirasi fiktif | Menunggu modul `PX-02 Aspirasi Anonim` |
| `FR-DT-018` | Lihat status aktif atau berakhirnya keanggotaan DT sendiri | **Ya (MVP)** | `DT` aktif melihat status keanggotaan aktif, masa berlaku, penugasan, dan riwayat periode terdahulu di `/dt` & `/profile`. Jika seluruh keanggotaan berakhir, layar login menampilkan pesan khusus bahwa masa keanggotaan DT telah berakhir | Mantan DT tanpa keanggotaan aktif tidak diberi sesi login |
| `FR-DT-019` | Cabut akses khusus DT saat masa keanggotaannya berakhir | **Ya (MVP)** | Otomatis di server (`getActiveIdentity` mengecek `status = 'ACTIVE'` & tanggal `startsOn..endsOn` WIB) + pencabutan sesi segera saat Adaptif mengakhiri/mengarsipkan keanggotaan | Revalidasi setiap request dan sesi |
| `FR-DT-020` | Arsipkan riwayat DT yang sudah tidak aktif tanpa menghapus data historis | **Ya (MVP)** | Pengelola DT dapat mengarsipkan (`ARCHIVED`) keanggotaan berstatus `ENDED` atau melewati `endsOn`; data histori absensi, kepanitiaan, penugasan, dan audit tetap tersimpan | Tidak ada penghapusan fisik |
| `FR-DT-021` | Cari/filter daftar DT menurut periode, gedung, dan status | **Ya (MVP)** | Pencarian nama/NIM serta filter periode/label, gedung tugas, dan status keanggotaan | Dievaluasi server-side |
| `FR-DT-022` | Kelola perubahan penugasan DT selama periode berjalan | **Ya (MVP)** | Mutasi perubahan gedung/program kerja selama periode `ACTIVE` dengan alasan wajib dan pencatatan riwayat + audit | Mengisi snapshot riwayat penugasan baru |

### Di luar scope MVP (Guardrails)

1. **Modul PX (`FR-DT-015`, `016`, `017`):** Berita acara harian (`PX-03`) dan aspirasi anonim (`PX-02`) belum dibangun; jangan menambahkan rute, tombol, atau form dummy untuk keduanya.
2. **Skor poin partisipasi DT (`FR-DT-012`):** Catatan FR menyatakan *"Skor poin partisipasi belum disepakati"*. Rekap MVP menampilkan jumlah kehadiran, status ketepatan waktu, dan keterlibatan kepanitiaan **tanpa** rumus skor poin otomatis.
3. **Validasi wajib penghuni aktif (`FR-DT-002`):** RESORA belum memiliki direktori master mahasiswa/penghuni. Pendaftaran calon DT menggunakan input manual tervalidasi tanpa validasi ke master mahasiswa.
4. **Penilaian Kinerja SR (`penilaian` / P1-01) & Broadcast SR (`broadcast`):** `DT` adalah pembantu bawahan SR, bukan subjek evaluasi KPI SR (`sr_profiles` / `sr_period_memberships`) dan tidak otomatis memperoleh hak baca pengumuman internal SR (`canReadBroadcast`) maupun `Pelanggaran`/`Penilaian SR`.

---

## 4. Aktor dan matriks akses

Semua otorisasi ditegakkan di server pada setiap prosedur tRPC dan pemeriksaan identitas Better Auth menggunakan identitas live (`getLiveOperationalIdentity` / `getActiveIdentity`).

| Aktor | Definisi pada Sistem | Hak Akses Modul DT & Integrasi |
| --- | --- | --- |
| **Pengelola DT (`ADAPTIF`)** | `actor = 'SR'`, akun aktif, tenure `ACTIVE`, penugasan valid dengan `departmentCode = 'ADAPTIF'` (`KADEP`, `SEKDEP`, `ANGGOTA`) | Akses menu `Kelola DT` (`/dt`) pada grup **Departemen · ADAPTIF**: daftar/cari/filter DT, daftarkan calon, review aktivasi/penolakan, tetapkan/perpanjang/akhiri periode, arsipkan riwayat tidak aktif, kelola penugasan gedung/proker, reset password akun DT, kelola tab **Absensi & Event DT** (buat/kelola kegiatan & sesi QR khusus DT `allDt`/individu DT), serta lihat detail/riwayat/rekap kehadiran & partisipasi DT |
| **`SUPERADMIN` Sah** | `actor = 'SR'` atau `SYSTEM_ADMIN` aktif dengan grant eksplisit `SUPERADMIN` serta lolos gate password | Akses lintas departemen sesuai SA-01/SA-03 termasuk grup **Departemen · ADAPTIF** (`/dt`) terpisah dari pengelolaan akun di `/admin/users` (tab **Akun SR** dan **Akun DT**) |
| **Anggota DT Aktif (`DT`)** | `actor = 'DT'`, `user_profiles.is_active = true`, memiliki minimal satu baris `dt_memberships` dengan `status = 'ACTIVE'` dan `startsOn <= today <= endsOn` (WIB) | Login ke RESORA; melihat status keanggotaan, masa berlaku, penugasan, riwayat periode, daftar kepanitiaan, dan daftar kegiatan yang mengundangnya pada `/dt` dan `/profile`; melakukan scan QR absensi & melihat riwayat absensi pribadi untuk event yang mengundangnya |
| **Pengelola Kepanitiaan (`HCO` / `SUPERADMIN`)** | `canManageCommittee(identity)` | Dapat menambahkan anggota `DT` aktif ke kepanitiaan event (`FR-DT-013`) dan menyertakan mereka pada event kepanitiaan/event yang mengizinkan DT (`FR-DT-010`). Tidak otomatis mengelola keanggotaan/periode DT milik Adaptif |
| **SR Non-Adaptif / Non-HCO** | `actor = 'SR'` di luar `ADAPTIF` (tanpa grant `SUPERADMIN`) | **Ditolak (`FORBIDDEN`)** mengakses konsol pengelolaan DT (`/dt` mode kelola dan seluruh mutasi/daftar DT) |
| **Mantan DT / Calon / Ditolak** | `actor = 'DT'` tanpa keanggotaan `ACTIVE` yang berlaku hari ini | Ditolak saat login (`DT_MEMBERSHIP_INACTIVE` / `DT_MEMBERSHIP_EXPIRED`) dan seluruh sesi aktifnya ditolak server (`UNAUTHORIZED`) |

---

## 5. Alur dan aturan bisnis utama

### 5.1 Pendaftaran Calon & Pembuatan Identitas (`FR-DT-002`)

1. Pengelola DT (`ADAPTIF` / `SUPERADMIN`) mengisi nama lengkap, NIM (username unik), email unik, serta opsional label periode (mis. `"2026/2027"`), penugasan awal (`departmentCode`, `buildingId`, `workProgram`), dan catatan pendaftaran.
2. Jika NIM belum terdaftar pada tabel `user`:
   - Buat akun Better Auth dengan kredensial acak ter-hash (belum diaktifkan untuk login karena status masih `CANDIDATE`), `user_profiles.actor = 'DT'`, `isActive = true`, `mustChangePassword = true`.
   - Buat baris `dt_memberships` berstatus `CANDIDATE`.
3. Jika NIM sudah terdaftar dengan `actor = 'DT'` dan tidak memiliki keanggotaan `CANDIDATE`/`ACTIVE` yang masih berjalan (misalnya mantan DT dari periode lalu):
   - Pengelola DT dapat mendaftarkan keanggotaan periode baru (`CANDIDATE`) pada akun `userId` yang sama agar identitas tunggal dan riwayat terdahulu tetap terjaga (`FR-DT-008`, `FR-DT-020`).
   - Jika NIM sudah digunakan oleh `SR` atau `SYSTEM_ADMIN`, pendaftaran ditolak (`CONFLICT`) agar tidak mencampur aktor.

### 5.2 Tinjau, Aktivasi, dan Penetapan Periode (`FR-DT-003`, `004`, `008`)

1. Pengelola DT meninjau `CANDIDATE`:
   - **Aktifkan (`ACTIVE`):** wajib mengisi `startsOn` dan `endsOn` (`endsOn >= startsOn`), serta dapat memperbarui label periode dan penugasan awal.
   - Saat aktivasi, sistem memastikan tidak ada keanggotaan `ACTIVE` lain yang masih aktif untuk `userId` yang sama, menghasilkan **password sementara baru** (18 byte acak base64url, dikembalikan **satu kali** ke UI pengelola tanpa disimpan plaintext/log), menyetel `mustChangePassword = true`, dan menulis entri awal ke `dt_assignment_histories` (jika ada penugasan) serta `dt_audits`.
   - **Tolak (`REJECTED`):** wajib mengisi `reason` non-kosong; status menjadi `REJECTED` dan dicatat di `dt_audits`. Akun tetap tidak dapat login.

### 5.3 Perpanjangan, Pengakhiran, Pengarsipan, dan Pencabutan Akses (`FR-DT-005`, `018`–`020`)

1. **Perpanjang periode (`extend`):** hanya berlaku untuk keanggotaan `ACTIVE` (termasuk yang telah melewati `endsOn` namun belum diarsipkan/diakhiri) dengan `newEndsOn > currentEndsOn` dan `reason` opsional/wajib. Riwayat periode sebelumnya tetap tercatat dalam audit before/after.
2. **Akhiri keanggotaan (`end`):** berlaku untuk status `ACTIVE`; wajib `reason` non-kosong; mengubah status menjadi `ENDED`, menyimpan `endedAt` dan `endedReason`, **segera menghapus sesi Better Auth** pengguna tersebut (jika tidak ada keanggotaan aktif lain), dan menutup penugasan berjalan.
3. **Arsipkan (`archive`):** berlaku untuk keanggotaan `ENDED` (atau `ACTIVE` yang `endsOn < today` / `REJECTED`); mengubah status menjadi `ARCHIVED`, mencabut sesi aktif jika masih ada, dan mempertahankan seluruh data keanggotaan, riwayat penugasan, audit, kepanitiaan, serta rekor kehadiran untuk audit historis.
4. **Pencabutan otomatis (`FR-DT-019`):** `getActiveIdentity` memeriksa keanggotaan `ACTIVE` dengan rentang tanggal Jakarta (`startsOn <= today <= endsOn`) pada setiap permintaan terautentikasi dan pembuatan sesi login. Begitu melewati `endsOn`, akses ditolak seketika tanpa menunggu cron job.

### 5.4 Penugasan Dinamis Selama Periode Berjalan (`FR-DT-006`, `007`, `022`)

1. Pengelola DT dapat mengubah keterikatan DT (`departmentCode` opsional, `buildingId` opsional, `workProgram` opsional) pada keanggotaan `ACTIVE` dengan **`reason` wajib**.
2. Sistem memperbarui snapshot penugasan aktif pada `dt_memberships`, menutup entri sebelumnya di `dt_assignment_histories` (`effectiveTo = now`), menyisipkan entri baru (`effectiveFrom = now`), dan menulis audit `beforeState`/`afterState` secara atomik dalam satu transaksi.

### 5.5 Kepanitiaan & Absensi Kegiatan DT (`FR-DT-009`–`014`)

1. **Kepanitiaan (`FR-DT-013`):**
   - `committee_members.user_id` merujuk ke `user_profiles.user_id` (bukan `sr_profiles.user_id`) sehingga dapat menampung anggota `SR` dan `DT` aktif.
   - `committee.candidates` mengembalikan kandidat `SR` aktif dan `DT` aktif (diberi label `actorType: 'SR' | 'DT'`) tanpa mengubah aturan jabatan kepanitiaan yang ada.
2. **Event & Absensi (`FR-DT-009`, `010`, `011`, `014`):**
   - `events.rosterCriteria` mendukung flag opsional `allDt?: boolean` (default `false`), serta event berjenis `COMMITTEE` otomatis mengevaluasi anggota `DT` aktif yang berada di dalam kepanitiaan event tersebut bersama kandidat `SR`.
   - `event_participants` mencatat snapshot peserta DT dengan `departmentCode = dt.departmentCode ?? 'DT'`, `positionCode = 'DT'`, dan gedung sesuai penugasan DT (atau `'NON_GEDUNG'` / `'Dorm Team'` jika belum terikat gedung tertentu).
   - `attendance.checkIn`, `events.list`, `events.detail`, dan `attendance.ownHistory` mengizinkan `actor = 'DT'` aktif untuk kegiatan yang mengundangnya (`event_participants`).
   - Kegiatan SR biasa (`allSr: true` tanpa `allDt` dan tanpa kepanitiaan berisi DT) **tidak** mengundang DT sehingga pemisahan ruang SR dan DT tetap terjaga.
3. **Rekap Kehadiran & Partisipasi DT (`FR-DT-012`):**
   - Pengelola DT (`ADAPTIF` / `SUPERADMIN`) dapat melihat ringkasan dan detail per anggota DT: jumlah undangan event, hadir (`EARLY`, `ON_TIME`, `LATE`), pending, tidak hadir (`ABSENT`), serta daftar kepanitiaan yang diikuti.

---

## 6. Batas data & arsitektur (`ADR 0006`)

1. **Tabel domain `dt` (`packages/db/src/schema/dt.ts`):**
   - `dt_memberships`: data keanggotaan, periode (`periodName`, `startsOn`, `endsOn`), status lifecycle, penugasan aktif, dan metadata keputusan/arsip.
   - `dt_assignment_histories`: riwayat perubahan penugasan (`departmentCode`, `buildingId`, `workProgram`, `effectiveFrom`, `effectiveTo`, `assignedByUserId`, `reason`).
   - `dt_audits`: tabel audit append-only (dilindungi trigger DB pemblokir `UPDATE`/`DELETE`/`TRUNCATE`) yang mencatat seluruh perubahan status, periode, penugasan, dan reset akses.
2. **Kepemilikan tabel (`packages/config/src/architecture.ts`):**
   - Seluruh tabel `dt_*` dimiliki oleh modul `"dt"`.
   - Modul `dt` tidak mengimpor tabel privat `events`, `attendance`, atau `committee` secara langsung; komunikasi lintas modul memakai kontrak `*.public.ts` server-only (`identity.public.ts`, `committee.public.ts`, `events.public.ts`, `attendance.public.ts`).
   - Modul `identity` menyediakan kontrak publik sempit untuk membuat/mengaktifkan akun `DT`, mereset password akun `DT`, mencabut sesi, serta membaca daftar kandidat `DT` aktif (untuk `committee` dan `events`).

---

## 7. Acceptance Criteria MVP (`AC01`–`AC10`)

| ID | Skenario Verifikasi | FR Terkait |
| --- | --- | --- |
| `AC01` | Pengelola DT (`ADAPTIF` aktif / `SUPERADMIN`) mendaftarkan calon DT baru; akun berstatus `CANDIDATE` tidak bisa login sebelum diaktifkan | `FR-DT-002`, `008` |
| `AC02` | `ADAPTIF` mengaktifkan calon DT dengan `startsOn`/`endsOn` valid; password sementara tampil satu kali dan `DT` aktif berhasil login ke RESORA | `FR-DT-003`, `004`, `008` |
| `AC03` | SR non-Adaptif (mis. `RND`, `HCO` tanpa `SUPERADMIN`) serta `DT` sendiri ditolak (`FORBIDDEN`) pada seluruh endpoint manajemen DT | Otorisasi server-side |
| `AC04` | Perubahan penugasan (`departmentCode`, `buildingId`, `workProgram`) mewajibkan alasan dan menulis baris baru ke `dt_assignment_histories` serta `dt_audits` secara atomik | `FR-DT-006`, `007`, `022` |
| `AC05` | Perpanjangan periode memperbarui `endsOn` dengan audit; pengakhiran dini (`ENDED`) atau masa periode lewat (`endsOn < today`) segera menolak login dan akses sesi `DT` (`UNAUTHORIZED`) | `FR-DT-005`, `018`, `019` |
| `AC06` | Pengarsipan (`ARCHIVED`) keanggotaan tidak aktif mempertahankan seluruh riwayat periode, penugasan, audit, kepanitiaan, dan absensi | `FR-DT-007`, `020` |
| `AC07` | Pencarian nama/NIM serta filter periode, departemen, dan status mengembalikan hasil akurat sesuai data server | `FR-DT-001`, `021` |
| `AC08` | Pengelola kepanitiaan (`HCO`/`SUPERADMIN`) dapat mencari dan menambahkan `DT` aktif ke kepanitiaan event | `FR-DT-013` |
| `AC09` | `DT` aktif dapat melihat event yang mengundangnya (kepanitiaan/flag DT), melakukan check-in QR + geofence, melihat riwayat absensi sendiri, dan tidak bisa mengakses event internal khusus SR; `ADAPTIF` melihat rekap partisipasi DT tanpa skor poin fiktif | `FR-DT-009`–`012`, `014` |
| `AC10` | Tidak ada fitur `PX-02`/`PX-03` fiktif atau rumus poin DT tak disetujui yang disisipkan; seluruh check arsitektur, typecheck, lint, dan uji UI lokal lolos | Guardrails & Design System |
