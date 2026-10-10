# RESORA — Roadmap Foundation & NEED-001

> **Status:** Working execution plan · **Baseline:** 10 Oktober 2026 · **Target pilot:** 18 Oktober 2026  
> **Cakupan:** setup sistem dan implementasi absensi event internal SR (`NEED-001`) **saja**.  
> **Pemilik keputusan/release:** PM RnD · **Validator aturan absensi:** HCO · **Pelaksana:** RnD/Codex dengan review manusia.

## 1. Tujuan dan aturan pelaksanaan

**Target 18 Oktober:** SR sungguhan bisa login menggunakan NIM/password, melihat event yang sesuai, scan QR untuk absensi, melihat riwayat; HCO bisa membuat event/QR dan melihat/mengekspor rekap; KADIV HCO bisa meninjau pengajuan manual dan melakukan koreksi yang tercatat audit.

- **Source of truth:** `docs/prd.md`, `docs/modules/need-001/prd.md`, `docs/modules/need-001/acceptance-tests.md`, `docs/architecture.md`, `docs/decisions/`, dan `AGENTS.md`. Bila kode dan PRD konflik, klarifikasi sebelum mengubah perilaku bisnis.
- **Tracking eksekusi:** spreadsheet logbook NEED-001 yang terpisah; dokumen ini adalah roadmap teknis, **bukan** duplikasi task logbook.
- **Status:** `DONE` = teruji, `IN PROGRESS` = sedang dikerjakan, `TODO` = belum dimulai, `BLOCKED` = menunggu keputusan/akses. Jangan ubah status berdasarkan asumsi.
- **Batas perubahan:** satu branch/PR per fase atau perubahan yang koheren; review migration dan security sebelum merge; Codex tidak boleh deploy, migrasi remote, atau impor data sungguhan tanpa izin eksplisit.
- **Arsitektur:** pnpm workspace/package manager + Bun runtime backend + Turborepo; Next.js (`apps/web`) → Express/tRPC (`apps/server`, `packages/api`) → Drizzle (`packages/db`) → **Supabase PostgreSQL**. Better Auth di backend; **bukan** Supabase Auth dan tidak ada koneksi DB langsung dari browser.

### Keputusan sudah dikonfirmasi

| Topik         | Keputusan                                                                                                                               |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Account       | Satu aktor utama per akun; pilot hanya akun SR; login NIM + password; tidak ada registrasi publik                                       |
| SR            | Satu departemen + satu gedung + jabatan; `KADIV` adalah jabatan, bukan aktor utama                                                      |
| HCO           | Anggota HCO membuat event/QR, melihat dan mengekspor absensi                                                                            |
| KADIV HCO     | Menyetujui/menolak absensi manual dan mengoreksi absensi; KADIV departemen lain tidak punya hak ini                                     |
| Audience      | `SR`; `KADIV` (seluruh departemen); `ALL_STUDENTS` (Mahasiswa **dan** SR, tetapi mahasiswa non-SR belum bisa login saat pilot)          |
| Event         | HCO memilih audience, jadwal, lokasi pusat dan radius; default radius **20 m**, bisa diubah                                             |
| Status waktu  | Toleransi terlambat default **15 menit**, bisa diubah per event; klasifikasi final memakai waktu server                                 |
| QR            | QR melekat pada event; infrastruktur challenge/generator dapat dipakai ulang oleh NEED-007                                              |
| Fallback      | SR dapat mengajukan absensi manual; permintaan `PENDING` bukan kehadiran yang sudah disahkan                                            |
| DB runtime    | `DATABASE_URL` = Supabase **Session Pooler**                                                                                            |
| DB migrations | `DIRECT_DB_URL` = direct connection yang diutamakan bila IPv6 tersedia; opsi session pooler harus diuji jika direct tidak dapat dicapai |
| Deployment    | Aplikasi direncanakan di VPS melalui HTTPS; database dikelola Supabase; domain, VPS dan pendanaan belum final                           |

## 2. Peta milestone dan target waktu

**Tanggal berikut adalah target kerja agresif, bukan konfirmasi bahwa pekerjaan sudah selesai.** Jadwal dapat diparalelkan hanya jika perubahan tidak saling bergantung dan ada reviewer.

| Tanggal target | Milestone                                   | Kondisi selesai (gate)                                               | Status awal                                          |
| -------------- | ------------------------------------------- | -------------------------------------------------------------------- | ---------------------------------------------------- |
| **10 Okt**     | F0 Audit scaffold + mulai F1 Supabase       | Struktur repo dipahami; rencana perubahan env/DB disetujui           | **F0 static audit DONE**; F1 **IN PROGRESS (Codex)** |
| **11 Okt**     | F1 Koneksi + migrations; mulai F2 identitas | Koneksi dev berhasil, SQL migration direview, tabel auth tersedia    | TODO                                                 |
| **12 Okt**     | F2 Login/provisioning + F3 RBAC             | SR dummy login NIM; signup publik mati; izin HCO/KADIV diuji         | TODO                                                 |
| **13 Okt**     | F4 Event & reusable QR                      | HCO buat event/QR; audience dan challenge diverifikasi backend       | TODO                                                 |
| **14 Okt**     | F5 Check-in + geofence                      | SR bisa scan satu kali; status PRESENT/LATE & radius tervalidasi     | TODO                                                 |
| **15 Okt**     | F6 Manual attendance + reporting            | Pengajuan/approval/koreksi, riwayat dan ekspor berjalan              | TODO                                                 |
| **16 Okt**     | F7 Integrasi UI + automated tests           | Happy path dan failure cases lulus di staging                        | TODO                                                 |
| **17 Okt**     | F8 UAT lapangan + deployment rehearsal      | HTTPS, backup, UAT HCO, revisi blocker P0, go/no-go                  | TODO                                                 |
| **18 Okt**     | **Controlled pilot NEED-001**               | Persetujuan PM + HCO; bisa dipakai SR sungguhan tanpa blocker kritis | TODO                                                 |

**Cutline:** Bila konfigurasi akun/HTTPS atau aturan lokasi belum siap pada 17 Oktober, **jangan** memaksa live pilot dengan credential atau location check yang tidak aman. Gunakan staging/UAT terbatas dan ubah target rilis berdasarkan keputusan PM.

## 3. Rencana fase dan Definition of Done

### F0 — Audit & baseline repository (static audit: DONE; runtime check: sebagian)

**Auditor:** reviewer teknis. **Diketahui:** scaffold tersedia di GitHub, `pnpm run dev` sudah berhasil menurut PM (awalnya dengan Bun sebagai package manager; sekarang memakai pnpm). **Belum diverifikasi:** build/test/migration aktual.

- [x] Cek struktur `apps/web`, `apps/server`, `packages/api`, `packages/auth`, `packages/db`, Turborepo, Bun, Docker, Varlock.
- [x] Temukan bahwa scaffold masih menyediakan sign-up publik, email/password, dan Docker PostgreSQL lokal.
- [ ] Catat SHA commit baseline dan uji `pnpm run check-types`, `pnpm exec biome check .` (read-only), `pnpm run build`.
- [ ] Perbarui dokumentasi scaffold: `docs/setup.md` masih berisi flag `--yes` yang tidak kompatibel dengan explicit stack flags.

**Gate F0:** tidak melakukan scaffold ulang atau refactor yang tidak diperlukan.

### F1 — Supabase development, environment & Drizzle migrations (IN PROGRESS)

**Manual — PM:** project Supabase Development **sudah dibuat**; URL Session Pooler dimasukkan ke `DATABASE_URL`, Direct ke `DIRECT_DB_URL` (nilai rahasia jangan disalin ke Git/chat).

**Codex — implementasi:**

- [ ] Audit Varlock `apps/server/.env.schema`, `packages/db/.env.schema`, `packages/db/drizzle.config.ts`, `packages/db/src/index.ts`.
- [ ] Runtime Drizzle/Better Auth menggunakan `DATABASE_URL` dari backend. Tidak menambahkan Supabase JS client/Auth ke frontend.
- [ ] Drizzle Kit memilih `DIRECT_DB_URL` untuk migrasi saat koneksi tersedia; dokumentasikan fallback Session Pooler yang sudah diuji bila IPv6 direct tidak tersedia.
- [ ] Sesuaikan Compose: PostgreSQL Docker tetap opsional untuk lokal; deployment web/server **tidak** mewajibkan container database lokal.
- [ ] Sediakan verifikasi koneksi **read-only** (`SELECT 1`) dan contoh variabel tanpa secret. Jangan menampilkan URL yang memuat password.
- [ ] Review SQL migration auth terlebih dahulu, baru jalankan migration **development** setelah izin PM; verifikasi tabel melalui Supabase.
- [ ] Pisahkan environment dev/prod dan gunakan least-privilege credential jika memungkinkan; jangan pernah uji destruktif pada production.

**Gate F1:** backend sukses `SELECT 1`, migration versioned dapat diulang dari DB development kosong, `pnpm run dev` tetap berjalan. Belum perlu skema domain NEED-001.

### F2 — Identitas SR, login NIM & provisioning (TODO)

**Codex:**

- [ ] Aktifkan Better Auth Username Plugin agar `username=NIM` dan login NIM/password, bukan email/password di UI.
- [ ] Matikan **server-side** public sign-up; hapus UI sign-up, dan uji request langsung ke endpoint signup ditolak.
- [ ] Tambahkan tabel/profil SR dan lookup departemen, gedung, jabatan serta status aktif; migrasi versioned.
- [ ] Siapkan skrip import **privileged** dari data SR/gedung yang nanti diberikan PM; validasi NIM unik, relasi satu departemen/satu gedung, jabatan, dan duplikasi.
- [ ] Akun awal memakai password sementara acak yang kuat, hashing melalui Better Auth, distribusi privat, dan kebijakan ganti password pertama.
- [ ] Tentukan strategi email yang sah untuk Better Auth; **jangan** otomatis membuat alamat email palsu untuk pengiriman reset.
- [ ] Uji login, logout, session refresh, akun tidak aktif, NIM tidak dikenal, rate limiting dasar.

**Manual — PM:** serahkan format roster/gedung **melalui kanal aman**, setujui strategi email dan distribusi password. Jangan masukkan identitas asli ke fixture GitHub.

**Gate F2:** SR dummy berhasil login; pengguna tanpa provisioning tidak dapat mendaftar/login; tidak ada password plaintext di log/database/repo.

### F3 — Server-side authorization & audience (TODO)

- [ ] Implementasikan action permissions yang **deny-by-default**, bukan sekadar hide/show menu.
- [ ] HCO member: buat/ubah event, issue QR, lihat rekap, ekspor.
- [ ] **Hanya** `SR + department=HCO + position=KADIV` yang dapat approve/reject manual dan koreksi attendance.
- [ ] SR lain: daftar event eligible, scan, buat manual request sendiri, lihat histori sendiri.
- [ ] Satu primary actor per akun; `KADIV` audience cocok untuk semua KADIV SR lintas departemen.
- [ ] `ALL_STUDENTS` mencakup aktor SR dan Mahasiswa secara semantik; pada pilot UI diberi batasan bahwa hanya SR memiliki akses login.
- [ ] Uji akses negatif: SR biasa, HCO bukan KADIV, KADIV non-HCO, dan unauthenticated.

**Gate F3:** semua protected tRPC procedures menguji session **dan** role/position/department/resource ownership di backend.

### F4 — Event management & reusable QR challenge (TODO)

- [ ] Skema event dengan creator, title, jadwal, audience, lokasi pusat, radius default 20m, toleransi telat 15 menit, dan status lifecycle.
- [ ] CRUD event khusus HCO, input tervalidasi Zod, kebijakan perubahan/pembatalan saat sudah ada absensi.
- [ ] Audience predicate satu sumber dipakai pada list/detail **dan** check-in.
- [ ] Modul QR menghasilkan token acak berumur pendek yang **terikat event**, tersimpan aman/hash bila perlu, diverifikasi dan dapat dicabut/dirotasi.
- [ ] Pisahkan QR issuance/verification dari aturan absensi sehingga NEED-007 bisa menggunakan engine sama nanti, tanpa mengimplementasikan NEED-007 sekarang.
- [ ] UI minimal HCO: form create event, detail, QR tampil, state loading/error/expired.

**Gate F4:** HCO dapat membuat event dummy yang eligible; QR event A tidak dapat digunakan untuk event B atau setelah dicabut/expired.

### F5 — QR check-in, waktu & geofence (TODO)

- [ ] SR scan QR melalui browser mobile dan mengirim lokasi dengan izin pengguna (HTTPS pada staging/production).
- [ ] Backend memvalidasi token, session, audience, event state/window, accuracy, radius dan status aktif; tidak mempercayai lokasi/waktu yang dihitung frontend.
- [ ] Default radius **20m** dan late tolerance **15 menit**, masing-masing editable per event.
- [ ] Penentuan `PRESENT`/`LATE` berdasarkan waktu server dan kebijakan jendela check-in yang telah disahkan HCO.
- [ ] DB constraint `UNIQUE(event_id,user_id)`; retry/concurrent scan tidak menghasilkan attendance ganda.
- [ ] Error state eksplisit untuk invalid QR, expired QR, GPS ditolak/kurang akurat, di luar radius, session habis, koneksi putus.
- [ ] Jangan simpan histori GPS kontinu; catat hanya bukti minimum yang disetujui.

**Gate F5:** successful/late/duplicate/outside-radius/expired-token diuji otomatis; GPS buruk selalu menawarkan jalur permintaan manual ketika eligible.

### F6 — Manual attendance, history, recap & export (TODO)

- [ ] SR membuat manual request dengan alasan dan status `PENDING` / `APPROVED` / `REJECTED`; pending **tidak** dihitung hadir.
- [ ] KADIV HCO review, menyetujui/menolak dengan alasan dan timestamp; approval/correction atomik dan memiliki audit immutable before/after.
- [ ] Koreksi tidak menghapus histori; scan bersamaan dengan approval tidak menciptakan record ganda.
- [ ] SR melihat histori event dan hasil absensinya sendiri, termasuk status pengajuan manual.
- [ ] Anggota HCO melihat daftar hadir per event dan ekspor CSV (kolom/filter sensitif perlu disahkan HCO); anggota non-HCO tidak bisa ekspor.
- [ ] Uji role negatif, double-approval, race condition, dan audit trail.

**Gate F6:** alur HCO buat event → SR scan/manual → KADIV review → HCO lihat/ekspor berfungsi end-to-end.

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

| ID          | Yang harus dipastikan                                                                | Pemutus        | Paling lambat    |
| ----------- | ------------------------------------------------------------------------------------ | -------------- | ---------------- |
| `OPEN-001`  | Mulai/akhir jendela scan; boleh datang sebelum event dimulai? setelah selesai?       | HCO + PM       | Sebelum F5       |
| `OPEN-002`  | Masa aktif QR, rotasi, cara display, revocation                                      | HCO + RnD      | Sebelum F4 final |
| `OPEN-003`  | Titik koordinat pusat, rentang radius, ambang akurasi GPS, fallback untuk radius 20m | HCO + PM       | Sebelum F5/UAT   |
| `OPEN-004`  | Batas pengajuan manual, bukti wajib, kebijakan status PRESENT/LATE dari approval     | KADIV HCO + PM | Sebelum F6       |
| `OPEN-005`  | Data roster SR/gedung/jabatan, validasi keaktifan dan format import                  | PM             | Sebelum F2 nyata |
| `OPEN-006`  | Email untuk Better Auth, penyaluran password dan pemulihan akun                      | PM + RnD       | Sebelum F2 nyata |
| `OPEN-007`  | Perubahan jabatan/departemen setelah event: eligibility snapshot atau live           | PM + HCO       | Sebelum F4/F5    |
| `OPEN-008`  | Kolom ekspor, filter, privasi, data retention                                        | HCO + PM       | Sebelum F6       |
| `INFRA-001` | VPS/domain/subdomain/HTTPS dan biaya disetujui                                       | PM + DevOps    | Sebelum F8       |

Terapkan implementasi teknis yang tidak bergantung pada keputusan di atas lebih dulu; **jangan menyamarkan usulan teknis sebagai kebijakan yang disetujui**.

## 5. Batas MVP dan pekerjaan yang ditunda

**Wajib untuk pilot:** login SR aman; import/provisioning; RBAC HCO/KADIV; event & audience; QR event-bound; check-in + geofence + late; pengajuan dan persetujuan manual; histori SR; rekap/ekspor HCO; HTTPS, audit dan UAT.

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
- [ ] Event, QR challenge TTL/revoke, scan, aturan jam & geofence sesuai keputusan HCO.
- [ ] Duplikasi/retry/race condition tidak menggandakan kehadiran.
- [ ] Pengajuan manual, approve/reject dan koreksi menghasilkan audit yang utuh.
- [ ] SR bisa melihat histori sendiri; HCO bisa rekap dan ekspor tanpa bocor lintas role.
- [ ] Mobile QR/GPS diuji nyata melalui HTTPS; fallback tersedia untuk lokasi tidak akurat.
- [ ] CI, typecheck, build, tes acceptance dan security lulus.
- [ ] Reverse proxy, backup/restore, monitoring, deployment rollback tersedia.
- [ ] HCO menyetujui business rules & UAT; PM menyetujui rilis 18 Oktober.

---

**Kaidah keberhasilan:** targetnya **usable and safe SR attendance pilot**, bukan sekadar halaman tampil atau QR berhasil di-generate. Semua status pekerjaan perlu diperbarui dari hasil nyata, bukan dari tabel rencana ini.
