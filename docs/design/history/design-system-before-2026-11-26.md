> **SUPERSEDED — historis, bukan aturan aktif.** Digantikan oleh [Design System RESORA](../../design-system.md) pada 26 November 2026. Simpan hanya sebagai bukti arah lama; tautan relatif di salinan lama mungkin tidak berlaku.

# Panduan Baseline Desain UI/UX RESORA

> **Baseline Resmi Desain Antarmuka RESORA**  
> Mengadopsi bahasa desain konsol PaaS modern **Google AI Studio** (`https://aistudio.google.com/`), dipadukan dengan identitas warna brand merah khas **RESORA Telkom University**.

---

## 1. Filosofi & Karakteristik Desain

Desain RESORA dibangun atas prinsip **Operate Mode** (fokus pada penyelesaian tugas, densitas informasi yang tenang, kejelasan status, dan keandalan data). Tampilan ini mengeliminasi elemen dekoratif berlebihan, animasi lambat, atau bayangan tebal, dan menggantinya dengan:

1. **Tonal Surface Stepping**: Elevasi visual tidak menggunakan drop-shadow tebal, melainkan tingkatan warna permukaan (surface layers) bertingkat yang tenang.
2. **Hairline Dividers (`1px`)**: Pemisah konteks yang sangat tipis dan presisi (`divide-border`, `border-border/70`) untuk memandu mata pengguna tanpa memecah konsentrasi.
3. **Pill-Shaped Affordances**: Navigasi, kategori filter, status badge, dan tombol aksi utama menggunakan bentuk pill (`rounded-full` atau `rounded-xl`) khas konsol Google AI Studio.
4. **Tipografi Teratur & Tabular Numbers**: Font sans-serif yang tajam dengan skala ukuran fixed-rem (bukan fluid scale yang mengecil tak teratur), serta penataan angka tabular/monospace untuk NIM, tanggal, kode, dan koordinat GPS.
5. **Brand Red Accent**: Aksen merah RESORA (`#d93025` pada mode terang, `#ea4335` pada mode gelap) digunakan secara selektif untuk aksi primer, status penanda aktif, dan identitas brand, sementara kanvas dan surface tetap netral.

---

## 2. Arsitektur Informasi & Tata Letak (App Shell)

Konsol RESORA terbagi dalam struktur 3 lapisan utama:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ TOP APPLICATION BAR (Tinggi 64px / h-16)                                               │
│ [Sidebar Toggle]  │  [Pill Breadcrumb: RESORA / • Nama Halaman]  │  [Role Pill] [Theme] │
├───────────────────┼────────────────────────────────────────────────────────────────────┤
│ LEFT NAV RAIL     │ CENTER CONSOLE STAGE                                               │
│ (Lebar 240px)     │ ────────────────────────────────────────────────────────────────── │
│ - Logo RESORA.    │ 1. Page Header (Judul Halaman + Deskripsi Singkat + Tombol Utama) │
│ - Section labels  │ 2. Studio Toolbar (.resora-studio-toolbar: Search + Filter Dropdown│
│ - Nav pills       │ 3. KPI Metrics (.resora-studio-kpi strip atau Capability Cards)   │
│ - Bottom dock     │ 4. Workspace Data Table / Form Cards (border-border/70 border-b)   │
│   (User Profile)  │ 5. Paging & Action Footers                                         │
└───────────────────┴────────────────────────────────────────────────────────────────────┘
```

### A. Top Application Bar
- **Posisi**: Tersemat di bagian atas (`sticky top-0 z-40`), tinggi `64px` (`h-16`).
- **Kiri**: Tombol `SidebarTrigger` berbentuk bulat (`size-8.5 rounded-full`) dengan border halus.
- **Tengah**: Pill konteks terintegrasi `RESORA / • {Judul Section}` (`rounded-full border border-border bg-muted/40 px-3 py-1 text-xs`).
- **Kanan**: Badge role monospaced berbentuk pill (misal: `SUPERADMIN`, `SR`) dan tombol `ModeToggle` bulat (`size-8.5 rounded-full`).

### B. Left Navigation Rail (Sidebar)
- **Lebar**: `240px` (desktop), dapat dilipat (collapsible).
- **Header**: Logo `RESORA.` disertai badge mono `Studio` di sampingnya.
- **Group Headers**: Teks uppercase berukuran kecil (`11px`), berbobot tebal (`font-bold`), warna muted (`text-muted-foreground/80`), berjarak vertikal teratur (`UMUM`, `DEPARTEMEN`, `ADMINISTRASI`).
- **Nav Links**: Berbentuk pill membulat penuh (`h-9 rounded-full px-3.5`), teks rapi `text-[13px]`, dengan state aktif berwarna permukaan lembut (`bg-primary-soft text-primary-soft-foreground font-medium`).
- **Bottom Dock**: Kartu profil pengguna tersemat di bawah, memuat avatar inisial bulat, nama lengkap, jabatan, dan role.

### C. Center Console Stage
- **Toolbar Studio (`.resora-studio-toolbar`)**: Wadah terpisah di atas tabel atau daftar, menggabungkan input pencarian, dropdown `<Select>`, dan tombol refresh/export dalam satu baris fleksibel (`rounded-xl border border-border bg-surface p-2.5`).
- **Data Table**: Menggunakan pemisah baris tipis (`divide-y divide-border`), header kolom muted huruf kecil/title-case (`text-[11px] font-medium text-muted-foreground`), teks data `text-[13px]`, angka berformat tabular, dan aksi baris berbentuk icon button bulat di sisi kanan.
- **Panel Header**: Setiap kartu formulir atau kartu data memiliki header dengan latar abu-abu sangat lembut dan garis bawah pemisah (`bg-muted/20 border-b border-border/70 px-4 py-3`).

---

## 3. Sistem Token Warna & Elevasi

### Light Theme
- **Canvas / Background**: `#f3f5f8` (Abu-abu kanvas netral lembut Google AI Studio)
- **Surface / Card**: `#ffffff` (Putih murni elevated)
- **Popover / Dropdown**: `#ffffff` (Putih murni dengan border halus)
- **Border**: `#dadce0` (Garis abu-abu terang presisi)
- **Text Primary**: `#1f1f1f` (Hitam arang kontras tinggi)
- **Text Muted**: `#5f6368` / `#64748b`
- **Primary Accent**: `#d93025` (Merah RESORA Studio)
- **Primary Hover**: `#b3261e`
- **Primary Soft (Pills/Badges)**: `#fce8e6` (Merah pastel lembut)
- **Primary Soft Foreground**: `#b3261e`

### Dark Theme
- **Canvas / Background**: `#131314` (Kanvas hitam dalam Google AI Studio)
- **Surface / Card**: `#1e1f20` (Abu-abu permukaan elevated)
- **Popover / Dropdown**: `#282a2c` (Abu-abu popover kontras)
- **Border**: `#3c4043` (Garis abu-abu gelap presisi)
- **Text Primary**: `#e3e3e3` (Putih lembut kontras tinggi)
- **Text Muted**: `#9aa0a6`
- **Primary Accent**: `#ea4335` (Merah terang RESORA Studio)
- **Primary Hover**: `#d93025`
- **Primary Soft (Pills/Badges)**: `rgba(234, 67, 53, 0.15)`
- **Primary Soft Foreground**: `#f28b82`

---

## 4. Komponen & Standar Form Control

1. **Tombol (Buttons)**:
   - Tombol Primer: Berbentuk pill atau rounded-lg (`rounded-lg` atau `rounded-full`), teks semi-tebal (`font-medium text-[13px]`), padding seimbang (`h-9 px-4`).
   - Tombol Sekunder / Outline: Border tipis `border-border`, latar belakang `bg-surface`, hover `bg-muted`.
   - Tombol Aksi Baris: Bulat atau compact (`size-8 rounded-full` atau `size-8 rounded-lg`).
2. **Form Input & Select**:
   - Wadah Input: Tinggi `36px` (`h-9`), border `border-input`, radius `rounded-lg`, teks `text-[13px]`.
   - Label Form: Wajib diletakkan di luar elemen input dengan jarak vertikal tepat `6px` (`space-y-1.5` atau `mb-1.5 block`), teks `text-xs font-medium`.
   - Dropdown Select: Menggunakan satu panah indikator rapi di sisi kanan dengan padding teks yang cukup (`px-3 py-1.5`), teks dipotong rapi (`truncate whitespace-nowrap`).
3. **Modals & Dialogs**:
   - Backdrop: Gelap tembus pandang dengan efek blur halus (`bg-black/55 backdrop-blur-[2px]`).
   - Kontainer: Radius `rounded-2xl`, border `border-border/80`, bayangan `shadow-2xl`.
   - Header & Footer: Wajib memiliki garis pemisah tipis (`border-b` pada header, `border-t` pada footer).
   - Tombol Tutup: Icon silang `✕` bulat di sudut kanan atas.
4. **Status Badges & Pills**:
   - Bentuk pill penuh (`rounded-full px-2.5 py-0.5 text-xs font-medium shrink-0 whitespace-nowrap`).
   - Memiliki dot indikator bulat (`• Aktif`, `• Draft`, `• Belum hadir`).

---

## 5. Aturan Baku untuk AI & Pengembang (Mandatory AI Rules)

Setiap agen AI atau pengembang yang menambahkan fitur, komponen, atau halaman baru di RESORA **WAJIB** mematuhi aturan berikut:

1. **Konsistensi UI Library**:
   - Selalu gunakan komponen dari `@resora/ui` dan `@/components/ui`.
   - Dilarang membuat pustaka komponen dasar baru dari nol (gunakan komposisi komponen yang sudah ada).
2. **Pengecualian Halaman Publik**:
   - Halaman `/` (`welcome-page.tsx`) dan `/login` (`login-form.tsx`) **DILARANG DIUBAH** tanpa instruksi eksplisit dari pengguna.
3. **Pola Konsol Studio**:
   - Halaman daftar data wajib menggunakan `.resora-studio-toolbar` di atas tabel.
   - Panel formulir wajib menggunakan header berdivider tipis (`bg-muted/20 border-b`).
   - Kartu metrik wajib menggunakan strip KPI `.resora-studio-kpi` dengan format angka tabular.
4. **Kerapian Tata Letak (No Overflow & No Collision)**:
   - Pastikan tabel data tidak mengalami clipping atau overflow horizontal di resolusi desktop standar (`1440x900`).
   - Kolom tindakan baris dan badge status tidak boleh terpotong atau wrap menjadi 2 baris (`whitespace-nowrap`).
   - Label form tidak boleh bertumpukan atau menempel langsung dengan batas atas input (wajib beri jarak `space-y-1.5`).
5. **Keamanan & Integritas Data**:
   - Tampilan visual sisi klien bukan batas keamanan (client-side is not a security boundary). Semua validasi, hak akses, kepemilikan data, dan mutasi wajib ditegakkan di sisi server (tRPC router / backend).
   - Dilarang membocorkan data sensitif atau kredensial.
6. **Verifikasi Kualitas (Quality Gates)**:
   - Setiap perubahan antarmuka wajib melewati:
     1. `bun --no-env-file scripts/check-architecture.ts` (Bebas pelanggaran modular monolith).
     2. `pnpm run check` (Linting & formatting Biome).
     3. `pnpm run check-types` (Typecheck TypeScript seluruh paket).
     4. `pnpm run test:offline` (Seluruh 495+ unit/integration test wajib lulus).
     5. Verifikasi visual di browser (`1440x900` Desktop dan `390x844` Mobile).


---

## 7. Referensi Desain Master Figma (Light Mode & Prototype)

Seluruh implementasi antarmuka konsol RESORA mengacu pada desain master resmi di Figma:
- **File Figma URL**: [RESORA Studio — PaaS Console](https://www.figma.com/design/LMmPZy3NLANSCFHkaWddwP/Untitled?node-id=0-1)
- **File Key**: `LMmPZy3NLANSCFHkaWddwP`
- **Halaman Master**: `0:1` (`RESORA Studio — PaaS Console`)
- **Daftar Master Frames (100% Light Mode)**:
  1. `4:2` — `01. Design Tokens & Foundations (Light Mode)` (Palet warna, tipografi Inter, pill badges, buttons)
  2. `4:34` — `P01. Dashboard — Konsol Utama SR (Light Mode)` (Hero card, ongoing event live card, sidebar rail)
  3. `15:2` — `P02. Daftar Event Internal (Light Mode)` (Segmented filter tabs, event grid cards)
  4. `5:159` — `P03. Event Detail & Rekap Kehadiran (Light Mode)` (KPI metrics strip, roster audit table)
  5. `11:2` — `P04. Form Buat Event Baru (Light Mode)` (Two-panel form, geofence radius input, draft controls)
  6. `15:112` — `P05. Scan QR Presensi (Light Mode)` (Scanner viewfinder, live laser bracket, token fallback)
  7. `16:2` — `P06. Riwayat Kehadiran Pribadi (Light Mode)` (Attendance KPI cards, personal check-in history)
  8. `17:2` — `P07. Broadcast & Pengumuman (Light Mode)` (Priority feed cards, urgent pinned banners)
  9. `19:2` — `P08. Kelola Kepanitiaan (Light Mode)` (3-column committee cards, timeline progress)
  10. `5:2` — `P09. Manajemen Akun SR (Light Mode)` (Google AI Studio toolbar, 5-column account table, pagination)
  11. `20:2` — `P10. Periode Menjabat (Light Mode)` (Active academic period hero, demisioner archive table)
  12. `21:2` — `P11. Profil Pengguna SR (Light Mode)` (Resident identity card, credentials & preferences toggles)
  13. `22:2` — `M01. Modal Audit Presensi (Light Mode)` (Translucent backdrop, white modal card, audit trail)
  14. `22:25` — `M02. Modal Buat Pengumuman (Light Mode)` (Translucent backdrop, white modal card, priority dropdown)
- **Interactive Prototype Links**: 124 reaction connections menghubungkan seluruh navigasi sidebar, tombol aksi kontekstual, modal overlay, dan layar proyektor QR live session.
- **Backend Model & UI Realism**:
  - `P01 Dashboard`: Greeting nama & NIM pill, 4 kartu kapabilitas (`Event internal`, `Riwayat kehadiran`, `Kelola event`, `Kelola akun SR`), spotlight kegiatan aktif dengan tombol `Tampilkan QR Sesi ↗`, dan feed pengumuman resmi asrama.
  - `P03 Event Detail & Rekap Kehadiran`: Panel QR Sesi langsung dengan status validitas, token manual (`WP-8921`), tombol `Buka Mode Proyektor ↗`, 4 kartu KPI kehadiran, dan tabel audit presensi.
  - `P04 Form Buat Event Baru`: Pilihan radio `Dorm Hall (Default Asrama)` vs `Pilih Lokasi Lain di Peta` dengan viewport peta vektor, pin acuan, radius geofence lingkaran 50m, serta aksi Simpan Draf/Jadwalkan.
  - `P06 Riwayat Kehadiran Pribadi`: Format Google AI Studio activity stream yang mencerminkan `own-history.tsx` (tab filter segmented `Semua`, `Hadir`, `Belum Hadir`, `Tidak Hadir`; 3 metrik KPI `Total Hadir`, `Terlambat`, `Belum / Absen`; daftar log presensi dengan ikon `CalendarDays`, waktu check-in `CheckCheck`/`Clock3`, tag ketepatan waktu, dan `StatusBadge`).
  - `P08 Kelola Kepanitiaan`: Kartu struktur divisi dinamis yang mencerminkan `committee-list.tsx` (nama, deskripsi, pill `{divisionCount} divisi · {memberCount} anggota`, dan tombol `Lihat dan kelola →`). Tidak ada data fiktif atau over-engineered yang tidak didukung backend.
  - `P09 Manajemen Akun SR`: Kolom tabel yang mencerminkan `account-list.tsx` (`ANGGOTA`, `PENEMPATAN`, `PERIODE`, `STATUS`, `TINDAKAN` dengan aksi `Edit` dan `Reset PW`).
  - `P12 Tampilan QR Presensi Event (Live Session & Projector Mode)`: Layar penuh 1440x900 untuk proyeksi proyektor/podium dengan QR code terpusat, token manual, indikator geofence aktif, dan counter kehadiran real-time.
