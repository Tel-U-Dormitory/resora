# Katalog komponen dan UX copy

Lampiran normatif [Design System 1.1](../design-system.md). Kontrak target lintas library; implementasi existing belum dinyatakan memenuhi semuanya.

## Kontrak umum

Setiap komponen memiliki token tema, ukuran responsive, accessible name/role/value, urutan fokus dan perilaku reduced motion. Dokumentasikan state yang berlaku: default, hover untuk pointer sesuai, pressed, focus-visible, selected, loading, disabled, error, empty dan success. State yang tidak relevan diberi N/A dengan penjelasan; jangan menambahkan variasi tanpa kebutuhan. Native semantic HTML diprioritaskan, ARIA hanya melengkapi. Semua variasi diuji light/dark, label panjang, zoom dan keyboard. Disabled harus dapat dipahami alasannya; tooltip tidak menjadi satu-satunya tempat penjelasan.

| Komponen / variasi | State dan keyboard | Pemakaian yang tepat / larangan |
| --- | --- | --- |
| Button: primary, secondary, ghost, destructive, icon | Enter/Space; busy + disabled saat submit tanpa kehilangan label/fokus | Satu aksi primer dominan per konteks; link untuk navigasi; jangan seluruh aksi merah |
| Input/textarea | Label, hint, required, invalid, disabled, readonly; Tab dan editing native | Error terhubung `aria-describedby`; placeholder bukan label; password tidak masuk draf |
| Select/combobox | Open/selected/empty/loading/error; keyboard sesuai APG komponen, Escape menutup | Native/select accessible atau primitive terbukti; jangan div clickable tanpa semantik |
| Checkbox/radio/switch | Checked/unchecked/mixed bila relevan; Space, radio arrow keys | Switch untuk setelan yang benar-benar langsung tersimpan; radio untuk pilihan tunggal; bukan toggle palsu |
| Search/filter/chips | Query/filter aktif, loading, no-result; Enter bila submit eksplisit, clear berlabel | Tampilkan filter aktif dan reset; chip filter berbeda dari navigasi/tab |
| Card/list row | Static atau link utama; selected hanya bila selectable | Identitas/status/aksi jelas; jangan button/link bersarang atau seluruh kartu dengan banyak target ambigu |
| Status badge | Label+ikon; noninteractive kecuali kebutuhan nyata | Sukses/error tidak memakai brand saja; badge bukan button mini |
| Floating bottom nav | Current destination, badge resmi; link keyboard biasa | Empat tujuan approved; scan terpisah; jangan hilang fokus di bawah safe area |
| Sidebar/top bar | Expanded/collapsed, current; keyboard dan skip link | Tooltip saat collapsed, judul/back pada layar dalam; jangan hanya ikon tanpa nama |
| Apps launcher | Open/closed/loading/empty/error; Tab link, Escape tutup | Grid modul berizin; belum ada fitur tidak dibuat aktif |
| Tabs | Selected, focused; arrow keys, Home/End sesuai pola tab | Panel lokal; route navigation tetap link, jangan memakai role tab pada semua chip |
| Sheet/dialog | Open/closed/pending/error; focus masuk, trap di overlay, Escape/batal, fokus kembali | Mobile sheet / desktop modal; title/deskripsi dan close terlihat; drag bukan satu-satunya cara menutup |
| Confirmation | Scope, dampak, destructive pending/error | “Hapus draf” / “Lanjut mengisi”; bukan “Yakin?” tanpa objek atau dampak |
| Toast/snackbar | Status dan dismiss/action accessible; tidak mencuri fokus | Info nonkritis/undo; jangan menjadi satu-satunya hasil absensi |
| Banner | Active/resolved/retry | Status berlangsung, teks+aksi; jangan menutupi halaman |
| Skeleton/loading/empty/error | Busy dengan nama; retry keyboard; reduced motion | Skeleton mengikuti struktur, nol dibedakan kosong; jangan spinner tanpa konteks terus-menerus |
| Table | Sort aria-sort, selection scope, loading/empty/error; header/data semantics | Data perbandingan desktop; min 44px target sentuh; jangan total global dari satu page |
| Chart/metric | Loading/no-data/stale/error; tooltip touch/keyboard | Unit, periode, cakupan dan alternatif teks/tabel; jangan informasi hanya warna/hover |
| Avatar/profile | Loading/fallback/available | Nama alternatif, jangan status online fiktif |
| Pagination/Muat lagi | Busy/end/error; fokus tetap stabil setelah append | Umum mobile Muat lagi; pengumuman jumlah hasil ditambah; tidak otomatis lompat ke atas |
| Date/time input | Invalid/range/helper; keyboard input tetap tersedia | Format organisasi, WIB eksplisit; jangan parsing tanggal tergantung timezone perangkat |
| QR scanner/diagnosis | Semua state pada spesifikasi scanner | Kontrol kamera berlabel, cleanup track, salin aman; jangan menyamakan hasil lokal dengan sukses server |

Overlay modal memiliki judul, background inert, focus trap, initial focus yang sesuai (heading untuk konten panjang), Escape/close yang aman dan focus return. Sheet drag memiliki tombol alternatif. Modal tidak boleh menutup dan membuang input tanpa penjelasan. Hindari overlay bertumpuk; validasi muncul dalam overlay yang sedang aktif. Gunakan [WAI APG dialog](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/) sebagai referensi perilaku, bukan sekadar menambahkan `role=dialog`.

Setiap entry implementasi katalog nantinya memuat: path/export komponen, pemilik, variasi/props, matriks state, keyboard, contoh benar/salah, bukti browser dan batas penggunaan. Lokasi existing `packages/ui` dan `apps/web/src/components` diperiksa sebelum membuat pengganti; jangan menyatakan seluruh kontrak di atas sudah tersedia di sana.

## Bahasa dan kamus

Bahasa Indonesia, sapaan **kamu**, santai dan dekat dengan remaja Indonesia. Tetap jelas dan menghormati pengguna: tanpa slang berlebihan, menyalahkan, lelucon saat gagal, atau jargon teknis pada pesan utama. Kode teknis ditempatkan dalam diagnosis. Gunakan sentence case; CTA menyebut kata kerja dan objek. Teks copy berikut adalah baseline, disesuaikan konteks bisnis yang benar.

| Istilah baku | Penggunaan / batas |
| --- | --- |
| Beranda | Tujuan dashboard sesuai hak akses |
| Inbox | Pengumuman penting; jangan berganti “Pesan” bila bukan percakapan |
| Profil | Informasi personal, statistik dan riwayat pribadi |
| Apps | Launcher tugas/modul berizin |
| Scan QR | Label tombol pemindai |
| Absen / absensi / kehadiran | “Absen” untuk aksi, “absensi” untuk proses/riwayat, “kehadiran” untuk status/data |
| Jadwal / kegiatan | Jadwal untuk waktu, kegiatan untuk objek operasional; identifier `event` boleh tetap dalam kode |
| Pengumuman | Konten broadcast, bukan chat |
| Anggota / pengurus | Penyebutan UX; tidak menggantikan kode aktor/jabatan/departemen resmi |
| Kepanitiaan / periode / kelola akun | Label modul konsisten; tidak mengganti istilah organisasi resmi |
| Draf | Input lokal belum dikirim; jangan disebut “tersimpan” tanpa lokasi/kejelasan |
| Diagnosis | Detail teknis pemulihan absensi; gunakan ejaan ini konsisten |
| Muat lagi / Coba lagi / Urungkan | Tambah hasil / ulangi proses gagal / pulihkan aksi yang memang reversible |

| Konteks | Copy baseline |
| --- | --- |
| Loading | “Memuat jadwal…” |
| Empty jadwal | “Belum ada jadwal untuk periode ini.” |
| Search empty | “Tidak ada hasil yang cocok. Coba kata kunci lain.” |
| Error field wajib | “Isi nama kegiatan dulu.” |
| Submit | “Simpan perubahan” atau “Kirim catatan”, sesuai efek sebenarnya |
| Draf dipulihkan | “Draf di perangkat ini dipulihkan. Belum dikirim.” |
| Jaringan | “Koneksi terputus. Isian kamu tetap ada. Coba lagi setelah terhubung.” hanya jika isian benar-benar dipertahankan |
| Absensi sukses | “Absen berhasil dicatat.” hanya setelah konfirmasi server |
| Di luar radius | “Lokasi kamu terdeteksi di luar area kegiatan. Kalau sudah di lokasi, perbarui lokasi lalu coba lagi.” sesuai aksi yang tersedia |
| Diagnosis | “Lihat diagnosis” / “Salin diagnosis” / “Diagnosis disalin” |
| Tidak berizin | “Kamu belum punya akses ke fitur ini.” dengan langkah lanjut hanya jika kanal bantuan memang tersedia |
| Hapus draf | “Hapus draf ini? Isian yang belum dikirim akan dihapus dari perangkat ini.” / “Hapus draf” / “Lanjut mengisi” |

Tanggal/waktu mengikuti organisasi: `19 Nov 2026, 19.06 WIB`, tanggal numerik pada diagnosis `19/11/2026 19:06 WIB`; angka locale `id-ID`. Zona presentasi baseline `Asia/Jakarta` berdasarkan implementasi WIB existing; timestamp server tetap UTC. Date-only tidak digeser sebagai timestamp. Jangan mengubah deadline mengikuti zona perangkat. Tampilkan unit m/ms/persen dan periode data. Format ringkas boleh, detail penuh tetap dapat diakses.
