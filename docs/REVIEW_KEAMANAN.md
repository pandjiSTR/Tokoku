# Review Keamanan Tokoku (M5)

Cakupan: kode aplikasi, database, penyimpanan, dependensi, dan skrip deployment.
Metode: tes otomatis terhadap PostgreSQL asli (PGlite) yang menjalankan seluruh migrasi, audit kode dengan pencarian pola,
audit dependensi (`npm audit`), dan pengujian mutasi (sengaja mematikan pengaman untuk memastikan tes benar-benar mendeteksi kebocoran).
Total: **136 tes** (isolasi tenant, katalog, pesanan, pengiriman, banner, kedaluwarsa, gambar, seed, tema, pembatasan laju).

Ringkasnya: tidak ada temuan kritis yang tersisa. Ada tiga temuan dependensi yang tidak dapat dieksploitasi dari kode ini dan satu
daftar batasan yang perlu Anda ketahui. Dua kontrol infrastruktur (HTTPS dan backup) sudah ditulis tetapi belum terbukti di VM sungguhan.

## 1. Kontrol per risiko (dari rencana proyek)

| Risiko | Kontrol | Bukti |
|---|---|---|
| Kebocoran data antar toko | Semua tabel milik toko memakai `store_id`; RLS aktif di seluruh 24 tabel; aplikasi memakai role terbatas (`app_user`, `app_anon`, `app_buyer`) | `tests/isolation`, `catalog`, `orders`, `m4`: pemilik toko A tidak dapat membaca, mengubah, menghapus, atau menulis data toko B; staf tidak dapat mengubah profil |
| Akses lewat Supabase Data API | RLS aktif tanpa kebijakan untuk role `anon` dan `authenticated` bawaan Supabase, jadi anon key publik tidak membuka tabel | Migrasi `0002`, `0005`, `0008`, `0010`; verifikasi manual: Table Editor menampilkan RLS enabled |
| Koneksi pemilik tabel (melewati RLS) | Hanya 4 berkas, semuanya tugas sistem: pembuatan profil pengguna (2), pencatatan notifikasi, kedaluwarsa terjadwal | Audit kode: pencarian impor `db` dari `@/db` |
| Manipulasi harga, ongkir, total | Dihitung ulang di server dari database; pembeli tidak punya hak mengubah kolom nominal | `tests/orders`: total dari database, snapshot harga, pembeli ditolak mengubah `total` |
| Stok oversell | Pengurangan stok atomik lewat fungsi `app_reserve_stock`; pembeli tidak dapat `UPDATE products` | `tests/orders`: unit terakhir hanya terjual sekali; transaksi dibatalkan membuat stok utuh |
| Status pesanan dipalsukan | Trigger menjaga transisi status per role; pembeli hanya boleh menunggu verifikasi | `tests/orders`; **mutasi**: tanpa trigger, pembeli dapat menandai dirinya sudah membayar, dan tes mendeteksinya |
| Kebocoran data pembeli | Token pesanan acak 256 bit, hanya hash yang disimpan; RLS membandingkan hash; halaman pesanan tanpa Referer dan tanpa indeks mesin pencari | `tests/orders`: token salah atau kosong tidak melihat apa pun; **mutasi**: tanpa RLS pembeli melihat pesanan orang lain |
| Bukti pembayaran | Bucket privat, tautan bertanda tangan 60 detik hanya setelah keanggotaan toko terbukti | Kode `signedProofUrl`; uji manual di panduan pengujian |
| Koordinat toko | Tabel khusus tanpa akses publik; koordinat hanya dibaca fungsi server; browser menerima harga dan jarak saja | `tests/m4`: pengunjung dan pembeli ditolak membaca tabel; fungsi lokasi tidak dapat dipanggil pengunjung |
| Manipulasi koordinat pembeli | Koordinat divalidasi di server (kotak wilayah Indonesia), radius dan tarif dihitung server | `tests/units`, `tests/m4` |
| Upload berbahaya | Isi file diperiksa (bukan ekstensi), hanya JPG/PNG/WebP, maks 5 MB, disandikan ulang ke WebP (membuang EXIF/GPS dan muatan tersembunyi); SVG dan file lain ditolak | `tests/image` |
| Spam dan penyalahgunaan | Pembatasan laju: login 10/10 menit, daftar 5/jam, checkout 10/10 menit per IP dan 60/10 menit per toko, bukti bayar dan unggah, API publik 120/menit | `tests/m5` (logika jendela); lihat batasan 2 di bawah |
| XSS | React meng-escape seluruh teks buatan pemilik; tidak ada `innerHTML`, `dangerouslySetInnerHTML`, atau `eval` di kode; tautan buatan pemilik hanya http(s) dan memakai `rel="noopener noreferrer"`; CSP produksi | Audit kode (pencarian pola, hasil kosong); `tests/units` (skema `javascript:` ditolak); header di `next.config.js` |
| Tema dan CSS injection | Warna hanya hex 6 digit, font dari daftar tetap; nilai lain diganti bawaan | `tests/units` (`parseThemeConfig`) |
| Slug berbahaya | Daftar slug yang dicadangkan, format ketat | `tests/units` |
| Perubahan tarif memengaruhi pesanan lama | Snapshot tarif dan harga pada pesanan | `tests/orders` |
| Stok tertahan | Kedaluwarsa 24 jam, dijalankan saat halaman dibuka dan oleh timer 5 menit; stok dikembalikan | `tests/orders`, `tests/m5` |
| Fungsi sistem dipanggil role aplikasi | Fungsi kedaluwarsa massal hanya untuk pemilik tabel; endpoint cron butuh `CRON_SECRET` (perbandingan waktu konstan) dan tidak ada jika rahasia tidak dipasang | `tests/m5` |
| Kredensial bocor | Secret Manager; `.env` di `.gitignore`; kunci service_role hanya di kode server (`server-only`); `docker --env-file` sementara dengan izin 600 | Tinjauan kode dan skrip |
| Migrasi gagal saat deploy | Migrasi dijalankan sebelum deploy; pipeline berhenti jika gagal | Log build |
| Header HTTP | `X-Content-Type-Options`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy`, `Permissions-Policy`, CSP (produksi), HSTS (saat HTTPS lewat Caddy) | `next.config.js`, `deploy/setup.sh` |

## 2. Temuan audit dependensi (`npm audit --omit=dev`)

Awal M5 ditemukan 4 temuan; setelah perbaikan tersisa **3**.

| Paket | Tingkat | Tindakan |
|---|---|---|
| `drizzle-orm` | tinggi (SQL injection lewat identifier yang tidak di-escape) | **Diperbaiki**: naik ke 0.45.4 dan `drizzle-kit` ke 0.31. Kode kita memang tidak memasukkan input pengguna ke identifier SQL (pencarian `sql.identifier` dan `sql.raw` kosong). Seluruh tes, lint, dan build lulus setelah naik versi |
| `postcss` (tinggi) dan `next` (sedang, karena membawa postcss) | pembacaan berkas lewat `sourceMappingURL` pada CSS yang dikendalikan penyerang, XSS pada keluaran stringify | **Diterima, tidak dapat dieksploitasi**: PostCSS hanya memproses CSS milik kita saat build, tidak pernah CSS dari pengguna di runtime (tema memakai nilai hex yang divalidasi). Perbaikan memerlukan Next versi mayor baru; dijadwalkan setelah beta |
| `zod` | tinggi (habisnya memori saat memvalidasi koleksi besar dengan batasan) | **Diterima, tidak dapat dieksploitasi**: zod hanya memvalidasi string dari formulir; tidak ada `z.array`, `z.record`, `z.set`, atau `z.map` di kode. Perbaikan memerlukan versi mayor baru dengan perubahan API; dijadwalkan setelah beta bersama tes untuk skema formulir |

## 3. Batasan dan risiko sisa (jujur)

1. **Dua kontrol infrastruktur belum terbukti di VM sungguhan:** HTTPS otomatis (Caddy + sslip.io) dan backup mingguan ke Cloud Storage. Skrip lulus pemeriksaan sintaks, tetapi baru dianggap bekerja setelah langkah verifikasinya di `docs/OPERASI.md` berhasil.
2. **Pembatasan laju berada di memori satu proses.** Hitungan hilang saat kontainer restart, dan tidak berbagi antar instance (kita hanya punya satu). Tanpa Caddy, alamat IP klien tidak dapat dipercaya, sehingga semua permintaan masuk satu keranjang global; batas global per toko tetap membatasi penyalahgunaan, tetapi pengguna sah dapat ikut terhambat saat diserang. Dengan HTTPS (`TRUST_PROXY=true`), pembatasan per IP aktif.
3. **CSP masih mengizinkan `unsafe-inline` untuk skrip dan gaya**, karena Next.js menyisipkan skrip inline. Pengerasan lebih lanjut (nonce) dapat dilakukan setelah beta.
4. **Kunci service_role Supabase memberi akses luas.** Dipakai hanya di server dan hanya setelah keanggotaan toko diperiksa lewat RLS. Alternatif yang lebih ketat (kebijakan Storage berbasis JWT pengguna) tidak diterapkan; layak dibahas sebagai trade-off di laporan.
5. **Verifikasi pembayaran bersifat manual** (sesuai rencana). Keamanannya bergantung pada pemilik toko mencocokkan nominal dengan mutasi rekening, bukan hanya tangkapan layar; dashboard mengingatkan hal ini.
6. **Verifikasi email dan MFA** bergantung pada pengaturan Supabase Auth, bukan kode Tokoku. Untuk pemakaian sungguhan, aktifkan konfirmasi email dan pertimbangkan MFA untuk pemilik toko.
7. **Peta memakai server ubin OpenStreetMap publik.** Cukup untuk demo; trafik besar memerlukan penyedia ubin sendiri sesuai kebijakan penggunaannya.
8. **Pembatasan laju tidak mencakup dashboard selain unggahan.** Akses dashboard sudah dilindungi login dan RLS.
9. **Data demo dan label.** Storefront berlabel DEMO dan tidak boleh dipakai untuk transaksi sungguhan sesuai batasan proyek.

## 4. Daftar periksa sebelum beta

- [ ] Password database sudah direset dan diperbarui di `.env` serta secret.
- [ ] Konfirmasi email Supabase Auth dinyalakan.
- [ ] HTTPS aktif dan terbukti (bagian 4a OPERASI.md); `TRUST_PROXY=true` terpasang otomatis oleh deployer.
- [ ] `CRON_SECRET` terpasang dan `journalctl -u tokoku-cron` menampilkan `{"expired":N}`.
- [ ] Satu backup berhasil dan satu pemulihan percobaan dilakukan.
- [ ] Budget alert dan uptime check aktif; kuota ditinjau (bagian 7 OPERASI.md).
- [ ] `npm run lint`, `npm run typecheck`, dan `npm test` hijau pada commit yang dideploy.
