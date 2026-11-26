# F2 — shell, navigation, Apps launcher

26 November 2026 · Design System 1.1 · commit lokal per fase, tanpa push. PM pada chat mengizinkan lanjut F3 setelah F2 clear. Status verifikasi final dicatat di bawah; UAT PM terpisah.

## Scope dan referensi

Seluruh 16 route authenticated menggunakan AppShell yang sama. Tidak merombak konten dashboard, Inbox, Profil, scanner, form atau tabel modul; implementasinya mengikuti fase berikutnya. Data, API, authentication, authorization, schema/migration, dependencies, dan deployment tidak berubah.

Referensi diperiksa: seluruh `docs/design/referensi acuan desain mobile/Contoh UI01–05.jpeg`, terutama pill + aksi terpisah UI01/02/04/05 dan grid launcher UI03. Kode `docs/design/referensi kasar/referensi-kasar-resora.tsx` ditinjau khusus theme/sidebar/nav/utility bar/launcher (sekitar baris 1250–1520 dan 1910–2070). Diadaptasi: pill coral selected, tombol QR bulat 56px, grid tiga kolom, tile netral dengan ikon kuning/ungu/coral, sidebar collapsible. Role switch demo, KPI sintetis baru, unread, menu belum aktif, ID diagnosis dan kontrak contoh tidak disalin ke produk. Dokumen normatif mengalahkan mock bila berbeda; label launcher 14px mengikuti token label, bukan contoh 12px.

## Implementasi dan entry points

- `components/app-shell.tsx`: utility bar dengan breadcrumb/profil/tema, collapse sidebar tersimpan `resora-sidebar-collapsed`, skip link dan ruang bawah konten. Sidebar tetap memakai primitive existing; MobileQuickActions tidak lagi dimount. Preference quick-actions lama tidak dihapus.
- `components/app-navigation.tsx`: urutan tetap **Beranda → Inbox → Profil → Apps**; tiga link dan satu button dialog. Scan QR adalah link bulat terpisah, hanya actor SR dari sesi terverifikasi. Selected memakai bentuk/warna/underline + aria-current; Apps menggunakan aria-expanded/aria-controls.
- Launcher memakai Sheet/Base UI existing: title, deskripsi, tombol Tutup, fokus masuk/containment/return, grid scrollable. Isi berasal dari `getAppItems` yang memakai inventaris capability sidebar yang sama. Tidak ada request baru atau status loading/pending fiktif; empty dijelaskan bila inventaris kosong.
- Satu history entry sementara saat Apps dibuka: Back/Escape/Tutup menutup sebelum meninggalkan route; memilih modul mengganti entry overlay dengan tujuan, sehingga Back kembali ke halaman asal. Reload/Forward menyelaraskan state overlay dengan history. Resize ke wide menutup overlay.
- `config/navigation.ts` dan tests: Inbox/Profil universal authenticated, participant links tetap SR, rekap poin melalui `canReadAttendancePoints`, committee/event/admin melalui capability existing. `/attendance/history` dipetakan sebagai tujuan Profil di bottom navigation; history Inbox tetap Inbox. Rekap poin tidak ikut menyalakan link daftar/kelola kegiatan.
- `components/navigation-icons.ts`: satu pemetaan Lucide untuk sidebar dan launcher; tidak memasang Iconsax.
- `styles/workspace-shell.css`: compact/medium <1200px memakai floating pill; wide ≥1200px memakai sidebar. Target touch ≥44px, safe-area/dvh, padding bawah yang cukup dan scroll-margin fokus. Gutter mengikuti fondasi F1. Grid icon+label mengikuti referensi dengan wrapping di 320px.
- `packages/ui/src/hooks/use-mobile.ts` dan Sidebar: breakpoint 1200px konsisten antara CSS dan JS; hook ini hanya dipakai Sidebar. Sidebar memakai h-dvh.
- Authenticated layout meneruskan capability rekap existing dan viewport-fit cover; zoom browser tetap diperbolehkan. Root/login tidak mendapat navigasi workspace.

## Bukti verifikasi

Bukti lokal: `output/playwright/f2/`. QA memakai salinan sumber terbaru di `.cache/ui-qa/source/apps/web`, API read-only sintetis loopback :4101, Next lokal :3101. Tidak ada database/akun nyata/mutasi backend. Build memakai adapter cache font asli existing seperti F1; Jakarta tetap lokal.

- Unit/regression: config navigation, workflow interaction, public landing. Lihat `unit.log` untuk jumlah final; capability independent, actor SYSTEM_ADMIN tanpa QR, inventory Apps, active state points/riwayat pribadi, dan regresi existing diuji.
- Typecheck apps/web, Biome read-only seluruh file kode berubah, `git diff --check`, architecture checker: hasil final dilaporkan bersama commit.
- Production build Webpack: `build.log`. Dev compiler sempat gagal pada unduhan font/Turbopack; browser final memakai hasil production build, sehingga tidak menganggap startup dev gagal sebagai gate lulus.
- Chromium 158.0.8127.18: 320×740, 390×844, 768×1024, 1024×768, 1199×800, 1200×900, 1440×1000; light/dark; bukti shell dan Apps per viewport di `results.json` dan screenshot.
- Pemeriksaan: empat tujuan tepat, QR terpisah, hanya satu navigasi utama per breakpoint, no page overflow, target launcher ≥44px, keyboard/Escape/focus return, Back menutup layer, pemilihan modul dan Back history, persistence collapse, selected Inbox/Profil, resize dismiss.
- `extra-results.json`: fixture anggota dan SYSTEM_ADMIN, touch emulasi, inventory sesuai capability, focus trap, reload launcher lalu Back, launcher saat offline, sidebar saat localStorage ditolak. Tidak melakukan POST ke API fixture.
- Bug yang ditemukan dan diperbaiki: navigasi pemilihan Apps tidak boleh membalap `history.back()` dengan `router.push`; entry sementara kini diganti dengan tujuan. Screenshot menunggu opacity akhir, bukan menangkap overlay di tengah transisi.

## Batas

UAT PM, Safari iOS/Chrome Android/Brave aktual, screen reader, keyboard software/notch di hardware belum tersedia. Emulasi touch tidak membuktikan native feel. Scanner full-screen/reliability/zoom/diagnosis adalah F3; tidak diklaim selesai melalui F2. Query-cache/draf adalah F10. Tidak menjalankan seluruh verify:pr/DB suites karena perubahan presentasi dan working tree pengguna memiliki pekerjaan unrelated.

Warning existing Next advisory keamanan dan Varlock tracing tetap dicatat di laporan F1; tidak melakukan upgrade dependency di refactor ini. Tidak merge, push, atau deploy.

## Final local gate

**Implemented and locally tested — siap review PM.** Final run: 36 tests pass, 0 fail (603 assertions); TypeScript exit 0; Biome 10 files pass; architecture pass/no exceptions; diff-check pass; production build pass. `results.json` dan `extra-results.json` keduanya pass pada kode final. Screenshot launcher 320px, shell dark mobile dan shell light desktop diinspeksi terhadap referensi. Tidak ada error halaman JavaScript pada matriks utama. Tidak ada push; checkpoint F2 disimpan lokal sebelum F3.
