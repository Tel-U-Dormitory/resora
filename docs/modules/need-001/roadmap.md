# RESORA — Roadmap Foundation & NEED-001

> **Status:** Working execution plan · **Baseline:** 10 Oktober 2026 · **Target pilot:** 18 Oktober 2026  
> **Cakupan:** setup sistem dan implementasi absensi event internal SR (`NEED-001`) **saja**.  
> **Pemilik keputusan/release:** PM RnD · **Validator aturan absensi:** HCO · **Pelaksana:** RnD/Codex dengan review manusia.

## 1. Tujuan dan aturan pelaksanaan

**Target 18 Oktober:** SR sungguhan bisa login menggunakan NIM/password, melihat event yang sesuai, scan QR untuk absensi, melihat riwayat; HCO bisa membuat event/QR dan melihat/mengekspor rekap; KADIV HCO bisa mengisi/mengoreksi absensi manual dengan alasan wajib, waktu efektif dan audit immutable.

- **Source of truth:** `docs/prd.md`, `docs/modules/need-001/prd.md`, `docs/modules/need-001/acceptance-tests.md`, `docs/architecture.md`, `docs/decisions/`, dan `AGENTS.md`. Bila kode dan PRD konflik, klarifikasi sebelum mengubah perilaku bisnis.
- **Tracking eksekusi:** spreadsheet logbook NEED-001 yang terpisah; dokumen ini adalah roadmap teknis, **bukan** duplikasi task logbook.
- **Status:** `DONE` = teruji, `IN PROGRESS` = sedang dikerjakan, `TODO` = belum dimulai, `BLOCKED` = menunggu keputusan/akses. Jangan ubah status berdasarkan asumsi.
- **Batas perubahan:** satu branch/PR per fase atau perubahan yang koheren; review migration dan security sebelum merge; Codex tidak boleh deploy, migrasi remote, atau impor data sungguhan tanpa izin eksplisit.
- **Arsitektur:** pnpm 10.33.4 workspace/package manager + Bun 1.3.13 runtime backend + Turborepo; Next.js (`apps/web`) → Express/tRPC (`apps/server`, `packages/api`) → Drizzle (`packages/db`) → **Supabase PostgreSQL**. Better Auth di backend; **bukan** Supabase Auth dan tidak ada koneksi DB langsung dari browser.

### Keputusan sudah dikonfirmasi

| Topik         | Keputusan                                                                                                                               |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Account       | Satu aktor utama per akun; pilot hanya akun SR; login NIM + password; tidak ada registrasi publik                                       |
| SR            | Satu departemen + satu gedung + jabatan; `KADIV` adalah jabatan, bukan aktor utama                                                      |
| HCO           | Anggota HCO membuat event/QR, melihat dan mengekspor absensi                                                                            |
| KADIV HCO     | Mengisi/mengoreksi absensi manual dengan alasan dan audit; KADIV departemen lain tidak punya hak ini                                     |
| Audience      | `SR`; `KADIV` (seluruh departemen); `ALL_STUDENTS` (Mahasiswa **dan** SR, tetapi mahasiswa non-SR belum bisa login saat pilot)          |
| Event         | HCO memilih audience, jadwal, lokasi pusat dan radius; default radius **20 m**, bisa diubah                                             |
| Status waktu  | Toleransi terlambat default **15 menit**, bisa diubah per event; EARLY/ON_TIME/LATE terpisah dari hadir/tidak hadir; batas toleransi inklusif; waktu scan server                                 |
| QR            | QR event-bound statis, default 6 jam sejak aktivasi, editable, tanpa rotasi otomatis; display halaman event/revoke HCO; primitive reusable NEED-007                                              |
| Fallback      | GPS gagal diverifikasi: hubungi KADIV HCO untuk input manual; tidak ada alur pengajuan/approval SR                                            |
| Snapshot | Peserta dibuat saat publish; semua undangan masuk laporan; inactive tetap ditolak login/check-in |
| Superadmin | Hak sistem, bukan aktor kelima; awalnya hanya superadmin mengubah departemen/jabatan/gedung/status aktif SR |
| DB runtime    | `DATABASE_URL` = Supabase **Session Pooler**                                                                                            |
| DB migrations | `DIRECT_DB_URL` = direct connection yang diutamakan bila IPv6 tersedia; opsi session pooler harus diuji jika direct tidak dapat dicapai |
| Deployment    | Aplikasi direncanakan di VPS melalui HTTPS; database dikelola Supabase; domain, VPS dan pendanaan belum final                           |

## 2. Peta milestone dan target waktu

**Tanggal berikut adalah target kerja agresif, bukan konfirmasi bahwa pekerjaan sudah selesai.** Jadwal dapat diparalelkan hanya jika perubahan tidak saling bergantung dan ada reviewer.

| Tanggal target | Milestone                                   | Kondisi selesai (gate)                                               | Status awal                                          |
| -------------- | ------------------------------------------- | -------------------------------------------------------------------- | ---------------------------------------------------- |
| **10 Okt**     | F0 Audit scaffold + mulai F1 Supabase       | Struktur repo dipahami; rencana perubahan env/DB disetujui           | **F0 audit DONE**; F1 koneksi/workflow DONE; SQL belum diterapkan |
| **11 Okt**     | Review F1/pnpm + rencana skema; mulai F2 identitas | Koneksi teruji; SQL baseline versioned; review sebelum aplikasi SQL    | TODO                                                 |
| **12 Okt**     | F2 Login/provisioning + F3 RBAC             | SR dummy login NIM; signup publik mati; izin HCO/KADIV diuji         | TODO                                                 |
| **13 Okt**     | F4 Event & reusable QR                      | HCO buat event/QR; audience dan challenge diverifikasi backend       | TODO                                                 |
| **14 Okt**     | F5 Check-in + geofence                      | SR bisa scan satu kali; presence + EARLY/ON_TIME/LATE & radius tervalidasi     | TODO                                                 |
| **15 Okt**     | F6 Manual attendance + reporting            | Input/koreksi KADIV dengan audit, semua undangan dan CSV berjalan              | TODO                                                 |
| **16 Okt**     | F7 Integrasi UI + automated tests           | Happy path dan failure cases lulus di staging                        | TODO                                                 |
| **17 Okt**     | F8 UAT lapangan + deployment rehearsal      | HTTPS, backup, UAT HCO, revisi blocker P0, go/no-go                  | TODO                                                 |
| **18 Okt**     | **Controlled pilot NEED-001**               | Persetujuan PM + HCO; bisa dipakai SR sungguhan tanpa blocker kritis | TODO                                                 |

**Cutline:** Bila konfigurasi akun/HTTPS atau aturan lokasi belum siap pada 17 Oktober, **jangan** memaksa live pilot dengan credential atau location check yang tidak aman. Gunakan staging/UAT terbatas dan ubah target rilis berdasarkan keputusan PM.

## 3. Rencana fase dan Definition of Done

### F0 — Audit & baseline repository (static audit: DONE; runtime check: sebagian)

**Auditor:** reviewer teknis. **Diketahui:** scaffold tersedia di GitHub, `pnpm run dev` sudah berhasil menurut PM (awalnya dengan Bun sebagai package manager; sekarang memakai pnpm). **Teruji:** typecheck enam task, build dua app, empat Bun smoke tests; Biome masih gagal pada scaffold. Migrasi belum diterapkan; repeat Docker terakhir terblokir disk penuh. [Bukti pnpm](../../pnpm-migration.md).

- [x] Cek struktur `apps/web`, `apps/server`, `packages/api`, `packages/auth`, `packages/db`, Turborepo, Bun, Docker, Varlock.
- [x] Temukan bahwa scaffold masih menyediakan sign-up publik, email/password, dan Docker PostgreSQL lokal.
- [x] Typecheck/build/smoke diuji; hasil Biome dan Docker tidak sepenuhnya hijau dicatat di laporan pnpm.
- [ ] Catat SHA baseline/review commit sebelum fase implementasi berikutnya.
- [x] Setup memuat command scaffold yang sudah dikoreksi, Supabase dan pnpm; jangan scaffold ulang.

**Gate F0:** tidak melakukan scaffold ulang atau refactor yang tidak diperlukan.

### F1 — Supabase development, environment & Drizzle migration workflow (DONE; SQL belum diterapkan)

**Manual — PM:** project Supabase Development **sudah dibuat**; URL Session Pooler dimasukkan ke `DATABASE_URL`, Direct ke `DIRECT_DB_URL` (nilai rahasia jangan disalin ke Git/chat).

**Codex — implementasi:**

- [x] Audit Varlock `apps/server/.env.schema`, `packages/db/.env.schema`, `packages/db/drizzle.config.ts`, `packages/db/src/index.ts`.
- [x] Runtime Drizzle/Better Auth menggunakan `DATABASE_URL` dari backend. Tidak menambahkan Supabase JS client/Auth ke frontend.
- [x] Drizzle Kit memprioritaskan `DIRECT_DB_URL`; kegagalan direct dilaporkan tanpa fallback diam-diam. Alternatif Session Pooler dipilih eksplisit dan SELECT 1-nya teruji; direct masih gagal DNS pada workstation.
- [x] Sesuaikan Compose: PostgreSQL Docker tetap opsional untuk lokal; deployment web/server **tidak** mewajibkan container database lokal.
- [x] Sediakan verifikasi koneksi **read-only** (`SELECT 1`) dan contoh variabel tanpa secret. Jangan menampilkan URL yang memuat password.
- [x] Baseline empat tabel auth dibuat/versioned dan SQL direview tanpa aplikasi ke DB.
- [ ] Penerapan migration Development/verifikasi tabel hanya setelah review dan izin terpisah; bukan syarat yang diam-diam sudah dianggap selesai.
- [ ] Pisahkan environment dev/prod dan gunakan least-privilege credential jika memungkinkan; jangan pernah uji destruktif pada production.

**Hasil F1:** backend SELECT 1 berhasil, baseline migration versioned tersedia; repeatability aplikasi SQL dari DB kosong belum diuji. Supabase/pnpm dipertahankan. F2 dan domain NEED-001 belum diimplementasikan; review [model kanonis](resora-need-001-data-model.md) dahulu.

### F2 — Identitas SR, login NIM & provisioning (TODO)

**Codex:**

- [ ] Aktifkan Better Auth Username Plugin agar `username=NIM` dan login NIM/password, bukan email/password di UI.
- [ ] Matikan **server-side** public sign-up; hapus UI sign-up, dan uji request langsung ke endpoint signup ditolak.
- [ ] Tambahkan tabel/profil SR dan lookup departemen, gedung, jabatan serta status aktif; migrasi versioned.
- [ ] Siapkan skrip import CSV **privileged** (NIM, nama, email nyata, departemen, jabatan, gedung, aktif); data nyata privat sebelum UAT, synthetic sementara; validasi NIM unik, relasi satu departemen/satu gedung, jabatan, dan duplikasi.
- [ ] Akun awal memakai password sementara acak yang kuat, hashing melalui Better Auth, distribusi privat, dan kebijakan ganti password pertama.
- [ ] Gunakan email nyata setiap SR; implementasikan recovery/verifikasi Phase 2 via rencana Gmail SMTP, display name `RnD SR XIV`; alamat pengirim/credential hanya env.
- [ ] Uji login, logout, session refresh, akun tidak aktif, NIM tidak dikenal, rate limiting dasar.

**Manual — PM:** serahkan format roster/gedung **melalui kanal aman**, siapkan SMTP privat dan setujui distribusi password. Jangan masukkan identitas asli ke fixture GitHub.

**Gate F2:** SR dummy berhasil login; pengguna tanpa provisioning tidak dapat mendaftar/login; tidak ada password plaintext di log/database/repo.

### F3 — Server-side authorization & audience (TODO)

- [ ] Implementasikan action permissions yang **deny-by-default**, bukan sekadar hide/show menu.
- [ ] HCO member: buat/ubah event, issue QR, lihat rekap, ekspor.
- [ ] **Hanya** `SR + department=HCO + position=KADIV` yang dapat input/koreksi manual dengan alasan dan audit.
- [ ] SR lain: daftar event eligible, scan, hubungi KADIV HCO jika perlu input manual, lihat histori sendiri.
- [ ] Initial superadmin adalah privilege sistem; hanya superadmin mengubah assignment/status aktif SR, tanpa bypass attendance otomatis.
- [ ] Satu primary actor per akun; `KADIV` audience cocok untuk semua KADIV SR lintas departemen.
- [ ] `ALL_STUDENTS` mencakup aktor SR dan Mahasiswa secara semantik; pada pilot UI diberi batasan bahwa hanya SR memiliki akses login.
- [ ] Uji akses negatif: SR biasa, HCO bukan KADIV, KADIV non-HCO, dan unauthenticated.

**Gate F3:** semua protected tRPC procedures menguji session **dan** role/position/department/resource ownership di backend.

### F4 — Event management & reusable QR challenge (TODO)

- [ ] Skema event dengan creator, title, jadwal, audience, lokasi pusat, radius default 20m, toleransi telat 15 menit, dan status lifecycle.
- [ ] CRUD event khusus HCO, input tervalidasi Zod, kebijakan perubahan/pembatalan saat sudah ada absensi.
- [ ] Audience predicate menghasilkan snapshot peserta saat publish secara atomik; list/check-in memakai snapshot dan status aktif live; laporan menyertakan undangan tanpa record.
- [ ] Modul QR memakai token unpredictable **terikat event**, statis default 6 jam dari aktivasi (editable), display halaman event, revoke HCO, tanpa rotasi otomatis. Protokol penyimpanan/redisplay masih proposal model.
- [ ] Pisahkan QR issuance/verification dari aturan absensi sehingga NEED-007 bisa menggunakan engine sama nanti, tanpa mengimplementasikan NEED-007 sekarang.
- [ ] UI minimal HCO: form create event, detail, QR tampil, state loading/error/expired.

**Gate F4:** HCO dapat membuat event dummy yang eligible; QR event A tidak dapat digunakan untuk event B atau setelah dicabut/expired.

### F5 — QR check-in, waktu & geofence (TODO)

- [ ] SR scan QR melalui browser mobile dan mengirim lokasi dengan izin pengguna (HTTPS pada staging/production).
- [ ] Backend memvalidasi token, session, audience, snapshot, QR aktif/expiry/revoke, lokasi/radius dan status aktif; tidak mempercayai lokasi/waktu yang dihitung frontend.
- [ ] Default radius **20m** dan late tolerance **15 menit**, masing-masing editable per event.
- [ ] Scan boleh sebelum mulai/setelah selesai selama QR aktif; waktu server menentukan EARLY/ON_TIME/LATE dengan batas grace inklusif. Presence terpisah: pending tanpa record hingga closure, lalu absent; trigger closure TBD.
- [ ] DB constraint `UNIQUE(event_id,user_id)`; retry/concurrent scan tidak menghasilkan attendance ganda.
- [ ] Error state eksplisit untuk invalid QR, expired QR, GPS ditolak/kurang akurat, di luar radius, session habis, koneksi putus.
- [ ] Jangan simpan histori GPS kontinu; catat hanya bukti minimum yang disetujui.

**Gate F5:** successful/late/duplicate/outside-radius/expired-token diuji otomatis; GPS tidak terverifikasi mengarahkan ke KADIV HCO untuk input manual.

### F6 — Manual attendance, history, recap & export (TODO)

- [ ] KADIV HCO membuka event, mencari nama/NIM dan memilih profil peserta undangan; input dengan alasan wajib.
- [ ] attendance_at default server sekarang, dapat override waktu aktual; recorded_at immutable saat pencatatan. Klasifikasi otomatis dari waktu efektif.
- [ ] Insert/koreksi + audit before/after atomik; unique event/user; koreksi tidak menghapus histori atau menulis ulang recorded_at.
- [ ] SR melihat histori sendiri; HCO melihat semua undangan, termasuk pending sebelum closure dan absent sesudahnya.
- [ ] CSV wajib: NIM/nama, departemen/jabatan/gedung, presence, waktu efektif, timing, durasi keterlambatan, QR/MANUAL bila relevan. XLSX opsional; tanpa password/session/QR secret/koordinat GPS mentah.
- [ ] Uji izin negatif, concurrent QR/manual, rollback audit dan batas waktu override setelah kebijakan disepakati.

**Gate F6:** HCO publish/snapshot → SR scan atau KADIV input/koreksi → HCO rekap/CSV semua undangan berjalan end-to-end.

### F7 — Integrasi frontend, keamanan, CI & pengujian (TODO)

- [ ] Selesaikan mobile UI SR dan HCO; lokasi browser, kamera QR, loading, izin ditolak, expired token dan pesan error yang jelas.
- [ ] Tulis unit test (audience, policy, geofence, status waktu), integration test (auth, RBAC, DB uniqueness), dan E2E alur utama.
- [ ] Jalankan `pnpm exec biome check .` (read-only), `pnpm run check-types`, `pnpm run build`, serta test command sesuai repo. `pnpm run check` saat ini memakai `--write`; jangan pakai sebagai audit read-only.
- [ ] Tambahkan CI minimal pada pull request: Biome, typecheck, build dan tests relevan.
- [ ] Cek pembatasan public sign-up secara langsung, security headers, cookie/CORS/trusted origins, rate limiting, logging redaction.
- [ ] Catat hasil terhadap `docs/modules/need-001/acceptance-tests.md`; setiap gagal punya severity dan owner.

**Gate F7:** tidak ada blocker P0, tes negatif RBAC lulus, dan aplikasi layak diuji oleh SR sungguhan di staging.

### F8 — VPS/HTTPS, UAT lapangan & controlled pilot (TODO)

**Manual — PM/DevOps:** pastikan VPS, DNS/subdomain, TLS, akun SR uji, lokasi pusat, akses HCO dan otorisasi penggunaan data tersedia.

- [ ] Siapkan Docker web/server dengan URL publik yang benar; hilangkan ketergantungan `postgres` lokal saat menggunakan Supabase.
- [ ] Jalankan reverse proxy + HTTPS; verifikasi kamera/GPS, cookies, CSRF/CORS serta origin lintas subdomain.
- [ ] Jalankan migrasi production **setelah** review SQL, izin PM dan rencana rollback; jangan gunakan `db:push` untuk production.
- [ ] Verifikasi backup Supabase, retensi, pemulihan dan monitoring minimal; siapkan rollback image/release.
- [ ] UAT mobile di lokasi nyata untuk radius 20m, akurasi GPS, QR expired, terlambat, manual fallback, export dan role restriction.
- [ ] Minta HCO mengonfirmasi aturan bisnis dan PM menandatangani go/no-go.

**Gate F8 (18 Okt):** controlled pilot bisa dipakai SR dengan real credentials yang aman, HTTPS aktif, tanpa bug P0, dan approval PM + HCO. Jika gagal: _no-go_, tetap di staging.

## 4. Keputusan bisnis yang masih blocking

| ID | Keputusan tersisa | Pemutus | Gate |
| --- | --- | --- | --- |
| OPEN-001 | Trigger closure/absent dan explicit QR reissue | HCO + PM | Lifecycle/reporting |
| OPEN-002 | Edit/cancel/republish dan refresh/version snapshot | HCO + PM | F4 |
| OPEN-003 | Radius range/accuracy threshold setelah field test; batas TTL/grace | HCO + PM | F5/UAT |
| OPEN-004 | Batas override waktu; input historis untuk peserta sekarang inactive | KADIV HCO + PM | F6 |
| OPEN-005 | Nilai roster/gedung/jabatan dan distribusi credential aman | PM + RnD | Import nyata/UAT |
| OPEN-006 | Konfigurasi Gmail sender, recovery/verifikasi | PM + RnD | F2 |
| OPEN-007 | Basis/pembulatan lateness, provenance source setelah koreksi, filter/log/retensi ekspor | HCO + PM | F6/release |
| INFRA-001 | VPS/domain/HTTPS, biaya, backup dan target operasional | PM + DevOps | F8 |

Snapshot saat publish, QR statis 6 jam default, scan sebelum/sesudah jadwal, batas ON_TIME inklusif, CSV/email nyata dan input manual langsung KADIV sudah **CONFIRMED**. Jangan mengubah TBD menjadi aturan tersirat; lihat [model](resora-need-001-data-model.md).

## 5. Batas MVP dan pekerjaan yang ditunda

**Wajib untuk pilot:** login SR aman; import/provisioning; RBAC HCO/KADIV; event & audience; QR event-bound; check-in + geofence + late; input/koreksi manual KADIV dengan audit; histori SR; rekap/ekspor HCO; HTTPS, audit dan UAT.

**Ditunda:** login mahasiswa non-SR; operasional penuh audience `ALL_STUDENTS`; SSO/API universitas; NEED-007 registration/character points; dashboard analitik lanjutan; data warehouse; inventory/inspection; push notification; multi-location kompleks; sistem penjadwalan organisasi di luar event.

Jika deadline terancam, **potong polish dan fitur opsional**, bukan autentikasi, pemeriksaan permission, integritas data, atau fallback manual.

## 6. Aturan delegasi ke Codex

Setiap fase dikerjakan **satu per satu**. Instruksi yang dikirim ke Codex wajib mencantumkan:

1. Baca `AGENTS.md` dan PRD/ADR terkait; cek kode yang sudah ada sebelum menambah dependency atau folder.
2. Scope hanya fase yang ditugaskan. Tidak menyentuh modul lain atau mengubah keputusan bisnis `TBD`.
3. Jalankan test/lint/typecheck yang relevan; jika tidak bisa menjalankan, nyatakan alasannya.
4. Sajikan ringkasan file berubah, migrasi/env yang dibutuhkan, hasil tes, risiko, pertanyaan terbuka, dan langkah manual.
5. **Stop untuk review** sebelum merge/migrasi remote/deploy/import real users. Tidak ada secret di output/log/PR.

### Template laporan akhir tiap fase

```text
Phase: F#
Status: DONE / BLOCKED / NEEDS REVIEW
Changed files:
Database/env/migration impact:
Tests run + results:
Manual steps required:
Open decisions / blockers:
Ready for next phase? yes/no, reason:
```

## 7. Final release checklist

- [ ] Supabase Development terkoneksi dan migration history reproducible; production tidak berbagi environment dev.
- [ ] Public sign-up diblokir di backend; login NIM/password berhasil dengan akun provisioned.
- [ ] Password awal aman dan reset/change-first-login berhasil; tidak ada credential di repo/log.
- [ ] HCO vs KADIV HCO vs KADIV non-HCO vs SR biasa diuji untuk semua aksi penting.
- [ ] Audience `SR`, `KADIV` dan overlap `ALL_STUDENTS` ditangani tanpa multi-role akun.
- [ ] Event publication snapshot, QR statis TTL/revoke, early/after-end scan dan geofence sesuai aturan confirmed; TBD terkait diselesaikan.
- [ ] Duplikasi/retry/race condition tidak menggandakan kehadiran.
- [ ] Input/koreksi manual menghasilkan audit immutable, effective time terpisah dari recorded_at dan klasifikasi otomatis.
- [ ] SR bisa melihat histori sendiri; HCO bisa rekap dan ekspor tanpa bocor lintas role.
- [ ] Mobile QR/GPS diuji nyata melalui HTTPS; fallback tersedia untuk lokasi tidak akurat.
- [ ] CI, typecheck, build, tes acceptance dan security lulus.
- [ ] Reverse proxy, backup/restore, monitoring, deployment rollback tersedia.
- [ ] HCO menyetujui business rules & UAT; PM menyetujui rilis 18 Oktober.

---

**Kaidah keberhasilan:** targetnya **usable and safe SR attendance pilot**, bukan sekadar halaman tampil atau QR berhasil di-generate. Semua status pekerjaan perlu diperbarui dari hasil nyata, bukan dari tabel rencana ini.
