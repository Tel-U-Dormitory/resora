# F0 — audit frontend sebelum refactor

26 November 2026 · Design System 1.1 · audit sumber, bukan sertifikasi browser/UAT.

Permintaan PM pada chat ini: F0 lalu F1 dan branch khusus. Ini menggantikan STOP F0 dan larangan membuat branch pada template awal. Inspeksi F0 dilakukan sebelum perubahan aplikasi; laporan disimpan ketika memulai F1. Branch awal berbasis `dev` pada `b7d5718`, lalu `refactor/ui-ux-f1-foundation`. Jangan merge/deploy. Perubahan pengguna yang sudah ada dipertahankan, termasuk dokumen desain baru, manifest, package.json, bun.lock, loading route dan stat-card.

## Inventaris route dan dependency

Semua **16 route** pada interaction-spec §2 ditemukan; tidak ada route modul pelanggaran/kebersihan aktif.

| Route | Komposisi sumber / data & capability yang wajib dipertahankan | Fase |
| --- | --- | --- |
| `/dashboard` | Identity `SrDashboard`; dashboard metrics/activities, broadcast; session backend, `canManageBroadcast`/SUPERADMIN; preview sintetis development/test, produksi unavailable | F4 |
| `/broadcasts` | `BroadcastFeed` ACTIVE; `broadcast.list`, aksi kelola sesuai `canManageBroadcast` | F5 |
| `/broadcasts/history` | Feed HISTORY dan pagination; policy broadcast | F5 |
| `/profile` | Identity `SrProfile`; profile query, akun personal, mandatory-password rules | F6 |
| `/attendance/history` | Attendance `OwnHistory`; paginated ownHistory, participant gate | F6 |
| `/scan` | Attendance check-in scanner; session/QR/GPS/kamera/mutation; actor SR saja | F3 |
| `/events` | EventList; attendance.list compatibility transport, view manage, server-derived capability | F7 |
| `/events/[eventId]` | EventDetail; event/session/recap/QR/audit, existing policies | F7 |
| `/events/new` | DraftEditor; roster/location/session fields; create capability | F7 |
| `/events/[eventId]/edit` | DraftEditor; edit/advanced edit/reason, lifecycle policy | F7 |
| `/events/points` | Attendance PointsRecap; `canReadAttendancePoints`, periode/CSV/scoring | F7 |
| `/committees` | CommitteeList; committee.list, `canManageCommittee` | F8 |
| `/committees/[committeeId]` | CommitteeDetail/dialog; eligibility anggota dan batch policy | F8 |
| `/admin/users` | AccountList/actions/modal; accountSnapshot/listAccounts, SUPERADMIN server gate | F9 |
| `/admin/users/new` | AccountCreateForm/references; server provisioning policy | F9 |
| `/admin/periods` | PeriodWorkspace/AccountPeriodManager; period queries/mutations, SUPERADMIN | F9 |

Route tambahan di luar kelompok authenticated: `/`, `/login`, `/forgot-password`, `/reset-password`, `/change-password`. Jangan memperluas scope ke alur autentikasi. Root dan login wajib diperiksa untuk efek shared CSS. Password-change tetap mengikuti kebijakan existing.

## Stack dan inventaris reusable

- Monorepo pnpm/Turbo: `apps/web` Next.js 16.4.3 + React 19, `apps/server` Express/tRPC; packages API/Auth/DB/Storage/Config/UI. Ikuti ADR 0006: frontend feature-local public/server entry points, server tetap otoritas data/permission.
- Tailwind 4.3.3 melalui `packages/ui/src/styles/globals.css`, lalu override `apps/web/src/index.css`. Tidak ada alasan migrasi Tailwind, library kontrol, atau icon pada F1.
- Shared UI `packages/ui`: Button, Input, Textarea, Select, Checkbox, Switch, Card, Avatar, Calendar/date-time/clock picker, Dialog/ActionDialog, Sheet, Popover, DropdownMenu, Sidebar, Tooltip, Skeleton, Sonner. Base UI/shadcn sudah tersedia.
- Wrapper aplikasi: `components/ui/{button,card,avatar,skeleton,spinner}`, event-feedback/StatusBadge, AppShell/AppSidebar, ModeToggle, MobileQuickActions, DashboardHeader. Ada duplikasi wrapper, tetapi tidak perlu menggantinya serentak.
- Root memakai Geist/Geist Mono melalui next/font; ikon Lucide. Plus Jakarta Sans belum tersedia sebagai aset lokal pada baseline. Iconsax belum terverifikasi: tetap Lucide.
- next-themes 0.4.6 sudah menyimpan preference dan memasang bootstrap sebelum hydration; default light, tetapi opsi system masih ditawarkan. Portal dialog/menu/tooltip/sheet umumnya berada di body.
- TanStack Query 5.102.8 + tRPC options: cache memory `utils/trpc.ts`, invalidation terarah `utils/internal-event-queries.ts`. Belum ada query persister lintas reload atau kebijakan cache/draf sensitif lengkap. Jangan memasang persistence pada F1.

## Gap desain dan state

| Area | Bukti baseline / gap | Tindakan |
| --- | --- | --- |
| Tokens | Merah `#e13b30`, slate light/dark, border input memakai border dekoratif; status di root dan workspace berbeda | F1 semantic aliases pada satu scope workspace; kontrol/focus/status diperiksa terpisah |
| Tipografi/geometri | Geist, radius 6/10/14/20/28, page max 72rem dan h1 hingga 32px | F1 Plus Jakarta Sans; control/card/overlay 12/16/24, heading 24/28, gutter 16/24/32 |
| Shell | Sidebar/drawer dan quick-action radial; breakpoint existing 640/768/1024 tidak sama dengan shell target 768/1200 | F2; jangan ubah navigasi pada F1 |
| Forms/tables | Banyak state pending/error/empty sudah ada; beberapa native field dan wrapper memiliki ukuran berbeda; tabel akun mobile punya CSS khusus | Reuse, foundation F1; layout/form/matriks detail diuji pada F7–F9 |
| Overlay | Body portal tidak mewarisi token jika hanya dipasang di wrapper workspace | Scope token pada root saat workspace mounted; jangan membuat implementasi dialog baru |
| Scanner | State machine, GPS recovery, decoder fallback, stream cleanup, diagnosis existing sudah ada | F3 wajib mempertahankan reliability; zoom/success diagnosis belum lengkap |
| Dashboard | Fixture dengan kontrak state, metric loading/empty/error/unavailable, ekspor simulasi disabled | F4; jangan ubah metric/API atau memperlakukan fixture sebagai produksi |
| Broadcast | Loading/error/retry/empty, dialog create/edit dan paging existing | F5; unread/read receipt/count belum disahkan |
| Detail/admin | Query/mutation pending/error/confirm dan policy gates existing | Audit per route pada fasenya; keberadaan state bukan bukti browser lulus |

Kontrak komponen menargetkan default/hover/pressed/focus/selected/disabled/pending/loading/error/empty/success sesuai relevansi. F0 hanya memetakan bukti sumber; interaksi semua route belum diuji. Review heuristik statis: masalah konsistensi token dan hierarchy (severity 2), risiko batas kontrol/fokus kurang kontras (severity 3), risiko tema portal dan global style bocor (severity 3). Target AA 2.2 tidak disimpulkan dari inspeksi.

## Risiko, TBD, urutan dan gate

1. Shared token root/global dan shared primitives juga dipakai publik; perubahan global tanpa scope dapat mengubah `/`/`/login`. CSS yang diimport route tetap bisa hidup setelah client navigation; scope eksplisit wajib.
2. Font build yang mengunduh Google membutuhkan jaringan. Self-host font resmi+lisensi jika jaringan build tidak andal; jangan menambah font kedua atau dependency.
3. Scope data/permission ada di backend: SYSTEM_ADMIN bukan peserta. Capability navigasi tidak memberi authorization baru. Rekap poin tidak boleh menjadi detail manajemen untuk aktor yang belum diizinkan.
4. Scanner: success projection jarak/radius, ID diagnosis, arti counter Percobaan masih TBD; tidak memblokir F1/F2, memblokir bagian diagnosis sukses F3.
5. Dashboard: summary endpoint sumber belum lengkap, formula penilaian/denominator tidak boleh diciptakan. Inbox tidak memiliki kontrak unread/read receipt baru. F4/F5 hanya bagian yang sah.
6. Persistensi F10: allowlist query/field, retensi, buster, logout/account switch dan klasifikasi sensitif belum lengkap. Audit/gap dulu, implementasi hanya kontrak disetujui.
7. Bukti browser lokal harus menggunakan data sintetis dan backend loopback; jangan menguji melalui backend produksi. Kamera/GPS, Safari iOS/Chrome Android dan screen reader memerlukan bukti terpisah.

Urutan tetap F1 fondasi → F2 shell → F3 scanner → F4 dashboard → F5 Inbox → F6 profil/history → F7 events/points → F8 committee → F9 admin → F10 resilience → F11 audit/UAT. Gunakan branch per fase dari jalur integrasi `dev`; F1 branch `refactor/ui-ux-f1-foundation`, berikutnya `refactor/ui-ux-f2-shell` setelah review PM. Jangan membawa fase visual berikutnya melewati gate fase berjalan.

Perintah diperiksa: root `lint` read-only; `check` memakai `--write`; `verify:pr` melakukan next typegen, architecture, lint, typecheck, offline/load tests, build. Test backend berlabel integration dapat bergantung DB; tidak menjalankan migration/seed. F0 tidak menjalankan instalasi, commit, push, deployment, atau mutasi data. Laporan dan perubahan F1 tidak mengesahkan bisnis TBD atau menggantikan sign-off PM.
