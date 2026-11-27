# Penilaian & Analitik SR — Rencana Fase dan Panduan Eksekusi

**Disusun:** 27 November 2026 (WIB) · **Modul:** P1-01 Penilaian & Analitik (`RSA-5`)  
**Branch kerja tunggal:** `feat/modul-penilaian-sr`  
**Status:** Fase F0 (dokumentasi baseline, PRD modul, pemetaan 37 FR 27/11/2026, audit commit `attendance-points` dari `origin`, dan penguncian keputusan D01/D02/D03/D05) selesai disusun. Fase runtime F1–F8 dikerjakan bertahap dengan **satu commit terverifikasi per fase/backlog** di branch `feat/modul-penilaian-sr`.

Dasar perilaku: [PRD modul Penilaian](prd.md), [FR Modul Sistem — P1-01 Penilaian & Analitik](https://docs.google.com/spreadsheets/d/1oDqX5oEaxT7wscJVUJHIsRL_y6rlSXeiVOiDTx2hr2Y/edit#gid=0), dan [Pedoman Pembuatan Website Penilaian Senior Resident (SR)](https://docs.google.com/document/d/1u197d9Oc9rMYkhFSkvo6Gv_DOCrQfMyiJhn9FeKyg8o/edit).

---

## 1. Urutan fase, dependensi, dan gate persetujuan

Seluruh fase dikerjakan pada satu branch **`feat/modul-penilaian-sr`** dengan komit kecil yang terverifikasi per fase. Bagian yang bergantung pada keputusan proses bisnis `TBD` pada [PRD §7](prd.md#7-keputusan-yang-harus-dikunci-decision-gates-d01d10) diisolasi; bagian yang sudah memiliki aturan `Approved` yang jelas dapat dikerjakan lebih dulu.

| Fase | Cakupan & hasil yang dapat direview | FR / Issue terkait | Gate masuk & dependensi |
| --- | --- | --- | --- |
| **F0 — Dokumentasi & PRD Modul** | **Selesai di branch `feat/modul-penilaian-sr`:** PRD modul (`docs/modules/penilaian/prd.md`), rencana fase (`docs/modules/penilaian/roadmap.md`), pembaruan snapshot P1-01 (36 Approved, 1 Pending) pada `docs/prd.md`, `docs/architecture.md`, `docs/module-data-ownership.md`, dan `docs/MANIFEST.json`. | `FR-EVAL-001`–`037` / `RSA-5` | Inspeksi spreadsheet `FR Modul Sistem` (27/11/2026), `Pedoman Penilaian SR` (27/11/2026), dan kontrak modul existing. |
| **F1 — Fondasi Skema, Periode Evaluasi & Policy Akses** | Skema Drizzle `packages/db/src/schema/penilaian.ts` (tabel `evaluation_*` dengan RLS & trigger audit append-only), registrasi kepemilikan tabel di `packages/config/src/architecture.ts`, kontrak publik sempit di `identity.public.ts` / `events.public.ts` bila diperlukan, policy otorisasi (`penilaian-policy.ts`), serta CRUD periode evaluasi, jadwal instrumen, dan konfigurasi ambang opsional (`nullable`). | `FR-EVAL-001`, `011`, `013`, `028`, `030` / `RSA-5`, `RSA-27`, `RSA-28` | Delegasi teknis Nafi/Codex (D01). Isolasi ambang `FR-EVAL-028` sebagai `nullable` (D08). Tanpa migrasi ke DB remote sebelum izin eksplisit. |
| **F2 — Penilaian Event & Penilaian Departemen** | Pengaitan/klasifikasi event evaluasi (`ANNUAL` 25%, `MONTHLY` 10%, `WEEKLY` 10%), pengiriman penilaian event 4 indikator (`0–100`) oleh evaluator roster (anti self-eval, anti duplikat), pengiriman penilaian departemen triwulanan (25%, 4 indikator `0–100`) khusus `KADEP` struktural (`SEKDEP` ditolak), serta pembacaan kiriman sendiri. | `FR-EVAL-003`–`006`, `014`, `016`, `018`, `031`, `032` / `RSA-5` | Fondasi F1 selesai; konfirmasi pemetaan evaluator roster event (D02) dan penilai departemen untuk subjek KADEP/INTI (D03). |
| **F3 — Impor, Pratinjau & Deduplikasi GForm (SR/Maba & Eksternal)** | Parser & validator impor file untuk GForm SR/Maba (20 pertanyaan skala 1–5, bobot 50%, validasi gedung sama & non-self) dan Evaluasi Eksternal ASUS/Ditmawa (10 pertanyaan skala 1–5, skor 10–50 terpisah); endpoint `previewImport` (ringkasan valid/invalid/duplikat per baris) dan `confirmImport` atomik tanpa partial import tak terkontrol; penyimpanan respons individual dengan redaksi identitas responden & komentar untuk non-HCO. | `FR-EVAL-006`, `010`, `015`–`018`, `033` / `RSA-11` | Fondasi F1 selesai; konfirmasi aturan agregasi bila >1 GForm triwulanan dalam satu periode (D04) dan isolasi visibilitas komentar/identitas responden hanya untuk HCO (D07). |
| **F4 — Poin Kehadiran & Transaksi Poin Tambahan/Pengurangan** | Integrasi pembacaan poin kehadiran dari modul Attendance RESORA sebagai sumber utama + fallback input manual/impor teraudit untuk kegiatan historis/Sidak (tanpa mengubah perilaku Attendance F1–F3 existing dan tanpa mengaktifkan 5K yang masih pending); serta workflow pengajuan poin tambahan/pengurangan oleh `KADEP` dan persetujuan/penolakan oleh `HCO`/`Inti` beserta perhitungan `Total Poin Bersih`. | `FR-EVAL-008`, `009`, `014`, `034`, `035` / `RSA-5` | Fondasi F1 selesai; batasan rekonsiliasi Attendance F1–F3 vs Pedoman §7 (D05). |
| **F5 — Engine Rekapitulasi Berbobot, Kelengkapan, Finalisasi & Revisi Berversi** | Perhitungan presisi penuh `Nilai Total` berbobot tanpa batas maksimum 100; evaluator kelengkapan komponen wajib (`BELUM_TERSEDIA`, `BELUM_LENGKAP`, `SIAP_DIFINALISASI`, `FINAL`); blokir finalisasi bila ada komponen wajib belum lengkap; gate visibilitas pra-final (hanya HCO & Inti); koreksi nilai beralasan dengan audit `beforeState`/`afterState`; serta pembukaan revisi (`openRevision`) pasca-final yang menghasilkan versi hasil baru (`version + 1`). | `FR-EVAL-002`, `004`–`007`, `011`, `012`, `019`, `020`, `029`, `037` / `RSA-5` | F2, F3, dan F4 tersedia (atau dapat diuji secara terisolasi per komponen wajib yang terdaftar pada periode). |
| **F6 — Analitik Modul, Rekap Pribadi, Ekspor & Kontrak Dashboard RESORA** | Endpoint analitik modul (`statistics` / distribusi / perbandingan dengan filter server-side periode, departemen, gedung); endpoint rekap pribadi SR pasca-final (`ownSummary`); ekspor CSV/XLSX sesuai scope & proyeksi kolom hak baca pemanggil (tanpa identitas penilai/komentar bagi non-HCO); serta prosedur ringkasan sumber untuk kartu Penilaian pada P1-04 Dashboard Utama RESORA (`FR-DASH-003`). | `FR-EVAL-021`–`027`, `030`, `FR-DASH-003` / `RSA-13`, `RSA-15`, `RSA-28` | F5 selesai; konfirmasi denominator persentase kelengkapan kartu Dashboard (D09) dan pemetaan scope Pimpinan SR/Ditmawa (D06). |
| **F7 — Frontend Workspace Penilaian (`/penilaian`) & Integrasi Dashboard** | Implementasi UI di `apps/web/src/features/penilaian/` dan route `apps/web/src/app/(authenticated)/penilaian/` sesuai [Design System RESORA v1.1](../../design-system.md): tampilan adaptif per role (rekap pribadi SR pasca-final, form penilaian event & departemen, panel HCO untuk periode/impor pratinjau/persetujuan poin/finalisasi/revisi, analitik, dan ekspor), serta penyambungan kartu Penilaian di `/dashboard`. | Seluruh FR UI P1-01 & `FR-DASH-003` | Kontrak tRPC F1–F6 stabil; verifikasi browser lokal dengan data sintetis sesuai otorisasi tetap PM (2026-11-26). |
| **F8 — Hardening Keamanan, Regresi & Paket UAT PM** | Pengujian menyeluruh AC01–AC12: negative test otorisasi (kebocoran pra-final, kebocoran identitas penilai/komentar, manipulasi filter scope, penolakan `SEKDEP` pada penilaian departemen, penolakan finalisasi saat belum lengkap, penolakan edit pasca-final tanpa buka revisi, race condition & idempotensi impor/penilaian), pemeriksaan `check:architecture`, `check-types`, `lint`, `test:offline`, dan penyiapan skrip UAT PM. | AC01–AC12 / `RSA-5`, `RSA-11`, `RSA-13`, `RSA-15` | F1–F7 selesai; persetujuan lingkungan oleh Nafi/PM sebelum migrasi remote atau staging UAT (D10). |

---

## 2. Aturan eksekusi lintas fase di `feat/modul-penilaian-sr`

1. **Satu branch kerja:** Seluruh perubahan dokumentasi, skema, backend API, komponen frontend, dan pengujian untuk modul Penilaian dikerjakan di branch `feat/modul-penilaian-sr`.
2. **Jangan mengarang aturan bisnis TBD/Pending:**
   - Jangan mengimplementasikan fitur komentar anonim mandiri (`FR-EVAL-036` Pending) atau mengekspos komentar ke `SUPERADMIN` sebelum D07 diputuskan.
   - Jangan membuat angka ambang batas kinerja (`FR-EVAL-028`) otomatis bila HCO belum mengaturnya.
   - Jangan mengaktifkan pemetaan alasan izin `5K` (`FR-EVAL-008`, `034`) sebelum definisi resmi 5K diberikan.
   - Jangan membangun kuesioner in-app P3-01/P3-02; gunakan alur impor GForm untuk `FR-EVAL-015`/`033` dan `FR-EVAL-010`.
3. **Jaga batas arsitektur (`ADR 0006` & `check-architecture.ts`):**
   - Daftarkan seluruh tabel `evaluation_*` ke `tableOwners` di `packages/config/src/architecture.ts` dengan owner `"penilaian"`.
   - Semua komunikasi lintas domain (`identity`, `events`, `attendance`, `committee`) wajib melalui `*.public.ts` server-only atau `*.contracts.ts` browser-safe.
   - Tambahkan negative test pada pengujian arsitektur untuk memastikan modul lain tidak mengakses tabel `evaluation_*` secara langsung dan `penilaian` tidak mengakses tabel privat modul lain.
4. **Presisi perhitungan & larangan rata-rata sebelum bobot:**
   - Uji secara eksplisit dengan contoh resmi pada `Pedoman §10.2` (Event Tahunan `[90, 100]` → `47,5`; Event Bulanan `[90, 100, 100]` → `29`; Event Mingguan `[80, 90]` → `17`; Departemen `90` → `22,5`; GForm `85` → `42,5`; `Nilai Total = 158,5`).
   - Pastikan nilai kosong/belum masuk menghasilkan status `BELUM_LENGKAP` (`null`), tidak pernah `0`.

---

## 3. Panduan per fase implementasi

### Fase F1 — Fondasi Skema, Periode Evaluasi & Policy Akses

- **File utama yang disentuh:**
  - `packages/db/src/schema/penilaian.ts`, `packages/db/src/schema/penilaian.test.ts`, `packages/db/src/schema/index.ts`
  - `packages/config/src/architecture.ts` (registrasi `tableOwners` untuk tabel `evaluation_*`)
  - `packages/api/src/modules/penilaian/penilaian.contracts.ts`, `penilaian-policy.ts`, `penilaian.service.ts`, `penilaian.router.ts`, `penilaian.public.ts`
  - `packages/api/src/routers/index.ts`
- **Deliverable & verifikasi:**
  - Tabel periode evaluasi (`evaluation_periods`) terikat ke `sr_periods.id`, menyimpan status (`BELUM_TERSEDIA`, `BELUM_LENGKAP`, `SIAP_DIFINALISASI`, `FINAL`, `REVISING`), `version` (default `1`), jadwal per jenis evaluasi, dan ambang kinerja opsional (`performanceThreshold` nullable).
  - Tabel audit append-only (`evaluation_audits`) dengan constraint non-blank `reason` dan trigger pemblokir `UPDATE`/`DELETE`/`TRUNCATE`.
  - Unit test skema, kontrak Zod, policy akses per role (HCO, Inti, KADEP, Sekdep, SR, SUPERADMIN, SYSTEM_ADMIN), serta `pnpm check:architecture`.

### Fase F2 — Penilaian Event & Penilaian Departemen

- **Deliverable & verifikasi:**
  - Pendaftaran/klasifikasi event ke periode evaluasi dengan kategori `ANNUAL` (`25%`), `MONTHLY` (`10%`), atau `WEEKLY` (`10%`).
  - Pengiriman nilai event 4 indikator (`komitmen`, `teamwork`, `sikap`, `kontribusi`, masing-masing integer/numerik `0–100`), validasi keanggotaan evaluator & target dalam roster event, penolakan *self-evaluation* (`evaluatorUserId !== targetUserId`), dan unique constraint `(evaluationEventId, evaluatorUserId, targetUserId)`.
  - Pengiriman penilaian departemen triwulanan (bobot `25%`, 4 indikator `0–100`) khusus oleh `KADEP` struktural untuk anggota departemennya pada periode tersebut; penolakan `SEKDEP` dan `ANGGOTA`.

### Fase F3 — Impor, Pratinjau & Deduplikasi GForm (SR/Maba & Eksternal)

- **Deliverable & verifikasi:**
  - Validasi dan pratinjau impor GForm SR/Maba (20 jawaban integer `1–5`, total `20–100`, validasi gedung target SR dan non-self) serta GForm Eksternal ASUS/Ditmawa (10 jawaban integer `1–5`, total `10–50`, disimpan terpisah).
  - Deduplikasi berdasarkan `(periodId, sourceType, respondentKey, targetUserId)` dan penyimpanan atomik seluruh baris valid saat dikonfirmasi.
  - Redaksi field `respondentKey`/`respondentName` dan `comment` untuk seluruh pembaca non-HCO.

### Fase F4 — Poin Kehadiran & Transaksi Poin Tambahan/Pengurangan

- **Deliverable & verifikasi:**
  - Konsumsi poin kehadiran dari kontrak publik `attendance` ditambah pencatatan fallback manual/impor teraudit oleh HCO untuk kegiatan historis/Sidak (dengan konfigurasi poin maksimal Sidak).
  - Pengajuan transaksi poin (`ADDITION` | `DEDUCTION`) oleh `KADEP` (`PENDING`), verifikasi/keputusan (`APPROVED` | `REJECTED`) oleh `HCO` atau `Inti`, audit keputusan, dan kalkulasi `Total Poin Bersih` hanya dari transaksi `APPROVED`.

### Fase F5 — Engine Rekapitulasi Berbobot, Kelengkapan, Finalisasi & Revisi Berversi

- **Deliverable & verifikasi:**
  - Kalkulator murni (*pure calculation engine*) yang teruji terhadap contoh `Pedoman §10.2` (`158,5`) dan kasus batas (komponen belum lengkap → `null` & `BELUM_LENGKAP`, tanpa konversi ke `0`).
  - Prosedur `finalizePeriod` (hanya HCO/SUPERADMIN, gagal dengan `PRECONDITION_FAILED` / `EVALUATION_INCOMPLETE` bila ada komponen wajib belum lengkap).
  - Prosedur `correctScore` (wajib `reason` & audit `beforeState`/`afterState`; ditolak bila periode `FINAL` dan belum dibuka revisi) dan `openRevision` (wajib `reason`, menaikkan versi saat difinalisasi ulang).

### Fase F6 — Analitik Modul, Rekap Pribadi, Ekspor & Kontrak Dashboard RESORA

- **Deliverable & verifikasi:**
  - Prosedur analitik (`statistics`), rekap pribadi (`ownRecap`), daftar/detail (`recapList`, `memberDetail`), ekspor (`exportRecap`), dan ringkasan kartu Dashboard (`dashboardSummary`).
  - Penegakan gate pra-final vs final dan pemangkasan field sensitif di level presenter server.

### Fase F7 & F8 — Frontend Workspace (`/penilaian`), Integrasi Dashboard & Hardening UAT

- **Deliverable & verifikasi:**
  - Halaman `/penilaian` yang mengikuti token warna, tipografi Plus Jakarta Sans, layout responsif (bottom nav mobile/tablet & sidebar desktop), touch target $\ge 44\text{px}$, dan state loading/empty/error/forbidden pada [Design System RESORA v1.1](../../design-system.md).
  - Verifikasi CLI (`check:architecture`, `check-types`, `lint`, `test:offline`) dan verifikasi browser lokal dengan data sintetis.
