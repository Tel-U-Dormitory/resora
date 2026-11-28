# Modul Manajemen DT — Rencana Fase MVP

**Disusun:** 28 November 2026 (WIB) · **Modul:** P2-04 Manajemen DT  
**Acuan perilaku:** [PRD Modul Manajemen DT](prd.md) & [FR Modul Sistem — P2-04 Manajemen DT](https://docs.google.com/spreadsheets/d/1oDqX5oEaxT7wscJVUJHIsRL_y6rlSXeiVOiDTx2hr2Y/edit#gid=204)

| Fase | Cakupan | Deliverable |
| --- | --- | --- |
| **D0 — PRD & Arsitektur** | Penyusunan PRD modul DT, pembaruan baseline dokumen sistem (`prd.md`, `module-data-ownership.md`, `MANIFEST.json`) | `docs/modules/dt/prd.md`, `docs/modules/dt/roadmap.md` |
| **D1 — Skema DB & Migrasi Aditif** | Enum `actor_type` tambah `'DT'`, tabel `dt_memberships`, `dt_assignment_histories`, `dt_audits` (RLS + trigger audit append-only), relasi `committee_members.user_id` ke `user_profiles`, dan registrasi kepemilikan tabel di `architecture.ts` | `packages/db/src/schema/dt.ts`, migrasi SQL baru |
| **D2 — Auth, Identity & Policy** | Resolusi sesi `actor = 'DT'` berdasarkan keanggotaan aktif (`getActiveIdentity`), error login khusus masa aktif DT berakhir, policy `canManageDt` (`ADAPTIF` + `SUPERADMIN`), dan kontrak publik `identity.public.ts` | `packages/auth/src/sr-access.ts`, `packages/auth/src/index.ts`, `packages/api/src/modules/identity/` |
| **D3 — Modul Backend `dt` & Integrasi** | Service/router `dt` (daftar/filter, daftar calon, review/aktivasi/penolakan, perpanjang/akhiri/arsipkan, kelola penugasan, reset password DT, portal `myMembership`, rekap kehadiran & kepanitiaan), plus dukungan kandidat `DT` di `committee`, `events`, dan `attendance` | `packages/api/src/modules/dt/`, integrasi `committee`/`events`/`attendance` |
| **D4 — Frontend Workspace `/dt` & Portal DT** | Workspace `/dt` (mode pengelola untuk `ADAPTIF`/`SUPERADMIN`, mode portal status/riwayat/kepanitiaan untuk `DT`), integrasi sidebar/bottom nav/akses cepat, adaptasi halaman `/events`, `/attendance/history`, `/profile`, `/dashboard` untuk `DT`, serta dukungan badge peran `DT` pada kepanitiaan | `apps/web/src/features/dt/`, `apps/web/src/app/(authenticated)/dt/` |
| **D5 — Pengujian & Verifikasi Lokal** | Unit test kontrak/policy/service/UI, `check:architecture`, `lint`, `check-types`, `test:offline`, seeding data sintetis lokal, serta verifikasi browser lokal (desktop & mobile, light & dark) untuk role `ADAPTIF` dan `DT` | Test suite & laporan verifikasi |
