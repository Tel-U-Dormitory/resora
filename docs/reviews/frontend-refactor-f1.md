# F1 — design foundation

26 November 2026 · Design System 1.1 · **implemented and locally tested**, UAT PM pending. PM pada chat mengizinkan melanjutkan F2 setelah gate F1 lulus.

## Implementasi

- `apps/web/src/styles/workspace-foundation.css`: semantic canvas/surface/raised/subtle/text/border-control/action/status/focus/destructive tokens, light/dark netral, aliases ke token shadcn existing. Root `:has(.resora-workspace)` mencakup body portals dan berhenti berlaku saat workspace unmounted; tidak mengganti design system dengan sistem paralel.
- `index.css`: radius aliases 12/16/24 dan font workspace, mempertahankan nilai fallback publik; hapus override status workspace lama yang bersaing. Geometri heading 24/28, gutter 16/24/32, page 1440px, form primitive 640px, kontrol 44px/CTA 48px, focus 2px+offset, disabled semantik tanpa opacity-only, kartu tanpa shadow.
- Root layout dan `styles/fonts`: Plus Jakarta Sans variable asli self-hosted melalui next/font/local, display swap, weight 400–700. Lisensi SIL OFL 1.1 lengkap disertakan; SHA256 `89b3fb38aa0d275d7a731d0d817a4f1622b316b4d7fbdedcf02ee9099ff68bc8`. Sumber [Google Fonts](https://github.com/google/fonts/tree/main/ofl/plusjakartasans). Geist/Geist Mono tetap pada publik; preload Jakarta global dimatikan.
- Providers/theme-provider: next-themes existing, preference workspace `resora-workspace-theme` terpisah dari legacy `theme` publik; kunjungan pertama light tanpa mengikuti OS. Bootstrap SSR existing dan layout effect untuk memulihkan preference sebelum client-navigation paint. ModeToggle workspace dan pilihan tema Profil hanya light/dark; opsi system publik tetap ada.
- AppShell hanya meneruskan pembatas opsi tema; tidak mengubah shell/navigation atau business logic pada F1.

Route terdampak: seluruh 16 route authenticated pada audit F0, termasuk portal, kontrol dan state existing. Root/login tetap legacy. Tidak ada dependency/package/icon baru, schema/migration/data/backend/auth/policy/deployment berubah.

## Verifikasi dan bukti

- `bun --no-env-file test apps/web/src/config/navigation.test.ts apps/web/src/components/quick-action-layout.test.ts apps/web/src/tests/workflows/interaction-ux.test.ts apps/web/src/features/landing/welcome-page.test.ts`: **35 pass, 0 fail, 658 assertions**.
- TypeScript `tsc --noEmit` di apps/web: **exit 0**.
- Biome read-only pada delapan file kode/CSS berubah: **pass**. `git diff --check`: **pass**. `bun --no-env-file scripts/check-architecture.ts`: **pass, no exceptions**.
- Build Next **webpack production pass** pada salinan sumber terisolasi `.cache/ui-qa/source/apps/web`, bukan mengubah build server pengguna. Env SSR/API hanya fixture loopback. Root script pnpm exec mencoba mengakses store SQLite dan gagal; verification selanjutnya memakai binary terpasang langsung, tanpa install dependency.
- Unduhan Google fonts existing melalui Node TLS gagal. Build memakai `NEXT_FONT_GOOGLE_MOCKED_RESPONSES` sebagai adapter **cache respons CSS+berkas Geist/Geist Mono asli yang diunduh dari sumber Google**, bukan dummy font. Jakarta baru selalu lokal. Build tanpa cache jaringan belum dibuktikan; ini keterbatasan lingkungan, bukan klaim font publik sudah dimigrasi.
- Chromium headless **158.0.8127.18**, API fixture read-only 127.0.0.1:4101, aplikasi QA 127.0.0.1:3101. Tidak ada data pribadi, DB, seed/migration, login nyata atau mutasi backend. Server pengguna port 3001 tidak dihentikan.
- `output/playwright/f1/results.json`: **pass, zero page errors**; 320×740, 390×844, 768×1024, 1024×768, 1440×1000, kedua tema tanpa page overflow. Default light meski OS dark, dua opsi tema, keyboard/Escape/focus return, font+warna portal body, disabled, reload dan sampling frame tema saat client navigation, empty broadcast/dialog, public home/login tokens+font, reduced motion dan text-spacing 320px.
- Screenshot: `output/playwright/f1/dashboard-{320,390,768,1024,1440}-{light,dark}.png`, public-home/public-login, broadcast-dialog-dark, text-spacing-320. Render light desktop, dark mobile dan login diinspeksi. Kartu KPI mobile masih padat dan beberapa unit membungkus: layout dashboard merupakan scope F4, bukan alasan mengubah metric di fondasi.
- Kalkulasi sRGB token: semua pasangan teks/status pada keempat surface ≥4.5:1; pasangan brand minimum 4.65:1, primary 4.67:1; border-control minimum light 3.65:1/dark 4.46:1. Ini bukti token, bukan sertifikasi seluruh render aplikasi.

## Batas dan open items

Tidak menjalankan seluruh verify:pr/backend DB suites karena perubahan presentasi saja dan working tree punya perubahan unrelated. Belum ada UAT PM, Safari iOS/Chrome Android/Brave aktual, screen reader, hardware safe-area/keyboard, atau seluruh state seluruh modul; diverifikasi pada fasenya. Simulasi text-size/spacing bukan bukti native browser zoom/perangkat.

Next CLI existing menampilkan peringatan advisory keamanan dan berhenti sekali sebelum bisa dilanjutkan; upgrade dependency tidak dikerjakan di F1. Build juga memiliki warning Varlock dynamic dependency/tracing existing. next-themes saat remount scope pada soft navigation memunculkan warning development tentang script client; sampling frame preference dan zero page errors lulus. Catat warning ini bila runtime/library berubah; jangan klaim console bersih.

Status: **siap review F1**, belum accepted/released. F2 diizinkan PM pada chat; perubahan nav, launcher, scanner, KPI, persistence dan modul lain bukan deliverable F1.
