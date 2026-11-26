# Pelanggaran — Rencana Fase dan Prompt Codex

**Disusun:** 25 November 2026 (WIB) · **Fokus:** pekerjaan backend/technical lead Nafi, dengan handoff frontend/QA.
**Status:** Implementasi lokal berlanjut; belum dirilis. Arahan PM 25 November mendelegasikan keputusan teknis non-bisnis kepada Nafi/Codex; keputusan proses bisnis TBD tetap dibatasi. Status fase mencerminkan diff dan tes yang tersedia.

Dasar perilaku: [PRD modul](prd.md). Sumber backlog/status kerja dan kontribusi/tanggal: [spreadsheet PM](https://docs.google.com/spreadsheets/d/1qIdHqQZ2JpArt4z6eV3AEasj8RuWvy0c2Zxggqg0TVU/edit), tab Pembagian Tugas dan Backlog. Koordinasi proyek/persetujuan melalui WA; Jira RSA-22–26 hanya referensi item backlog, bukan acuan manajemen/status proyek. Tidak perlu komentar Jira untuk memberlakukan arahan PM yang disampaikan user.

**Pemisahan P1-04:** Dashboard RESORA hanya satu modul frontend untuk overview dan seluruh kartu/grafik lintas modul. Ia mengonsumsi API ringkasan tiap modul sumber. Pekerjaan Nafi di RSA-26 adalah menyediakan data/API statistik Pelanggaran, bukan dashboard UI untuk backend Pelanggaran dan bukan backend aggregator. Lihat kontrak aktual di PRD modul §5.6.

## 1. Urutan, dependensi dan pembagian kerja

| Fase | Hasil reviewable | Dependensi / gate | Kontribusi |
| --- | --- | --- | --- |
| F0 — Baseline dan keputusan minimum | Kontrak usulan, checklist AC, paket keputusan D01–D09 | Bisa dimulai sekarang; keputusan TBD tidak boleh diisi sebagai Approved | Nafi + Fariza; seluruh FE dapat menyiapkan dummy berdasarkan kontrak yang disepakati |
| F1 — Fondasi data dan akses | **Implementasi lokal selesai:** tiga tabel `violations_*`, RLS, audit append-only, kontrak Identity, migrasi additive dan tes schema tersedia; tiga migrasi telah diterapkan di Dev, 0 pending, tabel kosong | Read-only verifikasi Dev mengonfirmasi tabel, RLS, trigger, constraints; bukan UAT | Nafi; Fariza review |
| F2 — Create dan KTM | **API backend terverifikasi di Dev:** upload intent R2, direct-to-R2 PUT, client-side compression handoff, validasi image backend tanpa re-encode, internal R2 copy ke key final, create idempotent, snapshot gedung, audit atomik | Synthetic end-to-end confirms signed `If-None-Match: *` replay is rejected with 412. FE compression/upload remains handoff to frontend developer | Nafi; Fariza form, Ardhian modal, Imba QA |
| F3 — Read dan filter | **Implementasi lokal selesai:** list/detail/filter/history dan signed download KTM privat | Akses riwayat SR aktif lintas gedung tanpa cutoff; integrasi DB Dev menunggu migrasi | Nafi; Ardhian halaman, Imba filter |
| F4 — Edit, soft delete dan audit | **Implementasi lokal selesai:** edit berversi, delete beralasan, tombstone teredaksi, audit append-only; tidak ada restore/purge otomatis | Tes integrasi transaksi DB Dev menunggu migrasi; purge fisik tetap ditahan sampai kebijakan retensi ditetapkan | Nafi; Fariza edit, Ardhian modal hapus, Imba histori/QA |
| F5 — API statistik dan drilldown | **Implementasi lokal selesai:** statistik laporan aktif harian menurut tanggal kejadian dan gedung untuk satu Dashboard frontend | Integrasi DB Dev dan pembuktian konsistensi drilldown menunggu migrasi | Nafi API/backend; tim FE Dashboard untuk satu UI overview/grafik lintas modul |
| F6 — Integrasi dan hardening | **Backend synthetic end-to-end Dev DB/R2 lulus:** upload/replay protection, create/retry, cross-building read, edit, stale/non-owner denial, soft delete/tombstone, SUPERADMIN detail/audit, stats; DB rows rollback dan R2 objects cleaned | CORS `If-None-Match` belum dapat diverifikasi (bucket read returns AccessDenied untuk kredensial storage-scoped); FE implementation, full build, UAT FE dan reviewer/go-no-go masih menunggu developer/QA/PM | Nafi integrasi/security; seluruh FE + Imba QA; Fariza review |
| F7 — UAT dan keputusan staging/release | Belum dimulai | Menunggu F6, UAT dan go/no-go Nafi; staging/release belum dilakukan | Nafi reviewer/go-no-go/UAT environment; FE dan QA mendukung |

F0 → F1 → F2/F3 → F4/F5 → F6 → F7. F3 boleh memakai seed sintetis lokal tanpa menunggu UI atau create selesai; F5 boleh dimulai dengan fixture sebelum F4, tetapi tes pengecualian deleted wajib setelah integrasi. Paralel berarti pekerjaan tim dapat berlangsung bersamaan; bukan instruksi otomatis untuk Codex membuat subagent atau chat baru.

Pembagian FE mengikuti kedua tab PM: Ardhian menangani modal hapus, sedangkan Imba menangani informasi hapus/histori/QA (Backlog RSA-25 juga mencatat Imba sebagai PIC FE). Mereka perlu menyepakati handoff komponen, tanpa mengubah assignment Jira.

### Target harian PM dan penyesuaian praktis

- **24 Nov, baseline rencana PM:** stack/kontrak/setup, skema dev setelah ACC. Tanggal sudah lewat; status aktual harus diperiksa, bukan ditandai selesai.
- **25 Nov:** F0/gate minimum dan F1 yang belum siap, lalu F2/F3 create/list/detail + akses. FE tetap dapat membuat UI dummy dari kontrak yang disepakati.
- **26 Nov:** F4/F5 edit/hapus/audit/statistik dan integrasi F6 bertahap.
- **27 Nov:** F6 perbaikan/tes/build, lalu F7 demo dan UAT setelah persetujuan lingkungan.

Tanggal adalah target PM development/staging siap UAT, bukan estimasi durasi pasti. Jika ACC atau fondasi tertinggal, laporkan dampaknya kepada PM dan susun ulang urutan; jangan melewati gate keamanan atau mengubah tanggal menjadi janji production. Dokumentasi BA/SA lengkap/as-built menyusul fitur sesuai arahan PM; F0 cukup paket keputusan minimum, tanpa memperluas analisis ke seluruh platform.

## 2. Cara memakai prompt

Gunakan **satu fase per sesi/perubahan yang koheren**, bukan sekali meminta seluruh modul. Salin prompt dasar berikut lalu tambahkan prompt fase yang dipilih. Konteks PRD/roadmap memakai path relatif dari root repo. Saat melanjutkan sesi, tetap periksa kode dan perubahan terbaru; hasil fase sebelumnya tidak otomatis membuktikan izin migrasi atau rilis.

Setiap fase harus menghasilkan diff konkret dan bukti verifikasi. Boleh menyelesaikan bagian independen ketika keputusan tertunda; berhenti hanya pada bagian yang membutuhkan keputusan tersebut. Tidak perlu meminta ulang keputusan yang sudah tercatat dan masih berlaku. Prompt ini tidak mengotorisasi push, pembuatan PR remote, update Jira/Sheets, merge, deployment, mutasi DB remote atau perubahan R2; lakukan hanya jika ada instruksi eksplisit yang sesuai.

### Prompt dasar — sertakan pada setiap fase

```text
Kerjakan modul P1-03 Pelanggaran RESORA untuk kontribusi Nafi. Baca AGENTS.md,
docs/modules/pelanggaran/prd.md, fase relevan docs/modules/pelanggaran/roadmap.md,
bagian Architecture/ADR/setup yang terkait, lalu inspeksi kode dan git diff.
Jika menyentuh apps/web, baca juga apps/web/AGENTS.md. Pertahankan perubahan user.

PRD modul diturunkan dari spreadsheet PM: 20 Approved, 1 Pending, 6 Rejected.
Hanya implementasikan scope fase yang diminta. Jangan tambahkan kategori RSA-31,
status/workflow verifikasi, validator, master mahasiswa, restore atau fitur lain.
Jangan invent permission, aturan periode/gedung, retensi, batas input/file atau
field editable yang masih TBD. Temukan bukti ACC terbaru untuk keputusan yang
dibutuhkan; jika belum ada, siapkan usulan konkret dan lanjutkan bagian independen.
Konflik aturan produk harus diputuskan PM sebelum bagian terdampak diimplementasi.

Reuse stack, auth/Identity dan storage existing setelah inspeksi; jaga public
module boundaries dan enforcement arsitektur. Jangan scaffolding ulang, mengambil
tabel privat modul lain, menambah dependency atau abstraction tanpa kebutuhan nyata.
Tes menggunakan data sintetis dan lingkungan lokal terisolasi; fake storage untuk
offline. Jangan membaca/menampilkan secret, signed URL atau data mahasiswa asli.
Otorisasi PM tetap (2026-11-26): jalankan browser/screenshot lokal dengan data sintetis untuk setiap perubahan UI yang berdampak visual sesuai [gate verifikasi pusat](../../design/verification.md). Ini tidak memberi izin ke deployment, database Production, kredensial/akun nyata atau layanan eksternal; aturan lingkungan Development DB/R2 di bawah tetap berlaku.
User telah mengizinkan pengujian dan mutasi pada Development DB serta bucket R2
Development khusus dengan kredensial `.env` lokal; verifikasi target Development
sebelum menulis. Kredensial Production hanya ada di server dan Production tidak
termasuk izin ini. Jangan deploy, mengubah Production, merge, atau memperbarui
layanan eksternal lain tanpa izin eksplisit yang sesuai tindakan/lingkungannya.

Sebelum menjalankan command, periksa script/flag agar jelas efeknya. Gunakan tes
terfokus, pemeriksaan arsitektur, typecheck/lint/build sesuai perubahan. Hindari
command autofix seluruh repo. Catat baseline gagal yang tidak terkait tanpa
memperluas scope. Jangan menganggap test skip lulus atau build sebagai bukti fitur.
Akhiri dengan Implemented, Verified (command dan hasil aktual), Not verified,
Impact (config/dependency/schema/data/environment), Open items serta gate fase
berikutnya. Jangan klaim UAT atau release sudah selesai tanpa bukti.
```

## 3. Fase dan prompt siap pakai

### F0 — Baseline, kontrak usulan dan paket keputusan

**Bisa dimulai sekarang.** Deliverable: kontrak minimum yang bisa direview, data contoh sintetis, matriks AC dan daftar keputusan spesifik. Jangan membangun runtime sebelum keputusan terkait jelas. Catat rancangan teknis di bagian relevan Architecture atau ADR jika perlu; pertahankan edit user yang sudah ada. Jangan membuat dokumen status baru untuk setiap sesi.

**Gate keluar:** Nafi/Codex menetapkan kontrak/skema teknis dalam delegasi PM; keputusan proses bisnis/akses dikunci oleh PM. Keputusan yang tidak memblokir pekerjaan terdekat tetap TBD dengan dampak jelas. Catat keputusan produk pada PRD, desain teknis pada Architecture, dan koordinasi/status di spreadsheet/WA. Usulan produk Codex bukan ACC manusia.

```text
Jalankan F0 saja. Jangan implementasikan endpoint, schema atau migration dulu.
Inspeksi router tRPC, public Identity contracts, auth active/tenure/password gates,
Drizzle migrations, packages/storage, API context, dan architecture checker aktual.
Bedakan adapter R2 yang tersedia dari upload/file lifecycle yang belum ada.
Dokumentasi R2 dapat memuat catatan waktu berbeda: pisahkan bukti kode, catatan
provisioning bucket dan kesiapan credential/live; jangan memeriksa secret untuk
menyelesaikan perbedaan itu atau mengklaim koneksi live sudah teruji.

Siapkan kontrak usulan operasi create-context, upload/complete KTM, create,
list/detail, akses foto, edit, soft-delete, histori dan statistik. Cocokkan nama
operasi dengan pola transport existing; jangan memaksakan REST jika repo tRPC.
Tentukan input/output/error/idempotensi/pagination usulan dan contoh sintetis
untuk FE; tandai detail produk belum disetujui sebagai TBD. Peta kontrak ke
RSA-22–26 dan AC01–AC10. Jangan tetapkan batas numerik sebagai aturan Approved.

Susun pilihan minimum dan rekomendasi untuk D01–D09 PRD, terutama SYSTEM_ADMIN
tanpa gedung, snapshot historis, foto wajib/private, akses audit/terhapus,
semantik periode/filter dan edit file. Pisahkan keputusan yang wajib sebelum F1,
F2, F3 dan yang bisa ditunda. Ajukan keputusan dengan konsekuensi yang konkret.
Hasilkan perubahan dokumentasi minimum yang reviewable dan handoff FE dummy;
penulisan usulan bukan ACC. Laporkan kesiapan F1 dan blocker yang spesifik.
```

### F1 — Fondasi data, ownership dan akses

**Deliverable:** skema/migrasi additive yang direview, policy server dan pengujian lokal. **Gate keluar:** invariant skema/policy lulus, SQL/snapshot utuh dan boundaries lulus; tidak ada klaim DB dev remote sudah bermigrasi.

```text
Jalankan F1 sesuai delegasi teknis PM; verifikasi keputusan proses bisnis/akses yang relevan.
Implementasikan model laporan, audit dan file metadata sesuai desain yang direview,
dengan perubahan additive dan ownership modul yang eksplisit. Reuse Identity public
operations; bila kurang, tambah public operation sempit di pemilik Identity dengan
tes, bukan query tabel Identity langsung dari Pelanggaran. Tambah Files lifecycle
minimum hanya jika desain disetujui dan dibutuhkan consumer pertama; jangan
membangun CMS/evaluation atau framework attachment generik.

Implementasikan policy SR aktif/eligible, owner dan SUPERADMIN sesuai PRD serta
gate existing. Bedakan audit penuh dari informasi penghapusan yang boleh dibaca
semua SR. Jangan memberi SYSTEM_ADMIN assignment fiktif. Jaga kode laporan unik,
metadata soft delete, referensi KTM dan audit integrity sesuai kontrak approved.
Integrasikan schema composition, exports serta architecture ownership/negative
fixtures seperlunya; jangan melonggarkan checker untuk meloloskan import terlarang.

Generate migration versioned hanya setelah memeriksa command; jangan mengubah
migration lama atau menerapkan ke DB remote. Review SQL dan metadata hasil generator.
Uji policy positif/negatif dan constraints/rollback di PostgreSQL lokal terisolasi
jika tersedia. Jika belum tersedia, catat tes DB tidak dijalankan. Serahkan diff
dan hasil tes untuk review sebelum F2; jangan menyebut migrasi dev telah diterapkan.
```

### F2 — Create, konfirmasi gedung dan KTM private (RSA-22)

**Deliverable:** backend create dengan KTM tervalidasi, kontrak integrasi form/modal. **Gate keluar:** AC01/02/04 dan invariant file/create teruji lokal; koneksi R2 nyata dicatat terpisah.

```text
Jalankan F2 saja. Pastikan fondasi F1 dan lifecycle file yang diperlukan tersedia.
Ikuti D02: SR harus memiliki tepat satu assignment aktif; SYSTEM_ADMIN/SUPERADMIN
tanpa assignment memilih gedung aktif melalui kontrak Identity dan mengonfirmasi
pilihan itu. Ikuti D03: tanggal kejadian masa depan ditolak. Konfirmasi Tidak
tidak membuat laporan.
Validasi nama/NIM/tanggal/keterangan dan tepat satu KTM sesuai kontrak approved.

Gunakan adapter storage existing serta upload/complete/binding yang direview:
otorisasi live, intent terikat aktor/tujuan, validasi bytes aktual dan canonical
object yang tidak dapat ditimpa signed PUT lama. Jangan menganggap MIME/HEAD saja
cukup atau URL upload berhenti berlaku setelah complete. Bind sekali ke laporan,
simpan key/metadata, buat kode/timestamp server dan cegah duplikasi retry/concurrent
submit. Tangani upload gagal, cancel dan orphan tanpa laporan lengkap palsu.
Download KTM tetap private dan diperiksa server. Jangan menurunkan foto menjadi
opsional ketika R2 belum siap; fake adapter hanya digunakan pada tes lokal.

Tes happy path, input/KTM invalid, cancel, akses inactive/revoked, tampering intent,
replay signed PUT, attachment reuse dan double submit; gunakan fake storage serta
DB lokal yang tepat untuk race/atomicity. Jangan mengklaim live R2 dari fake tests.
Berikan contoh request/response/error sintetis untuk Fariza dan Ardhian.
```

### F3 — Daftar, detail, pencarian dan filter (RSA-23)

**Deliverable:** read API dan akses foto lintas gedung. **Gate keluar:** AC03/04/07 pada cakupan read, filter/pagination dan payload sesuai izin.

```text
Jalankan F3 saja. Gunakan kontrak list/detail/KTM yang direview serta keputusan
D04/D05/D07. Implementasikan read lintas gedung tanpa batas umur untuk SR aktif dan
SUPERADMIN, pencarian nama/NIM, filter gedung pencatat/tanggal/periode dan hasil
kosong. SR aktif hanya menerima tombstone untuk laporan terhapus; SUPERADMIN dapat
melihat detail terhapus, audit dan KTM sesuai kontrak privat. Jangan bocorkan audit
penuh melalui DTO detail/list SR. Bedakan tombstone penghapusan dari payload yang
diizinkan.

Gunakan pagination/order stabil sesuai kontrak teknis, query terparameterisasi,
projection seperlunya dan hindari query per item. Foto private memerlukan akses
laporan yang sah, bukan sekadar kepemilikan file ID. Jangan menambah filter kategori
atau verifikasi. Gunakan fixture sintetis lokal bila create belum siap.
Tes lintas gedung, combined filters, batas tanggal approved, halaman/hasil kosong,
ID/key tebakan, sesi inactive/revoked dan pemisahan informasi terhapus dari audit.
Berikan handoff typed contract dan contoh respons untuk Ardhian/Imba.
```

### F4 — Edit, soft delete dan histori (RSA-24, RSA-25)

**Deliverable:** mutasi owner/admin, audit dan tombstone. **Gate keluar:** AC05–07/09; tidak ada hard delete atau purge yang belum disetujui.

```text
Jalankan F4 sesuai D05/D08 yang sudah diputuskan PM. Detail laporan terhapus dan
audit penuh hanya untuk SUPERADMIN; SR aktif hanya mendapat riwayat/tombstone.
Simpan KTM setidaknya sampai awal periode SR baru. Jangan menerapkan purge otomatis
setelah periode atau menghapus file yatim sampai retensi/purge policy ditetapkan.
Implementasikan edit dan soft-delete: owner laporan atau SUPERADMIN sah, alasan
wajib dan konfirmasi delete; SR lain ditolak server meskipun mengirim request
langsung. Recheck eligibility/ownership/lifecycle dalam transaksi sesuai pola repo.
Edit hanya field yang disepakati, simpan before/after, aktor, waktu dan alasan.
Soft delete menyimpan jejak, bukan menghapus row/audit/KTM secara fisik.

Histori koreksi mengikuti hak pelapor/admin; semua SR aktif dapat melihat
“Laporan [kode] dihapus oleh [nama SR] karena [alasan]” dan waktunya. Akses isi/KTM
terhapus mengikuti keputusan eksplisit, bukan disimpulkan dari izin tombstone.
Jika penggantian KTM belum disepakati, isolasi bagian itu dan laporkan blocker;
jangan menganggapnya disetujui atau mengganti lampiran dengan public URL.

Tes owner/non-owner/admin, alasan kosong, audit atomicity/rollback, retry duplicate,
edit-vs-delete serentak, akses revoked dan kebocoran histori. Verifikasi jejak hapus
tetap ada dan data deleted dapat dikecualikan statistik. Serahkan kontrak edit ke
Fariza, modal hapus ke Ardhian dan histori/QA ke Imba; jangan ubah assignment Jira.
```

### F5 — Statistik, tren dan drilldown (RSA-26)

**Deliverable:** agregasi laporan aktif yang cocok dengan daftar. **Gate keluar:** AC08 dan regresi terhadap create/edit/delete; bukan sekadar chart tampil.

```text
Jalankan F5 saja. Pastikan D04/D07 menetapkan makna periode/tanggal/zona waktu,
gedung historis dan granularitas tren. Implementasikan jumlah laporan aktif,
tren waktu dan perbandingan gedung pencatat dengan filter yang sama seperti list.
Hitung laporan, bukan mahasiswa unik, kategori atau status verifikasi. Deleted
selalu dikecualikan. Berikan kontrak drilldown yang mempertahankan filter sehingga
klik angka/grafik membuka daftar terkait; jangan invent filter periode baru.

Gunakan fixture lokal yang berisi beberapa gedung/tanggal, koreksi dan deleted.
Assert expected totals, empty state, batas tanggal, jumlah hasil daftar untuk
filter sama dan perubahan hitungan setelah mutasi. Uji sesuai strategi konsistensi
yang direview. Hindari duplikasi definisi filter antara query list dan statistik.
Serahkan contoh respons sintetis ke Fariza/Ardhian/Imba; jangan implementasikan
redesign frontend di fase backend ini.
```

### F6 — Integrasi, regresi dan review keamanan

**Deliverable:** alur utuh serta paket bukti CLI dan bug. **Gate keluar:** semua AC punya bukti atau gap eksplisit; gap blocker mencegah klaim siap UAT.

```text
Jalankan F6. Inspeksi hasil F2–F5 dan frontend tim terbaru; jangan mengulang atau
menimpa kontribusi mereka. Hubungkan UI yang tersedia ke kontrak aktual dan
perbaiki mismatch minimum pada scope create/list/detail/edit/delete/history/
dashboard/filter/drilldown. Jika UI belum tersedia, verifikasi API dan laporkan
handoff yang belum terpenuhi; jangan klaim integrasi UI selesai.

Verifikasi AC01–AC10 menggunakan synthetic fixtures. Prioritaskan authorization
server, IDOR data/file, inactive/revoked session, owner/admin, audit atomicity,
retry/race, KTM required/private dan statistik tanpa deleted. Periksa negative
paths serta regresi Identity/storage/module boundaries yang benar-benar tersentuh.
Jalankan focused tests, check:architecture, relevant lint/typecheck dan build;
cek script aktual sebelum memilih command atau menggunakan verify:pr. Hindari
check --write seluruh repo. Pisahkan baseline failure dari regresi perubahan.

Uji browser UI lokal dengan data sintetis mengikuti otorisasi tetap PM dan gate design system; live DB/R2/config/deployment
memerlukan izin terpisah; bila belum ada, tes lokal/fake tetap berjalan dan gap
live dicatat. Siapkan ringkasan PR/diff, hasil command, checklist AC, bug dan
kesiapan lingkungan untuk review Fariza. Jangan push/update Jira/merge otomatis.
```

### F7 — UAT, staging dan keputusan rilis

**Deliverable:** skrip UAT dan paket keputusan PM. **Gate keluar:** UAT/review dan otorisasi tindakan yang benar-benar dilakukan tercatat; production tetap terpisah.

```text
Jalankan persiapan F7. Baca bukti F6 dan keputusan D09. Siapkan checklist UAT
berbasis PRD: create dengan KTM/konfirmasi, lintas gedung list/detail/filter,
edit owner/admin dan penolakan non-owner, hapus/alasan/tombstone/histori,
dashboard/tren/drilldown serta penolakan akses tidak sah. Gunakan akun/mahasiswa
sintetis dan jangan buat/reset akun nyata. Tandai pemeriksa, expected result,
actual result dan bukti; kolom hasil tetap belum diuji sampai benar-benar diuji.

Siapkan rencana staging/rollback, daftar perubahan skema/config, kebutuhan izin
DB/R2/deploy, hasil CI/build/review yang tersedia dan daftar blocker go/no-go.
Periksa kebijakan CD aktual: jangan merge atau push ke jalur yang memicu deploy
sebagai cara menjalankan UAT. Jangan jalankan staging/deployment/migrasi/remote
mutation hanya karena target Jumat; perlu otorisasi tindakan/lingkungan eksplisit.
Browser/manual UAT juga belum diotorisasi oleh prompt persiapan ini.

Jika user memberikan izin eksplisit untuk langkah tertentu, jalankan hanya
langkah itu sesuai runbook lalu verifikasi hasilnya; izin staging tidak berarti
izin production. Fariza memegang keputusan go/no-go. Tanpa izin atau bukti UAT,
serahkan paket yang siap direview dan nyatakan status sebenarnya, bukan released.
```

## 4. Checklist handoff antar fase

Sebelum melanjutkan, cek: scope FR/issue terpenuhi; diff dan test relevan direview; kontrak FE sesuai implementasi; keputusan/gap TBD jelas; migration/config remote belum dijalankan tanpa izin; hasil build/tes/UAT dilabeli sesuai bukti. Kemajuan aktual dicatat di spreadsheet dan dikoordinasikan melalui WA; Jira hanya referensi item backlog.
