# RESORA — Roadmap Foundation & NEED-001

> **Status:** Working execution plan · **Baseline:** 10 Oktober 2026 · **Target pilot:** 18 Oktober 2026  
> **Cakupan:** setup sistem dan implementasi absensi event internal SR (`NEED-001`) **saja**.  
> **Pemilik keputusan/release:** PM RnD · **Validator aturan absensi:** HCO · **Pelaksana:** RnD/Codex dengan review manusia.

## 1. Tujuan dan aturan pelaksanaan

**Target 18 Oktober:** SR sungguhan bisa login menggunakan NIM/password, melihat event yang sesuai, scan QR untuk absensi, melihat riwayat; HCO bisa membuat event/QR dan melihat/mengekspor rekap; KADEP HCO bisa mengisi/mengoreksi absensi manual dengan alasan wajib, waktu efektif dan audit immutable.

- **Source of truth:** `docs/prd.md`, `docs/modules/need-001/prd.md`, `docs/modules/need-001/acceptance-tests.md`, `docs/architecture.md`, `docs/decisions/`, dan `AGENTS.md`. Bila kode dan PRD konflik, klarifikasi sebelum mengubah perilaku bisnis.
- **Tracking eksekusi:** spreadsheet logbook NEED-001 yang terpisah; dokumen ini adalah roadmap teknis, **bukan** duplikasi task logbook.
- **Status:** `DONE` = teruji, `IN PROGRESS` = sedang dikerjakan, `TODO` = belum dimulai, `BLOCKED` = menunggu keputusan/akses. Jangan ubah status berdasarkan asumsi.
- **Batas perubahan:** satu branch/PR per fase atau perubahan yang koheren; review migration dan security sebelum merge; Codex tidak boleh deploy, migrasi remote, atau impor data sungguhan tanpa izin eksplisit.
- **Arsitektur:** pnpm 10.33.4 workspace/package manager + Bun 1.3.13 runtime backend + Turborepo; Next.js (`apps/web`) → Express/tRPC (`apps/server`, `packages/api`) → Drizzle (`packages/db`) → **Supabase PostgreSQL**. Better Auth di backend; **bukan** Supabase Auth dan tidak ada koneksi DB langsung dari browser.

### Keputusan sudah dikonfirmasi

| Topik         | Keputusan                                                                                                                               |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Account       | Satu aktor utama per akun; pilot hanya akun SR; login NIM + password; tidak ada registrasi publik                                       |
| SR            | Satu departemen + satu gedung + jabatan; `KADEP` adalah jabatan, bukan aktor utama                                                      |
| HCO           | Anggota HCO membuat event/QR, melihat dan mengekspor absensi                                                                            |
| KADEP HCO     | Mengisi/mengoreksi absensi manual dengan alasan dan audit; KADEP departemen lain tidak punya hak ini                                     |
| Audience | Composable roster: seluruh SR aktif, satu/beberapa departemen, seluruh KADEP lintas departemen, individu, include/exclude dan deduplikasi; INTI sebagai departemen, INTI + KADEP non-INTI union |
| Event | HCO memilih jadwal dan roster; NEED-001 satu attendance session per event, lifecycle aktivasi/close terpisah dari publish/jadwal; binding internal_event_id UNIQUE NOT NULL FK; binding Activity ditunda |
| Status waktu  | Toleransi terlambat default **15 menit**, bisa diubah per event; EARLY/ON_TIME/LATE terpisah dari hadir/tidak hadir; batas toleransi inklusif; waktu scan server                                 |
| QR | Challenge terikat attendance session; statis/redisplay sama, TTL default 360 menit sejak aktivasi challenge, revoke/reissue eksplisit; session harus aktif |
| Fallback      | GPS gagal diverifikasi: hubungi KADEP HCO untuk input manual; tidak ada alur pengajuan/approval SR                                            |
| Snapshot | Peserta dibuat saat publish; semua undangan masuk laporan; inactive tetap ditolak login/check-in |
| Superadmin | Hak sistem, bukan aktor kelima; awalnya hanya superadmin mengubah departemen/jabatan/gedung/status aktif SR |
| DB runtime    | `DATABASE_URL` = Supabase **Session Pooler**                                                                                            |
| DB migrations | `DIRECT_DB_URL` = direct connection yang diutamakan bila IPv6 tersedia; opsi session pooler harus diuji jika direct tidak dapat dicapai |
| Deployment    | Aplikasi direncanakan di VPS melalui HTTPS; database dikelola Supabase; domain, VPS dan pendanaan belum final                           |

## 2. Peta milestone dan target waktu

**Tanggal berikut adalah target kerja agresif, bukan konfirmasi bahwa pekerjaan sudah selesai.** Jadwal dapat diparalelkan hanya jika perubahan tidak saling bergantung dan ada reviewer.

| Tanggal target | Milestone                                   | Kondisi selesai (gate)                                               | Status awal                                          |
| -------------- | ------------------------------------------- | -------------------------------------------------------------------- | ---------------------------------------------------- |
| **10 Okt**     | F0 Audit scaffold + mulai F1 Supabase       | Struktur repo dipahami; rencana perubahan env/DB disetujui           | **F0 audit DONE**; F1 koneksi/workflow DONE; SQL teruji lokal F2A.5; Supabase Development diterapkan/diverifikasi F2A.6 |
| **11 Okt**     | Review F1/pnpm + rencana skema; mulai F2 identitas | Koneksi teruji; SQL baseline versioned; review sebelum aplikasi SQL    | TODO                                                 |
| **12 Okt**     | F2 Login/provisioning + F3 RBAC             | SR dummy login NIM; signup publik mati; izin HCO/KADEP diuji         | F2/Phase 3 fondasi teruji lokal; review PM, import nyata/UAT dan endpoint domain pending |
| **13 Okt**     | F4 Event & reusable QR                      | HCO buat event/QR; audience dan challenge diverifikasi backend       | Phase 4/4.5 PM accepted |
| **14 Okt**     | F5 Check-in + geofence                      | SR bisa scan satu kali; presence + EARLY/ON_TIME/LATE & radius tervalidasi     | Phase 5 Development verified; mobile UAT pending |
| **15 Okt**     | F6 Manual attendance + reporting            | Input/koreksi KADEP dengan audit, semua undangan dan CSV berjalan              | Phase 6 Development migrated/verified; live-profile gaps pending |
| **16 Okt**     | F7 Integrasi UI + automated tests           | Happy path dan failure cases lulus di staging                        | Phase 7 quality review; remote CI pending             |
| **17 Okt**     | F8 UAT lapangan + deployment rehearsal      | HTTPS, backup, UAT HCO, revisi blocker P0, go/no-go                  | TODO                                                 |
| **18 Okt**     | **Controlled pilot NEED-001**               | Persetujuan PM + HCO; bisa dipakai SR sungguhan tanpa blocker kritis | TODO                                                 |

**Cutline:** Bila konfigurasi akun/HTTPS atau aturan lokasi belum siap pada 17 Oktober, **jangan** memaksa live pilot dengan credential atau location check yang tidak aman. Gunakan staging/UAT terbatas dan ubah target rilis berdasarkan keputusan PM.

## 3. Rencana fase dan Definition of Done

### F0 — Audit & baseline repository (static audit: DONE; runtime check: sebagian)

**Auditor:** reviewer teknis. **Diketahui:** scaffold tersedia di GitHub, `pnpm run dev` sudah berhasil menurut PM (awalnya dengan Bun sebagai package manager; sekarang memakai pnpm). **Teruji:** typecheck enam task, build dua app, empat Bun smoke tests; Biome masih gagal pada scaffold. F2A.5 menguji migrasi di PostgreSQL lokal 18.3; Supabase Development diterapkan/diverifikasi F2A.6. Docker API mengembalikan HTTP 500; instalasi PostgreSQL native dipakai sebagai alternatif. [Bukti pnpm](../../pnpm-migration.md).

- [x] Cek struktur `apps/web`, `apps/server`, `packages/api`, `packages/auth`, `packages/db`, Turborepo, Bun, Docker, Varlock.
- [x] Temukan bahwa scaffold masih menyediakan sign-up publik, email/password, dan Docker PostgreSQL lokal.
- [x] Typecheck/build/smoke diuji; hasil Biome dan Docker tidak sepenuhnya hijau dicatat di laporan pnpm.
- [ ] Catat SHA baseline/review commit sebelum fase implementasi berikutnya.
- [x] Setup memuat command scaffold yang sudah dikoreksi, Supabase dan pnpm; jangan scaffold ulang.

**Gate F0:** tidak melakukan scaffold ulang atau refactor yang tidak diperlukan.

### F1 — Supabase development, environment & Drizzle migration workflow (DONE; SQL teruji lokal, Supabase Development diterapkan/diverifikasi F2A.6)

**Manual — PM:** project Supabase Development **sudah dibuat**; URL Session Pooler dimasukkan ke `DATABASE_URL`, Direct ke `DIRECT_DB_URL` (nilai rahasia jangan disalin ke Git/chat).

**Codex — implementasi:**

- [x] Audit Varlock `apps/server/.env.schema`, `packages/db/.env.schema`, `packages/db/drizzle.config.ts`, `packages/db/src/index.ts`.
- [x] Runtime Drizzle/Better Auth menggunakan `DATABASE_URL` dari backend. Tidak menambahkan Supabase JS client/Auth ke frontend.
- [x] Drizzle Kit memprioritaskan `DIRECT_DB_URL`; kegagalan direct dilaporkan tanpa fallback diam-diam. Alternatif Session Pooler dipilih eksplisit dan SELECT 1-nya teruji; direct masih gagal DNS pada workstation.
- [x] Sesuaikan Compose: PostgreSQL Docker tetap opsional untuk lokal; deployment web/server **tidak** mewajibkan container database lokal.
- [x] Sediakan verifikasi koneksi **read-only** (`SELECT 1`) dan contoh variabel tanpa secret. Jangan menampilkan URL yang memuat password.
- [x] Baseline empat tabel auth dibuat/versioned dan SQL direview tanpa aplikasi ke DB.
- [x] F2A.6: izin PM dan seluruh preflight lulus; tiga migration unchanged diterapkan lewat Session Pooler 5432, sepuluh tabel/constraints/triggers/history diverifikasi read-only; backend SELECT 1 lulus.
- [ ] Pisahkan environment dev/prod dan gunakan least-privilege credential jika memungkinkan; jangan pernah uji destruktif pada production.

**Hasil F1:** backend SELECT 1 berhasil, baseline migration versioned tersedia; F2A.5 menguji aplikasi SQL dari DB lokal kosong dan rerun tanpa perubahan objek/history. Supabase/pnpm dipertahankan. F2A source identitas + migration telah dibuat dan teruji lokal F2A.5 (Supabase Development diterapkan/diverifikasi F2A.6); Phase 2B menambahkan login/UI dan enforcement teruji lokal tanpa migrasi. Phase 2C provisioning dan Phase 3 policy/seed teruji lokal; domain event/QR/attendance belum diimplementasikan; review [model kanonis](resora-need-001-data-model.md) dahulu.

### F2 — Identitas SR, login NIM & provisioning (IN PROGRESS; Phase 2B teruji lokal, menunggu review)

**Codex:**

- [x] F2A: Username Plugin server + generated username/display_username, enam tabel identitas dan migration additive/custom teruji lokal F2A.5; Supabase Development diterapkan/diverifikasi F2A.6.
- [x] Phase 2B: client/login NIM sebagai string, validasi live SR aktif/profil, logout dan protected SSR/tRPC. Sesi lama ditolak setelah akun dinonaktifkan/actor berubah; password-change gate memakai flag yang sudah ada.
- [x] Matikan **server-side** public sign-up; hapus UI sign-up, dan uji request langsung ke endpoint signup ditolak.
- [x] Definisi tabel/profil SR, dictionary, actor/active/password-change dan privilege superadmin + relasi/constraints/versioned migrations.
- [x] F2A.5: audit SQL, tiga migration pada PostgreSQL 18.3 disposable lokal, history/rerun identik; 38 identity tests (28 PostgreSQL + 10 offline) lulus tanpa skip. Fix matcher Bun di test harness, bukan SQL. [Bukti validasi](resora-need-001-data-model.md#14-phase-2a5-local-postgresql-validation).
- [x] F2A.6: migration Supabase Development disetujui PM, diterapkan setelah target/history/privileges/recovery/TLS terverifikasi; history tepat tiga entry, nol pending. Tidak ada fixture/integrity writes di Supabase. [Bukti](resora-need-001-data-model.md#15-phase-2a6-supabase-development-migration).
- [x] Phase 2C: CLI import CSV internal dengan validasi, dry-run read-only/apply eksplisit, transaksi Better Auth + profil SR, idempotensi tanpa reset password, dan pengujian lokal sintetis. [Panduan CLI](../../setup.md#phase-2c-internal-csv-provisioning-local-synthetic-imports-only).
- [x] Password awal tepat 8 karakter acak alfanumerik (A–Z, a–z, 0–9) melalui CSPRNG, hashing Better Auth, satu CSV privat/ignored per batch baru, dan pemulihan jika output/commit tidak pasti. Gate ganti password Phase 2B tetap enforced; alur dummy provisioning → login → password change teruji. Kebijakan password permanen tidak dilonggarkan.
- [ ] Import data nyata dan distribusi credential privat setelah persetujuan PM; CLI fase ini menolak database remote. Dictionary/roster nyata tidak dibutuhkan untuk menyelesaikan implementasi lokal.
- [ ] Gunakan email nyata setiap SR; implementasikan recovery/verifikasi Phase 2 via rencana Gmail SMTP, display name `RnD SR XIV`; alamat pengirim/credential hanya env.
- [x] Phase 2B: 16 auth tests lulus tanpa skip dengan DB lokal; login/logout, NIM nol di depan/tidak dikenal/password salah, non-SR/inactive, sesi kedaluwarsa, gate/rotasi password, direct signup, origin dan rate limit. Browser headless lokal lulus tujuh checkpoint; 38 identity tests dan empat smoke tests lulus. [Bukti](resora-need-001-data-model.md#16-phase-2b-sr-authentication).
- [ ] UAT mobile/HTTPS, session refresh jangka panjang, konfigurasi reverse proxy dan limiter beberapa worker sebelum deployment.

**Batas audit Phase 2B:** PRD/architecture terbaru memakai peserta internal SR dengan roster builder dan attendance sessions. Tabel Audience/QR dan rencana F3–F6 di roadmap ini masih edisi lama; wajib direkonsiliasi dengan PM sebelum domain tersebut diimplementasikan. Tidak ada perubahan aturan event dalam Phase 2B.

**Manual — PM:** serahkan format roster/gedung **melalui kanal aman**, siapkan SMTP privat dan setujui distribusi password. Jangan masukkan identitas asli ke fixture GitHub.

**Gate F2:** SR dummy berhasil login; pengguna tanpa provisioning tidak dapat mendaftar/login; tidak ada password plaintext di log/database/repo.

**Sinkronisasi dokumentasi setelah Phase 3 (2026-10-11):** bagian aktif model/ADR/acceptance kini menggunakan roster builder dan shared attendance session. Catatan audit Phase 2B di atas dipertahankan sebagai histori. Keputusan fisik event/session lintas modul, Inti, closure mandiri, cancel/reopen dan freeze policy tetap terbuka; ini bukan implementasi F4.

### F3 — RBAC & organization standardization (implemented/tested locally; PM review pending)

- [x] Canonical 7 department / 7 position / 18 building codes and [relations](resora-need-001-data-model.md#42-departments-positions-buildings--canonical-organization-dictionaries), using the existing schema.
- [x] Local-only preview/apply seed; idempotent, conflicts explicit, existing assignments/UUIDs preserved.
- [x] Live DB identity context with department, position, building and explicit SUPERADMIN; current session/active-SR/password gates retained.
- [x] Pure policies for personal SR access, HCO internal operations, **HCO + KADEP** manual correction, **ADAPTIF** general operations/manual correction, and explicit SUPERADMIN identity administration.
- [x] Negative policy/API tests: non-HCO KADEP, ordinary HCO, inactive/non-SR/missing session, mandatory password gate, forged client claims, and no implicit RnD/admin operational bypass.
- [x] Provisioning accepts official codes and active dictionaries; 8-character initial passwords, transaction/output recovery and import idempotency retained.
- [ ] PM review/merge; real organization data adjustment or remote seed requires separate approval.

**Gate F3:** tested policy foundation and local dictionaries; no event/attendance, grant/revoke or administrator endpoint/UI. Resource ownership, participant eligibility, state and audit checks apply when real endpoints are built. Audience semantics now use KADEP across departments; documentation now follows roster/session design; physical cross-module binding and lifecycle decisions remain Phase 4 gates. Inti membership stays TBD.

### F4 — Organization alignment, event, composable roster & attendance session/QR (PM accepted, including F4.5 frontend fixes)

- [x] Dictionary 8/7/18 dengan INTI; validasi pasangan resmi reusable pada provisioning/directory, seed idempotent tanpa mutasi legacy.
- [x] Attendance memiliki event internal, snapshot, session dan QR; Identity public directory/policy dipakai antar modul, FE melalui satu appRouter tRPC.
- [x] HCO create/edit draft/list/detail/publish/edit metadata/explicit close; non-HCO hanya published invited event; tanpa SUPERADMIN/INTI bypass.
- [x] Roster all SR/departemen/INTI/KADEP non-INTI/INTI + KADEP/individu/include/exclude, UNION dan dedup; publish resolve ulang + snapshot atomik.
- [x] Exactly-one session: UNIQUE NOT NULL internal event FK + deferred inverse constraints; create atomik INACTIVE, publish tidak activate; seluruh konfigurasi frozen sesudah publish.
- [x] Static signed QR, default 360 menit, redisplay PNG, explicit revoke/reissue, session binding, current unique, row-lock concurrency; close event/session/QR atomik.
- [x] UI minimal `/events`, feature-first shallow; guarded session/password flow existing dipertahankan.
- [x] Migrasi additive empat tabel diterapkan dan rerun diverifikasi hanya pada scratch PostgreSQL lokal.
- [x] PM menerima Phase 4/4.5; migrasi Phase 4, dictionary dan dua dummy diterapkan pada Development dalam setup UAT terpisah yang disetujui. Production tidak disentuh.

**Gate F4:** targeted tests dan regression/quality checks dicatat pada laporan implementasi. Scanner, attendance records/audit/export, standalone session close, cancel/reopen/republish dan Activity tidak termasuk.

### F5 — QR check-in, waktu & geofence (Development migration/PostgreSQL verified; mobile UAT pending)

- [x] SR scan QR melalui browser mobile dan mengirim lokasi dengan izin pengguna (HTTPS pada staging/production).
- [x] Backend memvalidasi auth session, attendance session/context, snapshot undangan internal, QR current/expiry/revoke, lokasi/radius dan status aktif; tidak mempercayai lokasi/waktu yang dihitung frontend.
- [x] Default radius **20m** dan late tolerance **15 menit**, masing-masing editable saat DRAFT dan frozen sesudah publish; batas accuracy awal <=20 m melalui satu konstanta backend.
- [x] Scan boleh sebelum mulai/setelah selesai selama QR aktif; waktu server menentukan EARLY/ON_TIME/LATE dengan batas grace inklusif. Close event/session/QR tetap memakai Phase 4. Proyeksi PENDING/ABSENT dan recap untuk seluruh invitee tetap Phase 6; jangan membuat record absent palsu.
- [x] DB constraint `UNIQUE(session_id,user_id)` dan duplicate-safe insert disiapkan pada migration/code; PM subsequently applied Phase 5 to Development; PostgreSQL enforcement/concurrency verified as described below.
- [x] Error state eksplisit untuk invalid QR, expired QR, GPS ditolak/kurang akurat, di luar radius, session habis, koneksi putus.
- [x] Simpan scan_lat/scan_lng/gps_accuracy_m DOUBLE PRECISION hanya pada QR berhasil; MANUAL NULL. Tanpa histori kontinu/scan gagal; tanpa GPS mentah di response umum/rekap/export. Notice sebelum permission; retensi/audit GPS wajib diputuskan sebelum pilot nyata.

**Code gate F5 (offline and targeted Development PostgreSQL tests passed; mobile GPS pending):** successful/late/duplicate/outside-radius/expired-token diuji otomatis; GPS tidak terverifikasi mengarahkan ke KADEP HCO untuk input manual.

**Verification boundary:** the original `pnpm run test:check-in` checks were offline. Subsequent approved Development verification matched five applied migrations and passed 18 distinct PostgreSQL cases, including duplicate/close/revoke/reissue and constraints. Live inactive/invalid-assignment profile reload remains unverified; retention/dedicated GPS audit authorization and HTTPS mobile UAT remain release gates.

### F6 — Manual attendance, audit, history & reporting (Development migrated/verified; live-role gaps and UAT pending)

KADEP HCO alone may insert/correct/audit attendance on PUBLISHED with INACTIVE/ACTIVE session or CLOSED/CLOSED, never DRAFT. Effective time must be <= server now and, for CLOSED, <= events.closed_at; CLOSED insertion requires explicit time. No scheduled-end cutoff or extra backdate window. Existing records of inactive historical invitees may be corrected, but new inactive/ineligible insertion is denied. Preserve original recorded_at, source, recorded_by_user_id, initial manual_reason and GPS; update only attendance_at/timing_class/updated_at and append mandatory-reason before/after audit atomically. Manual operations cannot reopen event/session/QR or change snapshots/frozen policy.

HCO recap/CSV starts from every invitation snapshot LEFT JOIN records by session/user. Presence is derived PRESENT/PENDING/ABSENT, with missing time/timing/source/duration NULL. Lateness is max(0, ceil(minutes after grace)), zero for EARLY/ON_TIME. Own history is session-user-only with bounded pagination, no arbitrary userId. UTF-8 CSV uses quoting/formula defense, an apostrophe text marker retaining NIM leading zeros without formulas, WIB timestamps and blank missing fields. No raw GPS, credentials or internal audit JSON. GPS/audit/export retention and export-access audit remain release decisions.

Phase 6 migration `20261012071912_phase6_reporting` was applied with separate PM approval to verified Supabase Development using Session Pooler 5432 and verified TLS. History contains six matching migrations, no pending migration. Seventeen real PostgreSQL test groups passed (12 rollback-based, five committed concurrency cases), including audit guards, rollback on audit failure, manual/QR uniqueness, correction chain and concurrent close. Six temporary events rolled back completely; one explicitly approved concurrency fixture remains CLOSED with two records/four immutable audits. Data outside the fixture was unchanged. Live inactive-target/historical-inactive and additional role combinations remain unverified; Phase 7 does not mutate remote identities or repeat those suites.

**Phase 5 validation:** PM applied `20261012032606_phase5_checkin` to Supabase Development. Read-only verification matched all five migration hashes, columns, indexes, constraints and enabled triggers. Eighteen distinct targeted PostgreSQL cases passed, including parallel duplicate, close, revoke/reissue and SQL origin/constraint checks. Twelve isolated fixture events were cleaned with existing data unchanged. Live inactive/invalid-assignment DB-profile reload remains unverified (service-context rejection tested); mobile HTTPS UAT is pending.

### F7 — Integrasi frontend, keamanan, CI & pengujian (implemented; PM review and remote CI/UAT pending)

- [x] Audit existing SR/HCO/KADEP flows; scanner fallback copy/cache/track cleanup and safe query error fixes. Static/CLI review only; responsive/device UAT is Phase 8.
- [x] Existing identity/auth/RBAC/roster/QR/check-in/manual/report offline coverage reused; loopback HTTP negative RBAC/origin/privacy/IP and scanner helper regressions added. No browser E2E or remote suite rerun.
- [x] Jalankan `pnpm exec biome check .` (read-only), `pnpm run check-types`, `pnpm run build`, serta test command sesuai repo. `pnpm run check` saat ini memakai `--write`; jangan pakai sebagai audit read-only.
- [x] Minimal main-target PR workflow implemented with pinned tooling, frozen install/Varlock, typegen, read-only Biome, typecheck, offline tests/build and synthetic env. Actual remote run pending.
- [x] Direct signup/origin/login limiter checks and HTTP header/CORS/IP/error/redaction/RBAC checks; proxy security/HTTPS/multi-worker behavior remain Phase 8.
- [x] Catat hasil terhadap `docs/modules/need-001/acceptance-tests.md`; remaining live-profile/UAT/remote-CI gates have explicit owners.

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
| OPEN-001 | Cancel/reopen/republication lifecycle; HCO close/reissue eksplisit sudah confirmed | HCO + PM | Lifecycle/reporting |
| OPEN-003 | Radius range/accuracy tuning setelah field test (awal maksimum 20 m); batas TTL/grace; retensi dan akses audit GPS sebelum pilot nyata | HCO + PM | F5/UAT |
| RESOLVED-004 | Phase 6: waktu <= now/closed_at; CLOSED insert eksplisit; historical inactive correction boleh, new insertion ditolak | KADEP HCO + PM | Confirmed Phase 6 |
| OPEN-005 | Nilai roster/gedung/jabatan dan distribusi credential aman | PM + RnD | Import nyata/UAT |
| OPEN-006 | Konfigurasi Gmail sender, recovery/verifikasi | PM + RnD | F2 |
| OPEN-007 | Retensi/access logging ekspor; ceil menit setelah grace dan immutable origin final Phase 6 | HCO + PM | F6/release |
| OPEN-008 | Future Activity/session binding dan konsistensi registrasi lintas public interface; internal-event binding Phase 4 sudah final | RnD + PM | Sebelum NEED-007 |
| OPEN-009 | Future reopen/cancel; manual PUBLISHED/CLOSED dan batas efektif final Phase 6 | HCO + PM | Sebelum endpoint/filter terkait |
| INFRA-001 | VPS/domain/HTTPS, biaya, backup dan target operasional | PM + DevOps | F8 |

Snapshot publish, QR statis 6 jam, explicit HCO close/reissue (QR lama invalid), audience/jadwal immutable setelah publish, edit hanya title/description, source koreksi tetap, early/after-end scan, ON_TIME inklusif, CSV/email nyata dan input langsung KADEP sudah **CONFIRMED**. Jangan mengubah TBD menjadi aturan tersirat; lihat [model](resora-need-001-data-model.md).

## 5. Batas MVP dan pekerjaan yang ditunda

**Wajib untuk pilot:** login SR aman; import/provisioning; RBAC HCO/KADEP; event & composable roster; satu session internal dan QR session-bound; check-in + geofence + late; input/koreksi manual KADEP dengan audit; histori SR; rekap/ekspor HCO; HTTPS, audit dan UAT.

**Ditunda:** login mahasiswa non-SR; general-activity attendance berbasis registrasi aktif Activity; SSO/API universitas; NEED-007 registration/character points; dashboard analitik lanjutan; data warehouse; inventory/inspection; push notification; multi-location kompleks; sistem penjadwalan organisasi di luar event.

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

- [x] Supabase Development terkoneksi dan migration history cocok dengan tiga file versioned (F2A.6).
- [ ] Verifikasi production tidak berbagi environment dev; production tidak diakses pada fase ini.
- [ ] Public sign-up diblokir di backend; login NIM/password berhasil dengan akun provisioned.
- [ ] Password awal aman dan reset/change-first-login berhasil; tidak ada credential di repo/log.
- [ ] HCO vs KADEP HCO vs KADEP non-HCO vs SR biasa diuji untuk semua aksi penting.
- [ ] Composable roster aktif, KADEP lintas departemen, include/exclude dan deduplikasi diuji; INTI dan INTI + KADEP sesuai department final. Snapshot tidak berubah saat assignment berubah.
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

**Phase 4 FINAL supersedes prior Phase 3 open gates:** INTI is the eighth department; only executive four positions allowed there, other departments KADEP/SEKDEP/ANGGOTA. Attendance owns internal events with one immutable-bound session; no standalone close-session. Publication freezes roster/schedule/all session configuration. Earlier dated Phase 2/3 entries above preserve historical state.

**Phase 7 live-profile gate:** Pending live PostgreSQL combinations: new inactive-target insertion denial; historical inactive correction; HCO non-KADEP/KADEP non-HCO manual denial; non-HCO SUPERADMIN bypass denial. Offline policy/service and loopback HTTP with auth/DB doubles cover these negative paths but are not live-profile proof. The smallest additional gate is PM-approved synthetic identities/status transitions with rollback or explicitly retained immutable audit fixtures; no real SR accounts/remote writes are authorized by Phase 7.

**Phase 7 CLI evidence (2026-10-12):** offline suite 99/99 (14 files), additional WIB tests 3/3, changed HTTP fixture rerun 8/8; 102 distinct cases covered across executions, without PostgreSQL connections. Global read-only Biome 0 errors/warnings; six workspace typechecks pass; server/web production builds pass with synthetic CI env, frontend rechecked only after final WIB change; Varlock codegen/Next typegen and diff checks pass. Source/schema/dependency lock unchanged outside the stated fixes. Workflow statically reviewed and local commands validated; GitHub runner/fresh frozen install remain pending actual PR CI. No remote mutation or deployment.
