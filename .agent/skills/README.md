# Panduan dan tinjauan skill RESORA

Ditinjau ulang pada 2026-11-07 terhadap 56 skill lokal di `agents/skills/`.
Hasil: 16 skill terpasang (8 awal + 8 tambahan). Salinan berada di
`.agent/skills/` dan `.codex/skills/`. Folder sumber dipertahankan.

## Dasar penilaian

Kelayakan dinilai dari kesesuaian dengan manifest, implementasi, PRD, dan
Architecture/ADR 0006: Next.js/React, Tailwind/shadcn dengan Base UI,
Express/Bun, tRPC, Better Auth, Drizzle/PostgreSQL, dan modular monolith.
Nama skill saja tidak cukup: dependensi, asumsi framework, portabilitas path,
konflik instruksi, dan batas tindakan juga diperiksa. Ini tinjauan kecocokan
panduan, bukan sertifikasi keamanan seluruh skrip atau pengukuran efektivitas skill.

## Cara memilih panduan

- UI operasional: `ui-ux-pro-max`, `mobile-native`, lalu skill Next/React/shadcn/CSS yang relevan.
- Backend: `nodejs-backend-patterns`; sesuaikan contoh dengan kontrak dan policy yang aktual.
- Implementasi dan review: `ponytail`, `ponytail-review`, `ponytail-audit`, `ponytail-debt` sesuai tugas.
- Keamanan: `security-audit`; audit lengkap hanya pada permintaan yang sesuai.
- Konsistensi visual dari source: `extract-design-system`; tidak perlu browser/Stitch untuk tahap dokumen.
- QA browser yang diminta: `playwright`. Ini CLI interaksi browser, bukan runner suite E2E persisten.
- Landing publik kreatif: `awwwards` bila brief meminta; QA visual/skor: `jury` bila diminta.

Muat hanya skill yang relevan. Memasang skill tidak menjalankan workflow atau
memberikan otorisasi untuk browser, perubahan eksternal, database, atau deployment.
`AGENTS.md`, persetujuan PRD, Architecture, dan konvensi aktual tetap diikuti.
Browser/screenshot/visual testing hanya atas permintaan eksplisit pengguna.
Pakai data sintetis dan lingkungan lokal/disetujui. Tidak ada package/browser
baru yang dipasang dalam peninjauan ini. Manual UAT dan release sign-off terpisah.

Review generik tidak boleh menghapus kontrak publik, batas modul, validasi,
aksesibilitas, transaksi, atau policy hanya untuk memperkecil kode. Skor visual
bukan bukti keamanan atau kelulusan business workflow. Verdict “Ship” bukan izin deploy.
Plugin Ponytail yang terpasang dapat memiliki workflow lebih sempit dengan nama
serupa; periksa SKILL.md yang dipilih sebelum memakai hasilnya.

## Adaptasi salinan lokal

Sumber di `agents/skills/` tidak diedit. Pada 8 skill tambahan:

- `stitch-extract-design-md` disalin sebagai `extract-design-system`; nama frontmatter dibuat portabel.
- Path Playwright yang semula menunjuk `.agents/skills/` menjadi placeholder direktori skill aktual.
- Trigger Awwwards/Jury/Playwright diperjelas agar sesuai scope dan aturan browser RESORA.
- Catatan integrasi menjaga PRD, batas modul, format pelaporan, dan pemisahan review/release.
- `argument-hint` pada Ponytail tidak disalin ke frontmatter lokal agar lolos validator skill yang tersedia.
- File pendukung disalin; cache Python dan node_modules tidak disalin.

## Keputusan untuk seluruh sumber

“Opsional” berarti berguna jika workflow terkait dipilih di kemudian hari, bukan buruk.
“Perlu adaptasi” berarti ide bernilai tetapi paket belum cocok untuk disalin langsung.

| Skill sumber | Keputusan | Alasan / batas pemakaian |
| --- | --- | --- |
| `antislop-ui` | Ditunda: dependensi hilang | Mewajibkan antislop.md; core tidak ditemukan di agents/. Referensi web-quality berguna, tetapi paket belum lengkap. |
| `awwwards` | Ditambahkan, bersyarat | Art direction landing publik yang diminta; bukan standar default dashboard operasional. |
| `clone-website` | Di luar tujuan saat ini | Pipeline kloning, pengambilan aset, dan builder paralel; RESORA dikembangkan dari kebutuhan yang disetujui. |
| `deploying-to-cloud` | Tidak sesuai stack | Khusus Laravel Cloud, bukan panduan deployment Docker/Next/Express. |
| `design-md` | Opsional Stitch, belum dipasang | Mengekstrak design system dari proyek Stitch; belum ada tugas atau proyek Stitch yang ditentukan. |
| `enhance-prompt` | Opsional Stitch, belum dipasang | Memoles prompt untuk Stitch; bermanfaat jika workflow Stitch dipilih. |
| `firebase-security-rules-auditor` | Tidak sesuai stack | Firestore/Cloud Storage rules bukan PostgreSQL/Drizzle/Better Auth. |
| `firecrawl-website-design-clone` | Opsional, belum dipasang | Berguna jika ada situs referensi yang diminta; membutuhkan Firecrawl/API key atau tool terkait. |
| `flutter-apply-architecture-best-practices` | Tidak sesuai stack | Arsitektur Flutter/Dart tidak digunakan. |
| `golang-code-style` | Tidak sesuai stack | Tidak ada pengembangan Go pada stack yang ditinjau. |
| `inertia-vue-development` | Tidak sesuai stack | Inertia/Vue tidak digunakan. |
| `infer-conventions` | Tidak sesuai stack | Sweep konvensi Laravel dengan Boost record-rule; bukan inferensi umum TypeScript. |
| `jury` | Ditambahkan, bersyarat | QA visual berbasis bukti saat diminta; skor bukan bukti fungsi, keamanan, atau release readiness. |
| `laravel-best-practices` | Tidak sesuai stack | PHP/Laravel/Eloquent tidak digunakan. |
| `laravel-specialist` | Tidak sesuai stack | Laravel/Sanctum/Horizon/Livewire tidak digunakan. |
| `mobile-native` | Terpasang | Relevan untuk QR scan dan formulir mobile; pengujian perangkat/browser tetap atas permintaan. |
| `next-best-practices` | Terpasang | Sesuai Next.js App Router dan batas server/client. |
| `nodejs-backend-patterns` | Terpasang | Express/Bun; contoh JWT, repository, atau REST bukan mandat mengganti Better Auth/tRPC/Drizzle. |
| `playwright` | Ditambahkan, bersyarat | QA alur UI/browser saat diminta eksplisit; path wrapper diperbaiki, tanpa menjalankan browser. |
| `ponytail` | Ditambahkan | Implementasi sederhana yang tetap memenuhi seluruh acceptance criteria. |
| `ponytail-audit` | Ditambahkan | Audit kualitas repo dengan cakupan dan batas verifikasi yang dinyatakan. |
| `ponytail-debt` | Ditambahkan | Inventaris shortcut teknis; abaikan contoh pada folder skill. |
| `ponytail-gain` | Tidak dipasang: benchmark eksternal | Scoreboard benchmark Ponytail, bukan metrik kualitas atau penghematan RESORA. |
| `ponytail-help` | Tidak dipasang: informasi plugin | Kartu bantuan merujuk konfigurasi/plugin dan gain yang tidak dipasang; bukan panduan kualitas tambahan. |
| `ponytail-review` | Ditambahkan | Review diff: correctness, keamanan, concurrency, pengujian, performa, dan kompleksitas. |
| `react-vite-dashboard` | Tidak sesuai stack | Mengasumsikan Vite, Stitch, dan pola Web3; bukan dashboard Next.js existing. |
| `remotion` | Opsional konten, belum dipasang | Video walkthrough Stitch/Remotion, bukan pengujian atau kualitas aplikasi. |
| `replica-architect` | Di luar tujuan saat ini | Merancang ulang stack/schema/API dari recon clone; arsitektur RESORA sudah ditetapkan. |
| `replica-backend` | Di luar tujuan saat ini | Backend clone, auth/payment/integrasi generik berisiko menggeser kontrak dan policy existing. |
| `replica-brand` | Di luar tujuan saat ini | Rebranding clone, trademark/domain/store checks; bukan kebutuhan kualitas aplikasi saat ini. |
| `replica-build` | Di luar tujuan saat ini | Membangun ulang screen dari feature matrix clone; gunakan module PRD dan kode existing. |
| `replica-deploy` | Di luar tujuan saat ini | Release clone, domain, Stripe, OAuth, dan app store; tidak sesuai scope dan bukan otorisasi deployment. |
| `replica-design` | Di luar tujuan saat ini | Design system dari recon clone; source extraction lebih sesuai untuk RESORA existing. |
| `replica-diff` | Di luar tujuan saat ini | Parity fitur/screenshot terhadap aplikasi asli; RESORA tidak memiliki target clone yang ditentukan. |
| `replica-entrepreneur` | Di luar tujuan saat ini | Riset review pengguna dan positioning bisnis clone, bukan engineering acceptance criteria. |
| `replica-launch` | Di luar tujuan saat ini | Pricing, store listing, dan pemasaran clone; di luar tujuan pengembangan saat ini. |
| `replica-recon` | Di luar tujuan saat ini | Inventaris reverse engineering aplikasi referensi; bukan sumber persetujuan business rules RESORA. |
| `replica-test` | Di luar tujuan saat ini | Prinsip happy/negative-path berguna, tetapi workflow bergantung recon clone; gunakan Playwright plus acceptance criteria RESORA. |
| `security-audit` | Terpasang | Audit batas kepercayaan berbasis bukti; bukan audit yang otomatis dijalankan. |
| `shadcn-ui` | Terpasang | Sesuai komponen proyek; gunakan Base UI yang aktual, jangan mengasumsikan Radix. |
| `site-md` | Opsional Stitch, belum dipasang | Konstitusi situs untuk Stitch loop; jangan menjadikannya pengganti PRD/Architecture. |
| `stitch-code-to-design` | Opsional Stitch, belum dipasang | Pipeline unggah kode/desain ke Stitch, di luar pengembangan lokal saat ini. |
| `stitch-extract-design-md` | Ditambahkan sebagai `extract-design-system` | Ekstraksi token dan pola komponen dari source; tahap dokumen tidak memerlukan Stitch/browser. |
| `stitch-extract-static-html` | Opsional, belum dipasang | Snapshot HTML dengan Puppeteer atau tooling tambahan; source design extraction sudah mencakup kebutuhan lokal yang lebih langsung. |
| `stitch-generate-design` | Opsional Stitch, belum dipasang | Generasi layar melalui layanan Stitch saat ada workflow desain yang diminta. |
| `stitch-loop` | Opsional Stitch, belum dipasang | Loop generasi/build dan baton SITE.md bukan alur default monorepo existing. |
| `stitch-manage-design-system` | Opsional Stitch, belum dipasang | Membaca/mengubah design system eksternal; perlu koneksi dan tugas Stitch. |
| `stitch-react-components` | Perlu adaptasi, belum dipasang | Pipeline Stitch ke React/Vite; RESORA memakai Next.js dan feature/module boundaries existing. |
| `stitch-react-native` | Tidak sesuai stack | React Native belum menjadi aplikasi RESORA. |
| `stitch-upload-to-stitch` | Opsional Stitch, belum dipasang | Upload aset eksternal; perlu workflow, koneksi, dan otorisasi yang sesuai. |
| `tailwindcss-development` | Terpasang | Sesuai utility CSS dan layout proyek. |
| `taste-design` | Opsional Stitch, belum dipasang | Instruksi spesifik Stitch/Koneksa dan perpetual motion tidak cocok sebagai aturan umum UI RESORA. |
| `testing-best-practices` | Perlu adaptasi, belum dipasang | Prinsip test bernilai, tetapi entrypoint mengklaim proyek memakai PHPUnit dan rule memakai Laravel/Pest. Perlu adaptasi Bun/TypeScript, bukan copy langsung. |
| `ui-ux-pro-max` | Terpasang | UI/UX, aksesibilitas, responsivitas, dan design system lintas stack. |
| `vercel-react-best-practices` | Terpasang | Performa React/Next.js; sesuaikan dengan React Compiler dan kode aktual. |
| `web-clone` | Di luar tujuan saat ini | Rekonstruksi situs dari source/aset referensi, bukan pengembangan modul RESORA. |

## Kekurangan panduan yang masih terbuka

Folder sumber belum menyediakan skill yang secara khusus cocok untuk pengujian
Bun/TypeScript/tRPC, Better Auth, Drizzle/PostgreSQL, atau CI/Docker RESORA.
Gunakan implementasi, test existing, dan perintah verifikasi repository sebagai
acuan; skill Laravel/Firebase tidak menutup kekurangan tersebut.
Prinsip testing generik dapat diadaptasi pada tugas terpisah tanpa membawa
asumsi PHPUnit/Laravel. Tidak ada skill baru yang dikarang untuk menutupi kekosongan.
