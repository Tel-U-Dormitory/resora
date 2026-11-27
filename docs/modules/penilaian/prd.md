# PRD — Sistem Penilaian dan Analitik Kinerja Senior Resident (SR)

**Modul:** P1-01 Penilaian & Analitik · **Epic:** [RSA-5](https://telkomdormitory.atlassian.net/browse/RSA-5)  
**Baseline sumber diperiksa:** 27 November 2026 (WIB)  
**Pemilik keputusan:** Fariza (PM) & HCO, dengan Nafi untuk keputusan teknis  
**Branch kerja:** `feat/modul-penilaian-sr`  
**Status dokumen:** Turunan keputusan PM pada spreadsheet `FR Modul Sistem` (27/11/2026) dan `Pedoman Pembuatan Website Penilaian Senior Resident (SR)` (27/11/2026); bukan bukti implementasi, ACC migrasi database remote, UAT, atau rilis. Detail bertanda **TBD** atau **Pending** belum disetujui untuk diimplementasikan.

---

## 1. Sumber dan batas dokumen

- [FR Modul Sistem — Tab P1-01 Penilaian & Analitik](https://docs.google.com/spreadsheets/d/1oDqX5oEaxT7wscJVUJHIsRL_y6rlSXeiVOiDTx2hr2Y/edit#gid=0): `A1:G38` (diperbarui 27 November 2026) sebagai sumber keputusan `FR-EVAL-001` s.d. `FR-EVAL-037` (**36 Approved, 1 Pending, 0 Rejected**).
- [Pedoman Pembuatan Website Penilaian Senior Resident (SR)](https://docs.google.com/document/d/1u197d9Oc9rMYkhFSkvo6Gv_DOCrQfMyiJhn9FeKyg8o/edit) (27 November 2026): acuan resmi rumus perhitungan, bobot komponen, indikator, aturan kehadiran, penambahan/pengurangan poin, evaluasi eksternal, dan struktur rekapitulasi yang dirujuk oleh kolom *Catatan Review PM*.
- [FR Modul Sistem — Tab P1-04 Dashboard RESORA](https://docs.google.com/spreadsheets/d/1oDqX5oEaxT7wscJVUJHIsRL_y6rlSXeiVOiDTx2hr2Y/edit#gid=103) (`FR-DASH-001` s.d. `FR-DASH-009`, khususnya `FR-DASH-003`) serta [kontrak discovery Dashboard](../dashboard/DASH-01-discovery.md) dan [kesiapan integrasi DASH-05](../dashboard/DASH-05-integration.md) untuk batas penyediaan ringkasan penilaian ke Dashboard Utama RESORA.
- [FR Modul Sistem — Tab P3-01 Penilaian Sesama SR & P3-02 Penilaian Maba ke SR](https://docs.google.com/spreadsheets/d/1oDqX5oEaxT7wscJVUJHIsRL_y6rlSXeiVOiDTx2hr2Y/edit#gid=301): seluruh baris berstatus **Pending** (scope P3). Kuesioner in-app sesama SR dan survei in-app Maba **bukan** scope P1-01; pada P1-01, penilaian GForm SR/Maba masuk melalui fitur **impor file respons GForm** (`FR-EVAL-015`, `FR-EVAL-033`).
- [PRD sistem](../../prd.md), [Technical Architecture](../../architecture.md), [Data Ownership](../../module-data-ownership.md), [ADR 0006](../../decisions/0006-modular-monolith.md), dan [Design System RESORA v1.1](../../design-system.md) berlaku penuh untuk autentikasi, otorisasi server-side, isolasi tabel domain, dan standar UI/UX.
- Referensi backlog Jira: Epic [RSA-5](https://telkomdormitory.atlassian.net/browse/RSA-5) beserta item terkait yang tercatat pada arsitektur/dokumen proyek ([RSA-11](https://telkomdormitory.atlassian.net/browse/RSA-11) impor penilaian, [RSA-13](https://telkomdormitory.atlassian.net/browse/RSA-13) analitik/ringkasan penilaian, [RSA-15](https://telkomdormitory.atlassian.net/browse/RSA-15) ekspor penilaian, serta [RSA-27](https://telkomdormitory.atlassian.net/browse/RSA-27) dan [RSA-28](https://telkomdormitory.atlassian.net/browse/RSA-28) untuk keputusan ambang batas & hak akses HCO). Sesuai arahan PM 25 November 2026, sumber kebenaran keputusan persyaratan adalah spreadsheet PM dan koordinasi WA; Jira berfungsi sebagai referensi item backlog.

PRD ini mendefinisikan perilaku bisnis, rumus perhitungan yang telah disahkan, matriks hak akses, dan batas persetujuan. Rencana fase implementasi, urutan kerja, dan prompt per fase berada di [roadmap.md](roadmap.md).

---

## 2. Tujuan dan hasil yang diharapkan

Modul Penilaian & Analitik (`penilaian`) menyediakan pengelolaan dan evaluasi kinerja Senior Resident (SR) secara terstruktur, dapat diaudit, dan terikat pada periode evaluasi serta masa kepengurusan (*tenure*) SR:

1. **Periode evaluasi & jadwal (`FR-EVAL-001`, `013`):** HCO membuka/menutup periode evaluasi dan mengatur jadwal evaluasi per jenis penilaian, terikat ke periode evaluasi dan tenure SR tanpa mencampur histori antarperiode.
2. **Nilai kinerja berbobot tanpa batas maksimum 100 (`FR-EVAL-002`–`007`, `031`–`033`):**
   - **Event Tahunan:** bobot **25%** per event (4 indikator 0–100: *Komitmen, Teamwork, Sikap, Kontribusi*).
   - **Event Bulanan:** bobot **10%** per event (4 indikator 0–100).
   - **Event Mingguan:** bobot **10%** per event (4 indikator 0–100).
   - **Penilaian Departemen:** bobot **25%** per periode triwulanan (diisi oleh Kadiv/KADEP saja; 4 indikator 0–100).
   - **GForm SR dan Maba:** bobot **50%** per periode triwulanan (diimpor oleh HCO dari GForm eksternal 20 pertanyaan skala 1–5; target SR segedung kecuali diri sendiri).
   - Setiap event dibobotkan secara individual lalu dijumlahkan bersama nilai berbobot Departemen dan GForm; sistem **dilarang** merata-ratakan seluruh event sebelum dikalikan bobot, dan total nilai berbobot **tidak dibatasi maksimum 100**.
3. **Komponen terpisah dari nilai kinerja berbobot (`FR-EVAL-002`, `008`–`010`, `034`–`035`):**
   - **Poin Kehadiran:** akumulatif tanpa batas total dan tanpa konversi persentase, menggunakan modul Attendance RESORA sebagai sumber utama serta input manual/impor sebagai fallback untuk data historis atau kegiatan di luar modul.
   - **Poin Tambahan & Pengurangan:** diajukan oleh Kadiv/KADEP dan diverifikasi/disetujui oleh HCO/Inti; menghasilkan `Total Poin Bersih = Total Poin Tambahan − Total Poin Pengurangan`.
   - **Evaluasi Eksternal ASUS & Ditmawa:** diimpor oleh HCO dari GForm 10 pertanyaan skala 1–5 (skor 10–50 per respons), disimpan dan ditampilkan tersendiri tanpa masuk ke nilai akhir berbobot.
4. **Integritas kelengkapan, finalisasi, revisi berversi, dan privasi (`FR-EVAL-011`–`012`, `019`–`021`, `029`–`030`, `037`):**
   - Penilaian wajib yang belum masuk membuat status menjadi **belum lengkap** dan **tidak boleh dianggap bernilai 0**.
   - Finalisasi periode oleh HCO **diblokir** selama masih ada komponen/penilaian wajib yang belum lengkap.
   - Hasil pra-final hanya dapat dilihat oleh **HCO dan Inti** (serta penilai atas penilaian yang dikirimnya sendiri); aktor lain hanya dapat melihat hasil sesuai cakupan setelah berstatus **final**.
   - Identitas pemberi penilaian dan komentar tidak ditampilkan pada rekap, grafik, tampilan SR target, maupun ekspor di luar role yang secara eksplisit berwenang (HCO).
   - Koreksi nilai wajib menyertakan alasan dan jejak audit sebelum/sesudah; perubahan setelah final wajib melalui **pembukaan revisi** oleh HCO dengan alasan, menghasilkan **versi hasil baru** dan audit perubahan.

---

## 3. Cakupan dan traceability FR

Berdasarkan tab `P1-01 Penilaian & Analitik` yang diperbarui PM pada **27 November 2026**, terdapat **37 FR** dengan rincian **36 Approved**, **1 Pending** (`FR-EVAL-036`), dan **0 Rejected**.

| FR ID | Perilaku yang disetujui / dicatat | Aktor & akses sumber | Status PM | Referensi Jira / Catatan |
| --- | --- | --- | --- | --- |
| `FR-EVAL-001` | Kelola periode evaluasi SR (buka/tutup periode dan jadwal tiap jenis penilaian) | HCO (kelola); HCO/Inti (lihat status sesuai kewenangan) | **Approved** | RSA-5 · Jadwal: tahunan/bulanan/departemen/GForm tiap 3 bulan; mingguan tiap 2 minggu; eksternal TBD |
| `FR-EVAL-002` | Lihat rekap penilaian SR: nilai berbobot, poin kehadiran, poin tambahan/pengurangan, dan evaluasi eksternal secara terpisah | HCO/Inti/KADEP/Pimpinan SR sesuai matriks; SR (hasil sendiri setelah final); Kadiv/Sekdep (penilaian yang dikirim sendiri); Ditmawa (agregat final) | **Approved** | RSA-5 · Pra-final hanya HCO/Inti; identitas penilai & komentar disembunyikan |
| `FR-EVAL-003` | Lihat nilai event berdasarkan 4 indikator: Komitmen, Teamwork, Sikap, Kontribusi (0–100) | HCO/Inti/KADEP; Pimpinan SR (per anggota & komponen); SR (hasil sendiri setelah final); penilai (kiriman sendiri) | **Approved** | RSA-5 · Penilai: PIC, Kadiv, Wakadiv, anggota terlibat; wajib menilai seluruh roster event selain diri sendiri |
| `FR-EVAL-004` | Lihat nilai rata-rata setiap event dari seluruh penilaian evaluator eligible yang valid | HCO/Inti/KADEP; Pimpinan SR; SR (hasil sendiri setelah final) | **Approved** | RSA-5 · Nilai penilai = rata-rata 4 indikator; belum masuk = belum lengkap (bukan 0) |
| `FR-EVAL-005` | Lihat hasil penilaian event tahunan (25%/event), bulanan (10%/event), dan mingguan (10%/event) | HCO/Inti/KADEP; Pimpinan SR; SR (setelah final); Ditmawa (agregat final) | **Approved** | RSA-5 · Bobot per event individual lalu dijumlahkan; dilarang rata-rata lintas event sebelum bobot |
| `FR-EVAL-006` | Lihat nilai penilaian departemen (25%) dan GForm SR/Maba (50%) | HCO/Inti/KADEP; Pimpinan SR; SR (setelah final); Ditmawa (agregat final) | **Approved** | RSA-5 · Departemen oleh Kadiv saja tiap 3 bln; GForm 20 soal (1–5) tiap 3 bln; agregasi multi-periode GForm TBD |
| `FR-EVAL-007` | Lihat total nilai kinerja berbobot tanpa batas maksimum 100 | HCO/Inti/KADEP/Pimpinan SR; SR (setelah final); Ditmawa (agregat final) | **Approved** | RSA-5 · Total = Σ(event berbobot) + departemen berbobot + GForm berbobot |
| `FR-EVAL-008` | Lihat akumulasi poin kehadiran terpisah dari nilai kinerja berbobot | HCO/Inti/KADEP; SR (poin pribadi); Pimpinan SR sesuai cakupan | **Approved** | RSA-5 · Attendance RESORA sumber utama; fallback manual/impor; definisi 5K masih pending |
| `FR-EVAL-009` | Lihat rekap transaksi poin tambahan/pengurangan dan total poin bersih SR | HCO/Inti/KADEP; Pimpinan SR; SR (poin bersih sendiri); Kadiv (pengajuan sendiri) | **Approved** | RSA-5 · Disetujui PM 27/11; Total bersih = tambahan − pengurangan |
| `FR-EVAL-010` | Simpan dan tampilkan evaluasi eksternal ASUS/Ditmawa terpisah dari KPI berbobot | HCO (impor/kelola); HCO/Inti (lihat sesuai kewenangan) | **Approved** | RSA-5 · Disetujui PM 27/11; GForm 10 soal (1–5), skor 10–50; belum ada bobot resmi |
| `FR-EVAL-011` | Lihat status data penilaian: belum tersedia, belum lengkap, siap difinalisasi, atau final | HCO/Inti (pra-final); role lain hanya status/hasil final; SR (sendiri setelah final) | **Approved** | RSA-5 · Nilai kosong dilarang dianggap 0 |
| `FR-EVAL-012` | Lihat rincian nilai per komponen, indikator, event, sumber penilaian, dan periode sesuai matriks | HCO/Inti/KADEP; Pimpinan SR; SR (sendiri setelah final); Kadiv/Sekdep (kiriman sendiri); Ditmawa (agregat final) | **Approved** | RSA-5 · Rincian penilai & komentar dibatasi |
| `FR-EVAL-013` | Lihat riwayat nilai dan poin SR berdasarkan periode evaluasi serta tenure kepengurusan | HCO/Inti/KADEP/Pimpinan SR; SR (sendiri setelah final); Ditmawa (agregat final) | **Approved** | RSA-5 · Histori tidak tercampur antarperiode/tenure |
| `FR-EVAL-014` | Input data nilai komponen secara manual sesuai sumber data dan kewenangan | HCO (fallback manual yang diizinkan); Kadiv (penilaian departemen); evaluator event (penilaian event) | **Approved** | RSA-5 · Tidak menggantikan Attendance RESORA atau impor GForm |
| `FR-EVAL-015` | Impor data penilaian dari file, termasuk respons GForm SR/Maba dan evaluasi eksternal ASUS/Ditmawa | HCO (pengimpor/pengelola) | **Approved** | RSA-11 · Simpan respons individual lengkap |
| `FR-EVAL-016` | Lihat kesalahan validasi saat input atau impor data penilaian | HCO (penginput/pengimpor); penilai terkait pada pengiriman sendiri | **Approved** | RSA-11 · Validasi identitas, target, periode, eligibility, rentang, kelengkapan, format, referensi |
| `FR-EVAL-017` | Pratinjau data valid dan bermasalah sebelum mengonfirmasi impor | HCO (pengimpor) | **Approved** | RSA-11 · Ringkasan valid/invalid/duplikat per baris; tolak partial import tak terkontrol |
| `FR-EVAL-018` | Deteksi dan cegah duplikasi data penilaian saat input atau impor ulang | HCO; penilai terkait pada pengiriman sendiri | **Approved** | RSA-11 · Deduplikasi berdasarkan sumber, periode, responden, target, event, konteks |
| `FR-EVAL-019` | Koreksi nilai penilaian dengan alasan perubahan dan riwayat sebelum/sesudah | HCO berwenang | **Approved** | RSA-5 · Audit wajib; pasca-final wajib lewat pembukaan revisi & versi baru |
| `FR-EVAL-020` | Validasi dan tampilkan status kelengkapan seluruh komponen wajib sebelum finalisasi | HCO (kelola); HCO/Inti (lihat pra-final); role lain hanya hasil final | **Approved** | RSA-5 · Finalisasi diblokir bila ada komponen wajib belum lengkap |
| `FR-EVAL-021` | Ekspor rekap penilaian sesuai data yang boleh dibaca oleh masing-masing role | Semua role yang memiliki hak baca sesuai scope & field tampilan | **Approved** | RSA-15 · Filter server-side; tanpa identitas penilai/komentar untuk role tak berwenang |
| `FR-EVAL-022` | Akses dashboard analitik penilaian sesuai kewenangan dan status hasil | HCO/Inti/KADEP; Pimpinan SR (KPI anggota per komponen, setelah final) | **Approved** | RSA-13 · Pra-final hanya HCO/Inti; Ditmawa hanya agregat final |
| `FR-EVAL-023` | Lihat jumlah SR, kelengkapan penilaian, dan ringkasan perkembangan sesuai scope akses | HCO/Inti/KADEP; Pimpinan SR sesuai penugasan | **Approved** | RSA-13 · Agregasi mengikuti matriks izin |
| `FR-EVAL-024` | Filter dashboard berdasarkan periode, departemen, dan gedung sesuai scope akses | HCO/Inti/KADEP/Pimpinan SR sesuai scope; Ditmawa hanya agregat final | **Approved** | RSA-13 · Validasi filter di server; parameter UI tidak boleh memperluas scope |
| `FR-EVAL-025` | Lihat grafik distribusi dan perbandingan hasil penilaian sesuai scope akses | HCO/Inti/KADEP; Pimpinan SR; Ditmawa (agregat final) | **Approved** | RSA-13 · Tanpa identitas penilai atau komentar |
| `FR-EVAL-026` | Buka detail hasil penilaian individual sesuai matriks akses yang disahkan PM | HCO/Inti/KADEP (seluruh SR detail); Pimpinan SR (per anggota/komponen); SR (milik sendiri); Kadiv/Sekdep (kiriman sendiri); Ditmawa (agregat saja) | **Approved** | RSA-5, RSA-28 · Pemetaan role Pimpinan SR ke MOD-07 harus diverifikasi |
| `FR-EVAL-027` | Buka dashboard rekap nilai penilaian pribadi | SR aktif (data diri sendiri setelah final) | **Approved** | RSA-5 · Detail komponen & total; tanpa respons individual/identitas penilai |
| `FR-EVAL-028` | Lihat status kinerja pribadi jika ambang penilaian resmi telah ditetapkan | SR aktif (diri sendiri); HCO (mengelola ambang) | **Approved** | RSA-27 · Fitur disetujui, namun angka ambang belum ditetapkan (jangan buat label/angka otomatis) |
| `FR-EVAL-029` | Lihat komponen penilaian yang belum lengkap pada rekap | HCO/Inti (pra-final); SR (milik sendiri setelah final); role lain hanya status final | **Approved** | RSA-5 · Menampilkan komponen wajib yang menahan finalisasi |
| `FR-EVAL-030` | Lihat data penilaian sesuai hak akses, role, periode, dan cakupan penugasan | Matriks penuh HCO/Inti/KADEP/Pimpinan SR/SR/Kadiv/Sekdep/Ditmawa/SUPERADMIN | **Approved** | RSA-28 · Visibilitas identitas mentah responden di luar HCO & akses komentar SUPERADMIN masih TBD |
| `FR-EVAL-031` | Kirim penilaian event untuk setiap SR yang tercantum pada roster event | PIC, Kadiv, Wakadiv, dan anggota yang terlibat sebagai evaluator eligible | **Approved** | RSA-5 · Wajib menilai seluruh target roster selain diri sendiri; 4 indikator 0–100 |
| `FR-EVAL-032` | Kirim penilaian departemen untuk anggota departemen pada periode triwulanan | Kadiv (penilai); anggota departemen terkait (target); HCO (pengelola periode) | **Approved** | RSA-5 · Hanya Kadiv; Sekdep bukan penilai; 4 indikator 0–100 |
| `FR-EVAL-033` | Impor dan rekap respons GForm SR/Maba untuk penilaian SR dalam gedung yang sama | HCO (impor/kelola); SR dan Maba (responden eksternal); SR (target) | **Approved** | RSA-11 · 20 soal skala 1–5 tiap 3 bln; simpan respons individual lengkap; impor file, bukan form in-app |
| `FR-EVAL-034` | Gunakan Attendance RESORA sebagai sumber utama poin kehadiran dengan fallback input manual/impor | HCO (pengelola); modul Attendance RESORA (sumber utama); SR (subjek) | **Approved** | RSA-5 · Rapat All Panitia/Event seluruh SR (maks 10), sebagian panitia (maks 6; faktor 0,6), Sidak (configurable); 5K pending |
| `FR-EVAL-035` | Ajukan dan setujui transaksi penambahan atau pengurangan poin SR | Kadiv (pengaju); HCO/Inti (verifikator & penyetuju); SR (penerima) | **Approved** | RSA-5 · Hanya transaksi disetujui HCO/Inti yang masuk total poin bersih |
| `FR-EVAL-036` | Kirim dan kelola komentar/masukan penilaian yang anonim terhadap SR yang dinilai | SR/responden (pemberi); HCO (lihat identitas & isi); SR target (tidak melihat) | **Pending** | **Di luar scope implementasi langsung:** pengecualian akses komentar bagi SUPERADMIN belum diputuskan PM |
| `FR-EVAL-037` | Finalisasi hasil penilaian KPI per periode dan kelola pembukaan revisi | HCO (finalisasi & buka revisi); Inti (lihat pra-final); role lain (hasil final sesuai matriks) | **Approved** | RSA-5 · Finalisasi diblokir jika belum lengkap; revisi pasca-final wajib alasan, versi baru, dan audit |

### Di luar scope implementasi (Out of Scope & Guardrails)

1. **`FR-EVAL-036` (Pending):** Fitur pengiriman dan moderasi komentar anonim mandiri serta kebijakan pengecualian `SUPERADMIN` atas komentar masih **Pending**. Komentar/feedback yang terbawa dari impor GForm (`FR-EVAL-033`) atau form penilaian hanya boleh disimpan secara internal dan hanya dapat dibaca oleh **HCO**; jangan membuka UI komentar anonim mandiri atau mengekspos komentar ke role lain (termasuk SUPERADMIN) sebelum keputusan PM keluar.
2. **Kuesioner In-App P3-01 & P3-02 (Pending):** Pembuatan kuesioner in-app penilaian sesama SR (`FR-PEER-001`–`024`) dan survei in-app Maba ke SR (`FR-MABA-001`–`024`) berada di tab P3 yang seluruhnya **Pending**. Untuk P1-01, respons GForm SR/Maba (20 soal) dan GForm Eksternal ASUS/Ditmawa (10 soal) diproses melalui **impor file** oleh HCO (`FR-EVAL-015`, `FR-EVAL-033`).
3. **Ambang kinerja pribadi (`FR-EVAL-028` / `RSA-27`):** Nilai ambang (*threshold*) "memenuhi standar / perlu peningkatan" belum ditetapkan HCO/PM. Sistem harus menyiapkan dukungan konfigurasi/tampilan status bila ambang resmi telah dikonfigurasi oleh HCO, tetapi **dilarang mengarang angka threshold default atau melabeli status kinerja SR secara otomatis** ketika ambang belum ditetapkan.
4. **Definisi Izin 5K (`FR-EVAL-008`, `FR-EVAL-034`):** Definisi resmi alasan 5K belum diberikan oleh HCO/PM. Jangan mengaktifkan pemetaan otomatis status izin 5K sebelum ketentuan resmi dikunci.
5. **Pembobotan Evaluasi Eksternal (`FR-EVAL-010`):** Belum ada bobot resmi untuk evaluasi ASUS/Ditmawa; nilainya (rentang 10–50) wajib tetap terpisah dan tidak boleh dimasukkan ke total nilai kinerja berbobot.
6. **Login Aktor Eksternal (`MAHASISWA`, `ASUS`, `DITMAWA`):** Sesuai [PRD Sistem §3](../../prd.md#3-primary-actors-and-permission-model), mekanisme login untuk `MAHASISWA`, `ASUS`, dan `DITMAWA` masih *Deferred*. Jangan membangun sistem autentikasi baru untuk mahasiswa atau pihak eksternal di modul ini.

---

## 4. Aktor dan matriks akses

Semua pemeriksaan hak akses wajib ditegakkan di server (*server-enforced authorization*) pada setiap prosedur tRPC menggunakan identitas live dari kontrak publik Identity (`getLiveOperationalIdentity` / `readOperationalIdentity`). Menyembunyikan menu atau tombol di UI bukan kontrol keamanan.

### 4.1 Pemetaan aktor sistem terhadap istilah Pedoman / FR

| Istilah di FR / Pedoman | Pemetaan pada Identity & Organisasi RESORA | Catatan & batas |
| --- | --- | --- |
| **HCO** | `actor = 'SR'` aktif, tenure `ACTIVE`, `departmentCode = 'HCO'` (`KADEP`, `SEKDEP`, `ANGGOTA`) dengan assignment valid | Pengelola utama periode evaluasi, impor GForm, fallback manual, koreksi nilai, moderasi/baca komentar, dan finalisasi/revisi. (Lihat D01 untuk pemisahan operasi sensitif `KADEP HCO` vs anggota HCO). |
| **Inti** | `actor = 'SR'` aktif, tenure `ACTIVE`, `departmentCode = 'INTI'` (`KETUM`, `WAKETUM`, `SEKRETARIS`, `BENDAHARA`) | Melihat status dan hasil pra-final maupun final lintas SR (tanpa identitas penilai/komentar), serta menyetujui transaksi poin tambahan/pengurangan (`FR-EVAL-035`). |
| **KADEP / Kadiv** | `actor = 'SR'` aktif, tenure `ACTIVE`, `positionCode = 'KADEP'` pada departemen non-INTI (atau `committeePosition = 'KADEP'` pada konteks kepanitiaan event) | Sesuai keputusan PM di [PRD Sistem §3](../../prd.md#3-primary-actors-and-permission-model), `KADEP` menggantikan istilah lama `KADIV` untuk jabatan struktural departemen. Sebagai penilai departemen (`FR-EVAL-032`) dan pengaju poin (`FR-EVAL-035`), hanya `KADEP` struktural yang berwenang; `SEKDEP` tidak menjadi penilai departemen. |
| **Sekdep** | `actor = 'SR'` aktif, tenure `ACTIVE`, `positionCode = 'SEKDEP'` | Tidak menilai evaluasi departemen (`FR-EVAL-006`, `032`). Hanya dapat melihat penilaian event yang dikirimnya sendiri serta hasil akhir pribadinya sebagai SR setelah final. |
| **Evaluator Event (`PIC, Kadiv, Wakadiv, Anggota terlibat`)** | Peserta aktif dalam snapshot roster event (`event_participants`) sesuai peran kepanitiaan/keterlibatan | Menilai seluruh SR lain pada roster event tersebut (`FR-EVAL-003`, `031`) dan melihat penilaian yang dikirimnya sendiri. Pemetaan kode jabatan kepanitiaan (`PIC1`, `PIC2`, `PJ`, `KADEP`, `SEKDEP`, `ANGGOTA`) diatur pada keputusan D02. |
| **Pimpinan SR** | Disebut pada `FR-EVAL-002`–`009`, `012`–`013`, `022`–`026`, `030` | `FR-EVAL-026` menetapkan: *"Pemetaan role Pimpinan SR ke MOD-07 harus diverifikasi"*. Tidak ada kode jabatan/aktor `PIMPINAN_SR` di database Identity. Sampai PM memverifikasi D06, jangan membuat role/privilege baru di luar `INTI` dan `KADEP` yang sudah sah. |
| **SR Aktif** | `actor = 'SR'` aktif dengan assignment valid | Melihat rekap dan detail komponen **diri sendiri hanya setelah periode berstatus `FINAL`** (`FR-EVAL-002`, `027`), tanpa identitas penilai, tanpa komentar, dan tanpa respons individual. |
| **Ditmawa / ASUS** | `actor = 'DITMAWA' | 'ASUS'` (login *Deferred* di PRD Sistem §3) | Hanya berhak atas **agregat final** (`FR-EVAL-002`, `022`, `025`, `026`, `030`), bukan detail individual SR. Karena login Ditmawa/ASUS belum diaktifkan pada pilot SR, penyampaian laporan agregat final dilakukan melalui ekspor berizin oleh HCO/Inti sampai onboarding aktor eksternal disetujui (lihat D06). |
| **SUPERADMIN** | Akun aktif (`SR` atau `SYSTEM_ADMIN`) dengan grant eksplisit `SUPERADMIN` (SA-01 / SA-03) | Memiliki akses operasional dan baca lintas departemen/periode sesuai baseline global, **kecuali** akses terhadap isi/identitas komentar anonim (`FR-EVAL-030`, `036`) yang masih **Pending** keputusan PM. Dedicated `SYSTEM_ADMIN` bukan subjek penilaian SR dan tidak masuk roster SR yang dinilai. |

### 4.2 Matriks operasi dan visibilitas data

| Operasi / Data | HCO | Inti | KADEP (Struktural) | Sekdep / Evaluator Event | SR Aktif (Subjek) | SUPERADMIN Sah |
| --- | --- | --- | --- | --- | --- | --- |
| Kelola periode evaluasi, jadwal, dan ambang batas (`FR-EVAL-001`, `028`) | **Ya** | Lihat status saja | Lihat status final | Lihat jadwal pengiriman sendiri | Lihat status pribadi setelah final | **Ya** |
| Kirim penilaian event (`FR-EVAL-031`) | Jika masuk roster evaluator event | Jika masuk roster evaluator event | Jika masuk roster evaluator event | Jika masuk roster evaluator event | Jika masuk roster evaluator event | Tidak untuk `SYSTEM_ADMIN` (bukan SR) |
| Kirim penilaian departemen triwulanan (`FR-EVAL-032`) | Jika `KADEP HCO` untuk anggota HCO | Lihat status (penilai KADEP/Inti: lihat D03) | **Ya**, untuk anggota departemennya | **Ditolak** (`Sekdep` bukan penilai) | **Ditolak** | Sesuai gate administratif / D03 |
| Impor & pratinjau GForm SR/Maba & Eksternal (`FR-EVAL-015`–`018`, `033`) | **Ya** | Ditolak (hanya lihat hasil) | Ditolak | Ditolak | Ditolak | **Ya** |
| Ajukan transaksi poin tambahan/pengurangan (`FR-EVAL-035`) | Lihat & verifikasi (atau ajukan jika KADEP HCO) | Lihat & verifikasi | **Ya** (ajukan; lihat pengajuan sendiri) | Ditolak | Ditolak | **Ya** |
| Setujui / tolak transaksi poin tambahan/pengurangan (`FR-EVAL-035`) | **Ya** | **Ya** | Ditolak (kecuali KADEP HCO) | Ditolak | Ditolak | **Ya** |
| Lihat hasil & kelengkapan **Pra-Final** (`FR-EVAL-002`, `011`, `020`, `029`, `037`) | **Ya** (seluruh SR) | **Ya** (seluruh SR, tanpa identitas penilai/komentar) | **Ditolak** (hanya kiriman penilaian yang dibuat sendiri) | **Ditolak** (hanya kiriman penilaian yang dibuat sendiri) | **Ditolak** | **Ya** (tanpa komentar sampai D07 diputuskan) |
| Lihat hasil, rincian komponen, & dashboard analitik **Setelah Final** (`FR-EVAL-002`, `012`, `022`–`027`, `030`) | **Ya** (seluruh SR detail) | **Ya** (seluruh SR detail, tanpa identitas penilai/komentar) | **Ya** (seluruh SR detail sesuai `FR-EVAL-026`/`030`, tanpa identitas penilai/komentar) | Hanya kiriman sendiri & hasil pribadi sebagai SR | **Hanya hasil pribadi sendiri** (tanpa identitas penilai, komentar, atau respons individual) | **Ya** (lintas periode, tanpa komentar sampai D07 diputuskan) |
| Lihat identitas mentah pemberi penilaian / responden & isi komentar (`FR-EVAL-002`, `030`, `033`, `036`) | **Ya** (hanya HCO) | **Ditolak** | **Ditolak** | **Ditolak** | **Ditolak** | **Pending (D07)** — ditahan sampai keputusan PM |
| Koreksi nilai dengan alasan, finalisasi periode, & buka revisi berversi (`FR-EVAL-019`, `020`, `037`) | **Ya** (dengan alasan & audit atomik) | Ditolak | Ditolak | Ditolak | Ditolak | **Ya** (dengan alasan & audit atomik) |
| Ekspor rekap penilaian (`FR-EVAL-021`) | Sesuai scope baca HCO | Sesuai scope baca Inti (tanpa identitas penilai/komentar) | Sesuai scope baca KADEP setelah final (tanpa identitas penilai/komentar) | Sesuai scope baca sendiri | Hanya rekap pribadi setelah final | Sesuai scope baca SUPERADMIN |

---

## 5. Alur dan aturan bisnis

### 5.1 Pengelolaan periode evaluasi, tenure SR, dan jadwal — `FR-EVAL-001`, `FR-EVAL-013`

1. Setiap periode evaluasi wajib terikat secara eksplisit ke satu periode kepengurusan SR (`sr_periods` milik modul Identity). Roster SR yang dievaluasi pada periode tersebut berasal dari keanggotaan periode (`sr_period_memberships`) sehingga histori nilai dan poin tidak pernah tercampur antarperiode atau antartenure.
2. HCO dapat membuat, membuka, dan menutup periode evaluasi serta mengatur jadwal pembukaan/penutupan masing-masing instrumen penilaian sesuai Pedoman:
   - **Event Tahunan:** dievaluasi setiap **3 bulan** sekali (rencana 5–10 event).
   - **Event Bulanan:** dievaluasi setiap **3 bulan** sekali (rencana 3–6 event).
   - **Event Mingguan:** dievaluasi setiap **2 minggu** sekali (rencana 2–3 event).
   - **Penilaian Departemen:** dievaluasi setiap **3 bulan** sekali.
   - **GForm SR dan Maba:** dievaluasi setiap **3 bulan** sekali.
   - **Evaluasi Eksternal ASUS dan Ditmawa:** jadwal belum ditentukan (**TBD**); tetap dapat diimpor oleh HCO pada periode evaluasi terkait tanpa memblokir komponen berbobot.
3. Siklus hidup status data penilaian pada suatu periode (`FR-EVAL-011`):
   - `BELUM_TERSEDIA`: periode evaluasi belum memiliki konfigurasi komponen/data penilaian.
   - `BELUM_LENGKAP`: sebagian komponen/penilaian wajib belum masuk.
   - `SIAP_DIFINALISASI`: seluruh komponen dan penilaian wajib untuk seluruh SR target pada periode tersebut telah lengkap dan valid, tetapi belum difinalisasi oleh HCO.
   - `FINAL`: telah difinalisasi oleh HCO; hasil terbuka bagi role selain HCO/Inti sesuai matriks akses.

### 5.2 Penilaian Event (Tahunan 25%, Bulanan 10%, Mingguan 10%) — `FR-EVAL-003`–`005`, `014`, `031`

1. **Kategori & Bobot Event:**
   - **Event Tahunan:** bobot **25%** (`0.25`) untuk **setiap** event tahunan.
   - **Event Bulanan:** bobot **10%** (`0.10`) untuk **setiap** event bulanan.
   - **Event Mingguan:** bobot **10%** (`0.10`) untuk **setiap** event mingguan.
2. **Empat Indikator Wajib (`0–100`):**
   - `Komitmen` (0–100): tanggung jawab dan konsistensi dalam menjalankan tugas.
   - `Teamwork` (0–100): kemampuan bekerja sama dengan anggota lain.
   - `Sikap` (0–100): perilaku, kedisiplinan, dan etika selama kegiatan.
   - `Kontribusi` (0–100): keaktifan dan kontribusi terhadap keberhasilan kegiatan.
   - Penilai memberikan skor langsung dalam rentang integer/numerik `0–100` untuk masing-masing indikator (bukan pengurangan dari 100).
3. **Evaluator & Target:**
   - Penilai event terdiri dari **PIC, Kadiv, Wakadiv, dan anggota yang terlibat** (`FR-EVAL-003`, `031`).
   - Target penilaian adalah seluruh SR yang tercantum dalam roster event tersebut.
   - Setiap evaluator eligible **wajib** menilai seluruh target pada roster event **kecuali dirinya sendiri** (*self-evaluation* ditolak server).
   - Pengiriman ganda untuk kombinasi `(periode, event, evaluator, target)` yang sama ditolak (`FR-EVAL-018`, `031`).
4. **Rumus Perhitungan Event:**
   - Nilai dari satu penilai ke satu target SR pada satu event:
     $$\text{Nilai Penilai} = \frac{\text{Komitmen} + \text{Teamwork} + \text{Sikap} + \text{Kontribusi}}{4}$$
   - Nilai satu event untuk satu target SR dari $m$ penilai valid:
     $$\text{Nilai Event} = \frac{\sum_{i=1}^{m} \text{Nilai Penilai}_i}{m}$$
   - Nilai berbobot satu event:
     $$\text{Nilai Berbobot Event} = \text{Nilai Event} \times \text{Bobot Kategori Event}$$
     dengan $\text{Bobot Kategori Event} \in \{0.25, 0.10\}$.
   - Total nilai berbobot per kategori event (Tahunan / Bulanan / Mingguan) adalah **penjumlahan seluruh nilai berbobot masing-masing event** dalam kategori tersebut:
     $$\text{Total Kategori} = \sum_{k=1}^{n} (\text{Nilai Event}_k \times \text{Bobot})$$
   - **Larangan keras:** Sistem **tidak boleh** menghitung rata-rata beberapa event terlebih dahulu sebelum mengalikan bobot (`FR-EVAL-005`, Pedoman §2, §3.5, §13.3).
   - Apabila masih ada evaluator wajib yang belum mengirim penilaian pada suatu event, event tersebut berstatus **belum lengkap** (`BELUM_LENGKAP`), bukan bernilai `0` (`FR-EVAL-004`).

### 5.3 Penilaian Departemen (25%) — `FR-EVAL-006`, `014`, `032`

1. Dilakukan setiap **3 bulan** sekali dengan bobot **25%** (`0.25`).
2. **Penilai tunggal:** Hanya **Kadiv (`KADEP` struktural)** departemen terkait yang berwenang mengisi penilaian departemen untuk anggota departemennya; **`SEKDEP` dilarang menjadi penilai departemen** (`FR-EVAL-006`, `032`). Penilai tidak menilai dirinya sendiri (lihat D03 untuk penilai atas KADEP/Inti).
3. Menggunakan empat indikator yang sama dengan rentang `0–100`: **Komitmen**, **Teamwork**, **Sikap**, dan **Kontribusi**.
4. **Rumus Perhitungan Departemen:**
   $$\text{Nilai Departemen} = \frac{\text{Komitmen} + \text{Teamwork} + \text{Sikap} + \text{Kontribusi}}{4}$$
   $$\text{Nilai Akhir Departemen} = \text{Nilai Departemen} \times 0.25$$
   (Maksimal `25` poin untuk satu periode penilaian departemen). Jika terdapat beberapa periode penilaian yang digabungkan, setiap hasil periode dijumlahkan sesuai periode yang ditetapkan (`Pedoman §4.3`).
5. Jika Kadiv/KADEP belum mengirim penilaian untuk seorang anggota, komponen departemen anggota tersebut berstatus **belum lengkap** (`BELUM_LENGKAP`) dan menahan finalisasi (`FR-EVAL-020`, `032`).

### 5.4 Impor GForm SR/Maba (50%) dan Evaluasi Eksternal ASUS/Ditmawa — `FR-EVAL-006`, `010`, `015`–`018`, `033`

1. **Alur Impor Terkontrol (`FR-EVAL-015`–`018`):**
   - Hanya **HCO** (dan `SUPERADMIN` sah) yang dapat mengunggah/mengimpor file penilaian.
   - Sebelum data disimpan (*commit*), backend memproses file untuk menghasilkan **pratinjau (*preview*)** yang menampilkan ringkasan baris valid, baris bermasalah (*invalid*), dan baris duplikat beserta pesan kesalahan spesifik per baris (`FR-EVAL-016`, `017`).
   - Validasi memeriksa identitas responden/referensi sumber, keberadaan dan kelayakan target SR pada periode terkait, kesesuaian gedung (untuk GForm SR/Maba), kelengkapan seluruh butir pertanyaan, dan rentang nilai tiap pertanyaan.
   - **Dilarang melakukan partial import tak terkontrol:** penyimpanan impor bersifat atomik dalam satu transaksi database. File impor bersifat input transien tervalidasi dan tidak memerlukan penyimpanan arsip file permanen di R2 (`docs/prd.md` §6.4).
2. **Aturan Khusus GForm SR dan Maba (`FR-EVAL-006`, `033`):**
   - Diselenggarakan setiap **3 bulan** sekali melalui GForm eksternal berisi **20 pertanyaan** dengan skala integer **1–5** (`1 = Sangat Kurang`, `2 = Kurang`, `3 = Cukup`, `4 = Baik`, `5 = Sangat Baik`).
   - Setiap responden menilai seluruh SR di **gedungnya sendiri** kecuali dirinya sendiri.
   -Seluruh 20 pertanyaan **wajib** terjawab; respons yang tidak lengkap dikecualikan/ditolak dan tidak dimasukkan ke perhitungan.
   - Sistem menyimpan data respons individual secara lengkap: ID/identitas responden, target SR, jawaban masing-masing dari 20 pertanyaan, feedback/komentar, periode evaluasi, gedung, dan referensi sumber impor (`FR-EVAL-033`).
   - Deduplikasi menolak pengiriman/impor ganda untuk kombinasi `(periode, konteks/sumber, responden, target SR)` yang sama (`FR-EVAL-018`, `033`).
   - **Rumus Perhitungan GForm SR/Maba:**
     - Total satu respons valid:
       $$\text{Total Respons}_j = \sum_{q=1}^{20} \text{Jawaban}_{j,q} \quad (\text{rentang } 20\text{--}100)$$
     - Rata-rata dari $r$ responden valid untuk satu SR:
       $$\text{Nilai GForm} = \frac{\sum_{j=1}^{r} \text{Total Respons}_j}{r}$$
     - Nilai berbobot GForm (bobot **50%**):
       $$\text{Nilai Akhir GForm} = \text{Nilai GForm} \times 0.50 \quad (\text{maksimal } 50\text{ per hasil periode GForm})$$
3. **Aturan Khusus Evaluasi Eksternal ASUS dan Ditmawa (`FR-EVAL-010`, `015`):**
   - Berasal dari GForm eksternal berisi **10 pertanyaan** dengan skala integer **1–5** (fokus pada komunikasi, koordinasi, dan kerja sama SR dengan pihak eksternal).
   - Total satu respons valid:
     $$\text{Nilai Evaluasi Eksternal} = \sum_{q=1}^{10} \text{Jawaban}_q \quad (\text{rentang } 10\text{--}50)$$
   - Disimpan dan ditampilkan pada bagian tersendiri; **tidak dikalikan bobot dan tidak dimasukkan ke dalam `Nilai Total` kinerja berbobot** sampai ada keputusan pembobotan resmi dari PM/HCO.

### 5.5 Rumus rekapitulasi total nilai kinerja berbobot — `FR-EVAL-005`, `007`, `028`

1. Setelah seluruh komponen wajib pada periode evaluasi lengkap, sistem menghitung `Nilai Total` kinerja berbobot:
   $$\text{Nilai Total} = \text{Total Nilai Event Tahunan} + \text{Total Nilai Event Bulanan} + \text{Total Nilai Event Mingguan} + \text{Nilai Akhir Departemen} + \text{Nilai Akhir GForm}$$
2. **Presisi penuh internal (`Pedoman §13.14`):** Seluruh perhitungan rata-rata dan pembobotan internal menggunakan nilai presisi penuh (tanpa pembulatan bertingkat di tengah perhitungan); pembulatan hanya dilakukan pada lapisan presentasi/tampilan.
3. **Tanpa batas 100 (`FR-EVAL-005`, `007`, `Pedoman §10.2`):** Karena setiap event tahunan (25%), bulanan (10%), dan mingguan (10%) dijumlahkan secara akumulatif, `Nilai Total` dapat melebihi `100` (contoh pada Pedoman §10.2 menghasilkan `158,5`). Sistem dilarang memotong (*clamp*) nilai total ke 100.
4. Poin kehadiran (`FR-EVAL-008`), poin tambahan/pengurangan (`FR-EVAL-009`), dan evaluasi eksternal ASUS/Ditmawa (`FR-EVAL-010`) ditampilkan berdampingan pada profil rekapitulasi SR tetapi **tidak pernah dijumlahkan ke dalam `Nilai Total` kinerja berbobot**.

### 5.6 Akumulasi poin kehadiran & batas integrasi dengan Attendance RESORA — `FR-EVAL-008`, `014`, `034`

1. **Sumber Utama vs Fallback:**
   - Modul Attendance RESORA (`packages/api/src/modules/attendance`) adalah **sumber utama** poin kehadiran SR (`FR-EVAL-008`, `014`, `034`).
   - Input manual atau impor pada modul Penilaian hanya diizinkan sebagai **fallback** oleh HCO untuk data kehadiran historis atau kegiatan yang berlangsung di luar modul Attendance RESORA (misalnya Sidak atau kegiatan sebelum sistem presensi aktif), dengan pencatatan sumber dan audit yang jelas.
2. **Ketentuan Poin pada Pedoman §7 & `FR-EVAL-034`:**
   - Jenis kegiatan yang dihitung:
     - `Rapat All Panitia`: maksimal **10 poin** (khusus rapat seluruh panitia, bukan rapat divisi).
     - `Event besar seluruh SR`: maksimal **10 poin**.
     - `Event sebagian panitia`: maksimal **6 poin** (menggunakan faktor pengali `0,6`).
     - `Sidak`: poin maksimal **dapat diatur oleh Admin/HCO**.
   - Tabel skor kehadiran pada Pedoman §7.3 (untuk kegiatan poin maksimal 10; dikalikan `0,6` untuk kegiatan poin maksimal 6):
     - Hadir tepat waktu: `10` (atau `6`)
     - Terlambat dengan izin: `8` (atau `4,8`)
     - Terlambat tanpa izin, maksimal 15 menit: `7` (atau `4,2`)
     - Terlambat melebihi 15 menit dengan izin: `6` (atau `3,6`)
     - Terlambat melebihi 15 menit tanpa izin: `5` (atau `3,0`)
     - Izin dengan alasan 5K: `4` (atau `2,4`) — **Status: Pending / Ditahan** karena definisi 5K belum diberikan (`FR-EVAL-008`, `034`).
     - Izin di luar alasan 5K: `3` (atau `1,8`)
     - Alfa tanpa keterangan: `0`
   - Total poin kehadiran bersifat akumulatif ($\sum \text{Poin Kegiatan}$), tanpa batas maksimal total, tidak dikonversi ke persentase, dan terpisah dari nilai berbobot.
3. **Batas Arsitektur & Hasil Inspeksi Commit Origin `attendance-points` (20–21 November 2026):**
   - Inspeksi terhadap commit `origin` sekitar 6–7 hari lalu (`1881017`, `b9a0908`, `38de793`, `3c1489e`, `3537b58`, `99bfe6f`, `8cdb30e` pada `feat/attendance-points-event-filter` serta `3389451`, `88aff3c`, `b521701` pada `fix/attendance-points-uat`) menunjukkan bahwa fitur **Rekap Poin Kehadiran SR (F1–F3)** sudah di-merge ke `dev` di modul `attendance` & `events`:
     - `events.attendanceScoringMode` (`INCLUDED` | `EXCLUDED` | `null`) dikelola oleh `KADEP HCO` / `SUPERADMIN` dengan audit otomatis.
     - `attendance.pointsRecap` & `exportPointsCsv` (dapat diakses seluruh HCO aktif dan `SUPERADMIN`) menghitung akumulasi poin dari event `CLOSED` dalam rentang `sr_periods` memakai aturan maksimal `10` (jika `organizationContext = 'SR'` dan `allSr = true` tanpa `exclude`) atau `6` (`0.6`, termasuk kepanitiaan) dengan skor `EARLY`/`ON_TIME` (`10`/`6`), `LATE <= 15m` setelah *grace* (`7`/`4.2`), `LATE > 15m` (`5`/`3`), dan `ABSENT` (`0`).
   - **Celah terhadap Pedoman §7 & `FR-EVAL-008`/`034`:** Implementasi F1–F3 di `attendance` belum mencakup status *"terlambat dengan izin"* (`8`/`4.8` & `6`/`3.6`), *"izin di luar 5K"* (`3`/`1.8`), *"izin 5K"* (`4`/`2.4` — definisi 5K masih pending), maupun kegiatan **Sidak** dengan poin maksimal dinamis yang diatur Admin/HCO, serta belum memuat komponen Penilaian Kinerja Berbobot (Event Tahunan/Bulanan/Mingguan, Departemen, GForm, Eksternal, Poin Tambahan/Pengurangan, Finalisasi).
   - **Penyesuaian:** Modul `penilaian` tetap mempertahankan `attendance.pointsRecap` F1–F3 sebagai **sumber utama** poin kehadiran dari modul Attendance RESORA tanpa merusak perilaku atau tes Attendance yang sudah berjalan, dan menambahkan entri fallback manual/impor teraudit di `penilaian` (termasuk dukungan jenis kegiatan `RAPAT_ALL_PANITIA`, `EVENT_BESAR`, `EVENT_SEBAGIAN`, `SIDAK` dengan `maxPoints` terkonfigurasi serta status izin non-5K; status `5K` tetap ditahan sampai definisi 5K disahkan).

### 5.7 Transaksi penambahan dan pengurangan poin SR — `FR-EVAL-009`, `035`

1. **Alur Pengajuan & Persetujuan:**
   - **Pengaju:** `Kadiv` (`KADEP` struktural) mengajukan transaksi penambahan atau pengurangan poin untuk SR berdasarkan kontribusi tambahan, form keluhan/komentar yang terverifikasi, atau pelanggaran/permasalahan yang telah diverifikasi (`Pedoman §8.1`, `FR-EVAL-035`).
   - **Verifikator & Penyetuju:** **HCO atau Inti** memeriksa dan menyetujui (`APPROVED`) atau menolak (`REJECTED`) pengajuan tersebut.
2. **Atribut Wajib Transaksi:**
   - Target SR (`targetUserId`), periode evaluasi (`periodId`), jenis transaksi (`ADDITION` / `DEDUCTION`), jumlah poin (`points > 0`), kategori, alasan/keterangan, tanggal kejadian/pengajuan, status persetujuan (`PENDING`, `APPROVED`, `REJECTED`), identitas pengaju (`proposedByUserId`), identitas penyetuju/penolak (`decidedByUserId`), waktu keputusan, dan riwayat audit.
3. **Perhitungan Poin Bersih:**
   - Hanya transaksi yang berstatus **`APPROVED`** yang dihitung ke dalam rekap poin bersih SR:
     $$\text{Total Poin Bersih} = \text{Total Poin Tambahan}_{\text{APPROVED}} - \text{Total Poin Pengurangan}_{\text{APPROVED}}$$
   - Transaksi berstatus `PENDING` atau `REJECTED` tetap tercatat dalam riwayat transaksi sesuai hak akses (`HCO`, `Inti`, `KADEP` sesuai cakupan/pengajuan sendiri), tetapi tidak mengubah `Total Poin Bersih` yang dilihat SR.

### 5.8 Status kelengkapan, koreksi beralasan, finalisasi, dan pembukaan revisi — `FR-EVAL-011`, `019`, `020`, `029`, `037`

1. **Pemeriksaan Kelengkapan Sebelum Finalisasi (`FR-EVAL-011`, `020`, `029`):**
   - Sistem memvalidasi kelengkapan seluruh komponen wajib untuk setiap SR dalam roster periode evaluasi:
     - Seluruh event wajib pada periode tersebut telah memiliki penilaian lengkap dari seluruh evaluator eligible dalam roster event terkait.
     - Penilaian departemen triwulanan dari Kadiv/KADEP telah masuk.
     - Hasil GForm SR/Maba triwulanan untuk SR tersebut telah tersedia dan valid.
   - Nilai komponen yang belum masuk **dilarang dianggap `0`** dan harus ditandai eksplisit sebagai `BELUM_LENGKAP`.
   - Selama masih terdapat satu saja komponen wajib yang belum lengkap, tombol/operasi **Finalisasi** oleh HCO **diblokir** oleh backend (`FR-EVAL-020`, `037`).
2. **Finalisasi Periode (`FR-EVAL-037`):**
   - Hanya **HCO** (dan `SUPERADMIN` sah) yang dapat memfinalisasi hasil penilaian KPI suatu periode evaluasi setelah statusnya `SIAP_DIFINALISASI`.
   - Saat difinalisasi, sistem membekukan versi hasil (`version = 1`, `status = 'FINAL'`, `finalizedAt`, `finalizedByUserId`) dan mencatat audit finalisasi.
   - Sebelum `FINAL`, setiap permintaan baca rekap/detail/analitik oleh role selain **HCO dan Inti** (serta penilai atas kirimannya sendiri) wajib ditolak atau hanya mengembalikan status belum final tanpa membocorkan angka pra-final (`FR-EVAL-002`, `011`, `012`, `022`, `026`, `029`, `030`, `037`).
3. **Koreksi Nilai & Pembukaan Revisi Berversi (`FR-EVAL-019`, `037`):**
   - Setiap koreksi nilai oleh HCO berwenang wajib menyertakan `reason` (alasan non-kosong) dan menyimpan `beforeState`, `afterState`, `actorUserId`, serta `createdAt` secara atomik dalam tabel audit append-only.
   - Ketika periode sudah berstatus **`FINAL`**, segala mutasi/koreksi nilai langsung **ditolak**.
   - Untuk melakukan koreksi pasca-final, HCO wajib menjalankan operasi **Buka Revisi (`openRevision`)** dengan mencantumkan alasan pembukaan revisi.
   - Pembukaan revisi mengubah status periode ke mode revisi (`REVISING` / pra-final versi berikutnya) dengan tetap mempertahankan snapshot/riwayat versi final sebelumnya, mengizinkan koreksi teraudit, dan saat difinalisasi kembali akan menerbitkan **versi hasil baru (`version + 1`)** beserta jejak audit lengkap.

### 5.9 Analitik, rekap pribadi, ekspor, dan kontrak sumber Dashboard RESORA — `FR-EVAL-002`, `012`, `021`–`030`, `FR-DASH-003`

1. **Dashboard Analitik Modul Penilaian (`FR-EVAL-022`–`025`):**
   - Menampilkan jumlah SR, status/persentase kelengkapan penilaian, ringkasan perkembangan, grafik distribusi nilai, serta perbandingan hasil penilaian berdasarkan filter **periode evaluasi, departemen, dan gedung**.
   - Seluruh filter divalidasi di server sesuai scope akses pemanggil (`FR-EVAL-024`); manipulasi parameter query oleh klien tidak boleh memperluas cakupan data.
   - Grafik dan agregasi tidak boleh memuat identitas penilai atau isi komentar (`FR-EVAL-025`).
2. **Halaman Rekapitulasi Pribadi SR (`FR-EVAL-027`, `028`, `Pedoman §14`):**
   - Hanya dapat diakses oleh SR aktif untuk melihat datanya sendiri **setelah periode berstatus `FINAL`**.
   - Menampilkan secara terpisah:
     - `Poin Kehadiran` (total akumulasi poin dan rincian kehadiran)
     - `Event Tahunan` (total nilai berbobot seluruh event tahunan & nilai tiap event/indikator)
     - `Event Bulanan` (total nilai berbobot seluruh event bulanan & nilai tiap event/indikator)
     - `Event Mingguan` (total nilai berbobot seluruh event mingguan & nilai tiap event/indikator)
     - `Departemen` (nilai berbobot 25% & rincian 4 indikator)
     - `GForm SR dan Maba` (nilai berbobot 50% dari rata-rata responden valid, **tanpa** menampilkan respons individual, identitas responden, atau komentar)
     - `Total Nilai` (jumlah seluruh nilai berbobot)
     - `Poin Tambahan/Pengurangan` (total poin bersih dan riwayat transaksi yang disetujui)
     - `Evaluasi Eksternal` (rekapitulasi ASUS/Ditmawa jika tersedia dan diizinkan)
     - `Status Kinerja Pribadi` (hanya ditampilkan jika ambang penilaian resmi `FR-EVAL-028` telah ditetapkan oleh HCO).
3. **Ekspor Rekap Penilaian (`FR-EVAL-021`, `RSA-15`):**
   - Setiap role yang memiliki hak baca dapat mengekspor rekap penilaian **hanya untuk cakupan baris (SR) dan kolom (field) yang identik dengan hak baca tampilan role tersebut**.
   - Server melakukan pemfilteran baris dan proyeksi kolom sebelum membentuk file ekspor (CSV/XLSX); identitas penilai, ID responden mentah, dan komentar anonim dilarang masuk ke file ekspor untuk role selain yang berwenang.
4. **Kontrak Sumber untuk P1-04 Dashboard Utama RESORA (`FR-DASH-003`, `DASH-01`, `DASH-05`):**
   - Sesuai arsitektur P1-04 ([PRD Sistem §2](../../prd.md#2-governance-and-sources-of-truth) & [DASH-01](../dashboard/DASH-01-discovery.md)), Dashboard Utama RESORA adalah satu modul **frontend** yang mengonsumsi ringkasan berizin dari API modul sumber dan **tidak menghitung ulang skor atau persentase kelengkapan di frontend**.
   - Modul Penilaian menyediakan endpoint ringkasan sumber yang mengembalikan:
     - **Mode Personal (SR aktif):** `finalScore` (nilai akhir pribadi jika periode aktif sudah `FINAL`; status `not_assessed` / `unavailable` jika belum final) dan `completionPercentage` untuk periode evaluasi aktif.
     - **Mode Manajemen (HCO, Inti, KADEP, SUPERADMIN sesuai aturan pra-final/final):** `averageScore` (rata-rata nilai SR), `completionPercentage` (persentase kelengkapan), `assessedCount` (jumlah SR sudah lengkap dinilai), `unassessedCount` (jumlah SR belum lengkap dinilai), serta label `periodName` periode evaluasi aktif.

---

## 6. Prinsip data, batas modul, dan privasi

1. **Kepemilikan Tabel Domain (`module-data-ownership.md` & `architecture.ts`):**
   - Modul `penilaian` hanya memiliki dan mengakses langsung tabel-tabel berawalan `evaluation_*` pada skema Drizzle `packages/db/src/schema/penilaian.ts` (atau nama skema yang disepakati pada F1).
   - `penilaian` **dilarang** mengimpor atau menjalankan query SQL langsung ke tabel privat milik `identity` (`user`, `user_profiles`, `sr_profiles`, `departments`, `positions`, `buildings`, `sr_periods`, `sr_period_memberships`), `events` (`events`, `event_participants`), `attendance` (`attendance_sessions`, `attendance_records`), maupun `committee` (`committees`, `committee_divisions`, `committee_members`).
   - Seluruh pembacaan identitas live, direktori/roster periode SR, daftar gedung/departemen, daftar event/snapshot peserta event, dan rekap poin kehadiran wajib melalui operasi server-only pada `*.public.ts` masing-masing modul pemilik dalam transaksi yang sama.
2. **Isolasi Histori & Snapshot:**
   - Setiap penilaian dan hasil akhir periode menyimpan referensi `evaluationPeriodId`, `srPeriodId` (tenure), serta snapshot atribut organisasi SR (departemen, jabatan, gedung) saat periode evaluasi berlangsung/difinalisasi, sehingga mutasi jabatan atau perpindahan gedung di masa depan tidak merusak atribusi penilaian historis (`FR-EVAL-001`, `013`).
3. **Privasi Identitas Penilai & Komentar (`FR-EVAL-002`, `012`, `021`, `025`–`027`, `030`, `033`, `036`):**
   - Identitas pemberi penilaian (user ID evaluator event/departemen maupun ID responden GForm) wajib disimpan di database untuk penegakan deduplikasi, validasi *no-self-evaluation*, dan jejak audit.
   - Namun proyeksi DTO pada layer presenter/service untuk seluruh prosedur non-HCO wajib membuang (*strip*) field identitas penilai individual dan isi komentar sebelum data dikirim ke klien.
4. **Impor & Ekspor Tanpa Arsip Permanen R2 (`docs/prd.md` §6.4, `docs/architecture.md` §10.3):**
   - Pemrosesan impor GForm (`FR-EVAL-015`–`018`) melakukan parsing terstruktur dengan batas ukuran input dan jumlah baris yang ketat, menghasilkan pratinjau validasi, dan menyimpan baris respons terstruktur ke PostgreSQL secara atomik saat dikonfirmasi. Tidak dibuat objek media permanen di R2 untuk setiap file impor/ekspor.

---

## 7. Keputusan yang harus dikunci (Decision Gates D01–D10)

Sesuai arahan PM 25–27 November 2026:
- **Keputusan teknis non-bisnis** (struktur tabel `evaluation_*`, kontrak prosedur tRPC, aritmetika presisi penuh, penguncian transaksi/optimistic concurrency, format pratinjau impor, dan RLS/trigger audit append-only) didelegasikan kepada **Nafi/Codex** sesuai Architecture.
- **Keputusan proses bisnis yang belum jelas atau berkonflik dengan aturan modul existing** tetap berstatus **TBD / Butuh Konfirmasi PM/HCO** dan diisolasi agar tidak dikarang oleh tim implementasi.

| ID | Keputusan / Konflik yang diidentifikasi | Status | Usulan teknis / Opsi keputusan PM & Dampak isolasi |
| --- | --- | --- | --- |
| **D01** | **Model data `evaluation_*`, versi revisi, dan pembagian wewenang internal HCO** (`FR-EVAL-001`, `019`, `037`) | **Terkunci (27/11/2026)** | **Teknis (Nafi/Codex):** Tabel domain berawalan `evaluation_*` dengan RLS dan trigger audit append-only; `version` integer pada periode evaluasi (`1` saat finalisasi pertama, bertambah saat `openRevision` + re-finalisasi).<br>**Keputusan Akses:** Seluruh anggota struktural HCO aktif dapat membaca rekap dan mengelola input/impor rutin, sedangkan operasi sensitif **finalisasi, pembukaan revisi, koreksi nilai beralasan, dan konfigurasi periode/ambang** dibatasi khusus untuk **`KADEP HCO` + `SUPERADMIN`**. |
| **D02** | **Pemetaan kategori event penilaian (`Tahunan`/`Bulanan`/`Mingguan`) serta jabatan evaluator (`PIC, Kadiv, Wakadiv, Anggota`) terhadap modul `Events` & `Committee` existing** (`FR-EVAL-003`, `005`, `031`) | **Terkunci (Default disetujui 27/11/2026)** | HCO mendaftarkan/mengaitkan event `PUBLISHED`/`CLOSED` dari modul Events ke periode evaluasi dengan kategori (`ANNUAL` 25%, `MONTHLY` 10%, `WEEKLY` 10%). Semua peserta aktif dalam snapshot `event_participants` pada event tersebut berlaku sebagai evaluator sekaligus target secara *all-to-all* non-self (menilai seluruh SR lain pada roster event sesuai `FR-EVAL-031`; *self-evaluation* dan duplikat ditolak). |
| **D03** | **Penilai pada komponen Penilaian Departemen (25%) untuk anggota, `KADEP`, `HCO`, dan `INTI`** (`FR-EVAL-006`, `032`) | **Terkunci (27/11/2026)** | Menggabungkan arahan user dan panduan `FR-EVAL-032` (*Kadiv menilai; Sekdep tidak menjadi penilai*):<br>1. **Anggota & Sekdep departemen non-HCO/non-INTI:** dinilai oleh **KADEP departemennya** (sesuai `FR-EVAL-032`) dan dapat dikelola/dinilai oleh **KADEP HCO** bila penilai departemen belum tersedia.<br>2. **Anggota & Sekdep departemen HCO:** dinilai oleh **KADEP HCO**.<br>3. **Seluruh `KADEP` (termasuk `KADEP HCO`):** dinilai oleh **`INTI`** (`KETUM`/`WAKETUM`/`SEKRETARIS`/`BENDAHARA`).<br>4. **Anggota `INTI`:** dinilai oleh **`INTI`** non-self (`KETUM` atau sesama `INTI` selain diri sendiri).<br>5. `SEKDEP` dan `ANGGOTA` tidak pernah menjadi penilai departemen. |
| **D04** | **Format kolom template impor GForm (20 soal SR/Maba & 10 soal Eksternal) serta agregasi lintas beberapa GForm triwulanan** (`FR-EVAL-006`, `010`, `015`–`018`, `033`) | **TBD (Agregasi multi-siklus) + Teknis (Format Impor)** | **Catatan Sheet `FR-EVAL-006`/`033`:** *"Agregasi lintas beberapa periode GForm masih perlu keputusan"*. Untuk satu siklus GForm triwulanan, rumus `Rata-rata responden valid × 50%` sudah final; bila >1 siklus GForm digabungkan dalam satu periode, default teknis sementara menggunakan penjumlahan per siklus (mengikuti pola Departemen pada Pedoman §4.3) sampai ada koreksi PM. Format file impor mendukung **CSV/XLSX** dengan kolom standar: `respondent_id`, `target_nim`, `building_code`, `q1`..`q20` (atau `q1`..`q10` untuk eksternal), dan `comment` opsional. |
| **D05** | **Rekonsiliasi aturan Poin Kehadiran Pedoman §7 (`FR-EVAL-008`, `034`) dengan `attendance.pointsRecap` F1–F3 yang sudah berjalan** | **Terkunci (27/11/2026)** | Modul Penilaian mengonsumsi poin kehadiran dari kontrak publik `attendance` sebagai sumber utama untuk event RESORA (tanpa mengubah atau merusak aturan `attendance.pointsRecap` F1–F3), ditambah pencatatan fallback manual/impor teraudit oleh HCO untuk kegiatan di luar modul (Rapat All Panitia historis, Sidak dengan `maxPoints` terkonfigurasi, dan penyesuaian status izin non-5K sesuai Pedoman §7.3). Pemetaan izin `5K` tetap nonaktif sampai definisi 5K disahkan. |
| **D06** | **Pemetaan role `Pimpinan SR` (`FR-EVAL-026`) dan penyampaian agregat final `Ditmawa` tanpa login eksternal** (`FR-EVAL-002`, `022`, `025`, `026`, `030`) | **TBD — Verifikasi PM** | 1. `FR-EVAL-026` mencatat: *"Pemetaan role Pimpinan SR ke MOD-07 harus diverifikasi"*. Pada kamus organisasi RESORA (`packages/db/src/organization.ts`), kepemimpinan SR direpresentasikan oleh departemen `INTI` (`KETUM`, `WAKETUM`, `SEKRETARIS`, `BENDAHARA`) dan posisi `KADEP` di 7 departemen lain. Sampai PM menetapkan definisi berbeda, cakupan Pimpinan SR dipetakan ke `INTI` (pra-final & final) dan `KADEP` (setelah final).<br>2. Karena login `DITMAWA` masih *Deferred* di PRD Sistem §3, akses agregat final bagi Ditmawa dipenuhi melalui fitur ekspor/laporan agregat final oleh HCO/Inti tanpa membuka akun login `DITMAWA` baru. |
| **D07** | **Visibilitas komentar anonim bagi `SUPERADMIN` dan visibilitas ID responden mentah di luar HCO** (`FR-EVAL-030`, `033`, `036`) | **Pending di Sheet (`FR-EVAL-036`)** | Sheet mencatat pada `FR-EVAL-030` & `036`: *"identitas asli disimpan dan hanya dapat dilihat HCO; isi komentar hanya dapat dilihat HCO... Pending khusus: pengecualian SUPERADMIN belum diputuskan"*.<br>**Isolasi:** Simpan identitas responden/penilai dan komentar dari impor GForm di database, tetapi batasi pembacaannya **hanya untuk HCO** (dan tahan eksposur komentar ke `SUPERADMIN` maupun pembuatan fitur komentar anonim mandiri `FR-EVAL-036` sampai PM memutuskan). |
| **D08** | **Nilai ambang batas (*threshold*) status kinerja pribadi (`FR-EVAL-028` / `RSA-27`)** | **TBD oleh HCO/PM** | Sheet mencatat: *"Ambang 'memenuhi standar/perlu peningkatan' belum diputuskan. Jangan membuat label otomatis atau angka threshold sampai HCO/PM menetapkannya."*<br>**Isolasi:** Sediakan kolom/pengaturan ambang opsional (`nullable`) pada konfigurasi periode evaluasi yang dapat diatur HCO. Selama nilai ambang `NULL`, UI dan API menampilkan status ambang sebagai *"Ambang penilaian belum ditetapkan"* dan tidak melabeli kinerja SR. |
| **D09** | **Denominator persentase kelengkapan (`completionPercentage`) dan pemilihan periode evaluasi aktif untuk kartu Dashboard Utama RESORA (`FR-DASH-003`)** | **Butuh Konfirmasi Teknis/PM** | [DASH-01](../dashboard/DASH-01-discovery.md) mencatat bahwa Pedoman tidak mendefinisikan denominator persentase kelengkapan pada kartu Dashboard.<br>**Usulan:**<br>- Untuk satu SR (Mode Personal): persentase komponen wajib yang telah lengkap untuk SR tersebut pada periode evaluasi aktif.<br>- Untuk organisasi (Mode Manajemen): `assessedCount / totalPeriodSrRoster * 100` (proporsi SR dalam roster periode evaluasi aktif yang seluruh komponen wajibnya telah lengkap), dengan `assessedCount` = jumlah SR lengkap dan `unassessedCount` = jumlah SR belum lengkap. |
| **D10** | **Lingkungan UAT, data sintetis, dan otorisasi migrasi database remote** | **Gate Operasional** | Seluruh pengujian unit dan integrasi menggunakan data SR/penilaian sintetis. Penerapan migrasi Drizzle ke database Development/Staging atau deployment Production tetap memerlukan otorisasi eksplisit per tindakan/lingkungan sesuai `AGENTS.md` §3. |

---

## 8. Acceptance criteria dan bukti minimum

| ID | Skenario yang harus dibuktikan | FR / Issue terkait |
| --- | --- | --- |
| **AC01** | HCO dapat membuat, membuka, dan menutup periode evaluasi yang terikat ke `sr_periods` (tenure SR) serta mengatur jadwal tiap jenis penilaian; nilai dan poin tidak tercampur lintas periode/tenure. | `FR-EVAL-001`, `013` / RSA-5 |
| **AC02** | Evaluator event eligible dapat mengirim nilai 4 indikator (`0–100`) untuk target SR dalam roster event; percobaan menilai diri sendiri (*self-evaluation*), target di luar roster, nilai di luar `0–100`, atau pengiriman ganda ditolak server. | `FR-EVAL-003`, `014`, `016`, `018`, `031` / RSA-5 |
| **AC03** | Kadiv (`KADEP`) dapat mengirim penilaian departemen triwulanan (4 indikator `0–100`) untuk anggota departemennya; percobaan pengiriman oleh `SEKDEP`, `ANGGOTA`, atau KADEP departemen lain ditolak server (`FORBIDDEN`). | `FR-EVAL-006`, `014`, `016`, `032` / RSA-5 |
| **AC04** | Perhitungan nilai event merata-ratakan 4 indikator per penilai, merata-ratakan seluruh penilai valid per event, lalu mengalikan bobot pada **setiap event secara individual** (Tahunan 25%, Bulanan 10%, Mingguan 10%) dan menjumlahkannya bersama Departemen (25%) dan GForm (50%) dengan presisi penuh tanpa batas maksimum 100 (contoh uji Pedoman §10.2 menghasilkan `158,5`). | `FR-EVAL-004`–`007`, Pedoman §2–§10 / RSA-5 |
| **AC05** | Impor GForm SR/Maba (20 soal skala 1–5, target segedung, non-self) dan Evaluasi Eksternal ASUS/Ditmawa (10 soal skala 1–5, skor 10–50 terpisah) menampilkan pratinjau baris valid/invalid/duplikat sebelum konfirmasi; menolak respons tidak lengkap (<20 atau <10 jawaban), menolak duplikat, dan tidak menyimpan partial import tak terkontrol. | `FR-EVAL-006`, `010`, `015`–`018`, `033` / RSA-11 |
| **AC06** | Poin kehadiran mengambil sumber utama dari Attendance RESORA dan mendukung fallback manual/impor teraudit untuk kegiatan historis/di luar modul; poin bersifat akumulatif tanpa batas total, tidak dikonversi ke persentase, tidak masuk ke nilai kinerja berbobot, dan tidak mengaktifkan pemetaan 5K yang masih pending. | `FR-EVAL-008`, `014`, `034` / RSA-5 |
| **AC07** | Kadiv (`KADEP`) dapat mengajukan penambahan/pengurangan poin dengan kategori dan alasan; transaksi baru memengaruhi `Total Poin Bersih = Tambahan − Pengurangan` hanya setelah disetujui oleh **HCO atau Inti**; seluruh transaksi menyimpan jejak pengaju, penyetuju, status, dan audit. | `FR-EVAL-009`, `035` / RSA-5 |
| **AC08** | Penilaian wajib yang belum masuk menandai komponen dan periode sebagai `BELUM_LENGKAP` (tidak pernah dianggap `0`); percobaan finalisasi periode oleh HCO saat masih ada komponen wajib yang belum lengkap ditolak server. | `FR-EVAL-004`, `011`, `020`, `029`, `037` / RSA-5 |
| **AC09** | Sebelum periode berstatus `FINAL`, hanya **HCO dan Inti** (serta penilai atas kirimannya sendiri) yang dapat membaca angka penilaian; permintaan rekap, detail, dashboard analitik, atau ekspor hasil oleh SR biasa, KADEP, atau role lain sebelum `FINAL` ditolak atau tidak mengekspos angka pra-final. | `FR-EVAL-002`, `011`, `012`, `020`, `022`, `026`–`030`, `037` / RSA-5, RSA-28 |
| **AC10** | Koreksi nilai oleh HCO wajib menyertakan alasan dan mencatat `beforeState`/`afterState` secara atomik; perubahan setelah `FINAL` ditolak kecuali HCO membuka revisi (`openRevision`) dengan alasan yang menghasilkan versi hasil baru (`version + 1`) dan jejak audit lengkap. | `FR-EVAL-019`, `037` / RSA-5 |
| **AC11** | Identitas pemberi penilaian, ID responden mentah, dan komentar tidak pernah bocor pada DTO rekap, detail SR target, grafik analitik, maupun file ekspor untuk role di luar HCO; ambang status kinerja (`FR-EVAL-028`) tidak menampilkan label otomatis bila threshold belum ditetapkan; fitur komentar anonim mandiri (`FR-EVAL-036`) tetap nonaktif selama berstatus Pending. | `FR-EVAL-002`, `012`, `021`, `025`–`028`, `030`, `033`, `036` / RSA-15, RSA-27, RSA-28 |
| **AC12** | Endpoint analitik modul (`FR-EVAL-022`–`025`) dan kontrak ringkasan Dashboard RESORA (`FR-DASH-003`) memvalidasi filter periode/departemen/gedung di server sesuai scope akses pemanggil tanpa menghitung ulang skor di frontend. | `FR-EVAL-022`–`025`, `FR-DASH-003` / RSA-13 |

---

## 9. Target penerimaan & tata kelola rilis

1. Seluruh pengerjaan modul Penilaian dilakukan secara bertahap pada satu branch **`feat/modul-penilaian-sr`** sesuai urutan fase pada [roadmap.md](roadmap.md).
2. Bukti engineering setiap fase mencakup pemeriksaan batas arsitektur (`pnpm check:architecture`), pemeriksaan tipe TypeScript (`check-types`), lint Biome pada file yang disentuh, serta unit/integration test terfokus dengan fixture sintetis.
3. Untuk fase frontend yang berdampak visual, verifikasi browser lokal dengan data sintetis wajib dijalankan mengikuti otorisasi tetap PM (2026-11-26) dan kontrak verifikasi [Design System RESORA](../../design-system.md).
4. Dokumen PRD ini tidak mengotorisasi penerapan migrasi ke database remote (Development/Staging/Production) atau deployment tanpa persetujuan eksplisit untuk tindakan dan lingkungan terkait.
