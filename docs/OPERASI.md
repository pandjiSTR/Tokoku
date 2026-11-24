# Panduan Operasional Tokoku

Dokumen ini untuk pengelola sistem (bukan pemilik toko). Semua perintah dijalankan di **Cloud Shell** kecuali disebut lain.
Awali sesi dengan: `gcloud config set project NAMA_PROJECT`.

## 1. Gambaran sistem

```
GitHub (main) ──► Cloud Build ──► Artifact Registry ──► VM Compute Engine (Docker) ──► Pengguna
                     │                                       │  (Caddy HTTPS, opsional)
                     ▼                                       ▼
              Secret Manager                        Supabase (DB + Storage)
```

- **Build dan CI/CD:** push ke `main` menjalankan `cloudbuild.yaml`: cek tipe, lint, tes, build image, push, migrasi database, lalu menulis tag image ke metadata VM.
- **Deployer di VM:** memeriksa metadata `image-tag` tiap 30 detik, menarik image, menjalankan kontainer, dan memeriksa kesehatannya. Jika gagal sehat, kembali otomatis ke versi sebelumnya.
- **Secret:** `database-url` (koneksi aplikasi, Transaction pooler port 6543), `app-env` (variabel runtime), `backup-database-url` (Session pooler port 5432, khusus backup).

## 2. Deploy normal

1. Merge atau push ke `main`. Pantau **Cloud Build > History** sampai lima langkah hijau.
2. Tunggu sekitar satu menit. Cek di VM: `gcloud compute ssh tokoku-vm --zone=us-central1-a --command='sudo docker ps --format "{{.Image}} {{.Status}}"'`.
3. Pull request memicu `cloudbuild-pr.yaml` (verifikasi saja, tanpa deploy). Jangan push ke `main` tanpa perlu: kuota build dibagi bersama.

## 3. Prosedur rollback

Rollback tidak membangun ulang apa pun: cukup menunjuk tag image yang lama.

1. Lihat tag yang tersedia: **Artifact Registry > tokoku > app** (tag = 7 karakter awal commit).
2. Pilih tag stabil terakhir, lalu:
   ```
   gcloud compute instances add-metadata tokoku-vm --zone=us-central1-a --metadata=image-tag=TAG_LAMA
   ```
3. Tunggu 30 sampai 60 detik, lalu verifikasi:
   ```
   gcloud compute ssh tokoku-vm --zone=us-central1-a --command='sudo docker ps --format "{{.Image}} {{.Status}}"; sudo journalctl -u tokoku-deploy -n 8 --no-pager'
   ```
   Hasil yang benar: kolom image berakhiran `:TAG_LAMA` dan log berisi `Deploy TAG_LAMA berhasil`.
4. **Penting:** deploy berikutnya (push ke `main`) menimpa rollback ini. Perbaiki penyebabnya di kode sebelum push lagi.
5. **Migrasi database tidak ikut mundur.** Rollback hanya mengganti kode. Migrasi bersifat menambah (tabel dan kolom baru), jadi kode lama tetap berjalan; jika sebuah migrasi mengubah atau menghapus struktur lama, pulihkan dari backup (bagian 6).
6. Jika image baru gagal health check, deployer otomatis kembali ke versi sebelumnya dan mencatat `failed-tag` agar tidak mencoba berulang. Lihat log: `sudo journalctl -u tokoku-deploy -n 50 --no-pager`.

## 4. Pesanan kedaluwarsa otomatis

Pesanan belum dibayar yang lewat batas 24 jam diubah menjadi kedaluwarsa dan stoknya dikembalikan. Ini terjadi dengan dua cara: saat halaman pesanan, dashboard, atau checkout toko dibuka, dan oleh timer VM tiap 5 menit.

Pemasangan timer:
1. Buat rahasia acak: `openssl rand -base64 32`.
2. Tambahkan baris `CRON_SECRET=...` ke secret `app-env` sebagai versi baru (lihat bagian 8).
3. Deploy ulang (atau jalankan `sudo bash setup.sh` di VM, lalu deploy) supaya kontainer menerima variabel baru.
4. Verifikasi: `gcloud compute ssh tokoku-vm --zone=us-central1-a --command='sudo systemctl start tokoku-cron; sudo journalctl -u tokoku-cron -n 5 --no-pager'`. Hasil yang benar: `{"expired":0}` (atau angka pesanan yang dikedaluwarsakan).

Tanpa `CRON_SECRET`, endpoint tidak aktif (404) dan timer hanya melewati langkahnya. Pembersihan tetap berjalan lewat cara pertama. Timer membaca rahasia dari kontainer yang sedang berjalan, bukan dari Secret Manager, jadi tidak memakai kuota panggilan API.

## 4a. HTTPS (disarankan sebelum dipakai pengguna sungguhan)

Tombol "Gunakan lokasi saya" (GPS) di checkout kurir toko hanya berfungsi di HTTPS. Pembatasan laju per IP juga memerlukan Caddy di depan aplikasi.

```
gcloud compute scp deploy/setup.sh tokoku-vm:~/ --zone=us-central1-a
gcloud compute ssh tokoku-vm --zone=us-central1-a --command='sudo bash ~/setup.sh --https'
```

- Alamat menjadi `https://IP-DENGAN-STRIP.sslip.io`, misalnya `https://34-136-234-3.sslip.io`. Alamat tercetak di akhir keluaran skrip, atau: `sudo cat /var/lib/tokoku/host`.
- Port 80 dan 443 sudah dibuka firewall `tokoku-allow-http`. Sertifikat diterbitkan otomatis oleh Caddy, dan penerbitan pertama dapat memakan satu menit.
- **IP VM bersifat sementara.** Setelah VM dimatikan lalu dinyalakan, IP dan domain berubah; Caddy dan aplikasi menyesuaikan sendiri dalam sekitar satu menit. Uptime check perlu dibuat ulang dengan alamat baru.
- Kembali ke HTTP biasa: `sudo bash ~/setup.sh` (tanpa `--https`).
- Status: skrip ini ditulis dan diperiksa sintaksnya, tetapi **belum diuji pada VM sungguhan** saat dokumen ini dibuat. Uji dengan membuka alamat HTTPS, lalu cek `sudo systemctl status caddy`.

## 5. Monitoring dan alert

- **Uptime check:** Monitoring > Uptime checks > buat check **HTTPS** ke domain sslip.io (atau HTTP ke IP jika belum HTTPS), path `/`, interval 5 menit. Buat alerting policy dengan durasi 5 menit dan notification channel email.
- **Log aplikasi:** `sudo docker logs --tail 100 tokoku`.
- **Pengiriman email notifikasi:** tabel `notifications_log` di Supabase (kolom `status`: sent, failed, skipped).

## 6. Backup dan pemulihan database

Paket gratis Supabase umumnya tidak menyertakan backup terjadwal yang dapat Anda unduh (periksa Database > Backups di dashboard Anda). Karena itu Tokoku membuat backup mingguan sendiri (`pg_dump`) ke Cloud Storage.

**Pemasangan (sekali):**
1. Buat bucket (region US agar masuk kuota gratis) dan aturan hapus otomatis setelah 30 hari:
   ```
   gcloud storage buckets create gs://NAMA-UNIK-BACKUP --location=us-central1
   echo '{"rule":[{"action":{"type":"Delete"},"condition":{"age":30}}]}' > lifecycle.json
   gcloud storage buckets update gs://NAMA-UNIK-BACKUP --lifecycle-file=lifecycle.json
   ```
2. Beri VM izin **hanya menambah** objek (tidak bisa menghapus):
   ```
   gcloud storage buckets add-iam-policy-binding gs://NAMA-UNIK-BACKUP --member=serviceAccount:tokoku-run@$(gcloud config get-value project).iam.gserviceaccount.com --role=roles/storage.objectCreator
   ```
3. Simpan string koneksi **Session pooler (port 5432)** sebagai secret (jangan tempel ke chat):
   ```
   printf '%s' 'STRING_SESSION_POOLER' | gcloud secrets create backup-database-url --data-file=-
   ```
4. Beri tahu VM nama bucket: `gcloud compute instances add-metadata tokoku-vm --zone=us-central1-a --metadata=backup-bucket=NAMA-UNIK-BACKUP`
5. Uji sekali: `gcloud compute ssh tokoku-vm --zone=us-central1-a --command='sudo systemctl start tokoku-backup; sudo journalctl -u tokoku-backup -n 5 --no-pager'`. Hasil yang benar: `Backup tersimpan: gs://.../backup-AAAAMMDD-JJMMSS.dump`. Cek juga file muncul di bucket.
6. Jadwal: setiap Minggu 20.00 UTC (Senin 03.00 WIB), dengan `Persistent=true` agar tetap jalan jika VM sempat mati.

Jika `pg_dump` mengeluh versi server lebih baru, ganti `postgres:17-alpine` di `/usr/local/bin/tokoku-backup` dengan versi yang sama dengan server Supabase Anda.

**Pemulihan (uji dulu di project Supabase cadangan, jangan langsung di produksi):**
1. Unduh berkas `.dump` dari bucket.
2. `pg_restore --clean --if-exists --no-owner --no-privileges -d "STRING_KONEKSI_TUJUAN" berkas.dump`
3. Jalankan `npm run db:migrate` ke database tujuan, lalu verifikasi dengan query ringkasan (jumlah wilayah 7837, tiga role aplikasi, 24 tabel ber-RLS, 12 migrasi).
4. Bucket Storage (foto produk, QRIS, bukti bayar) **tidak** ikut dalam `pg_dump`. Backup berkas dilakukan terpisah (unduh dari dashboard Supabase Storage) bila diperlukan.

Status: skrip backup ditulis dan diperiksa sintaksnya, tetapi **belum diuji terhadap database dan bucket sungguhan**. Anggap backup belum terbukti sampai langkah 5 di atas berhasil dan satu pemulihan percobaan dilakukan.

## 7. Peninjauan kuota dan biaya (lakukan sebelum demo dan tiap minggu saat beta)

Billing account dosen **dibagi bersama** semua project. Angka berikut berasal dari halaman harga resmi yang diperiksa pada 7 November 2026 (PDF disimpan di folder bukti laporan); angka bertanda (?) belum diverifikasi dan harus dicek lagi.

| Layanan | Batas gratis | Yang diperiksa |
|---|---|---|
| Compute Engine | 1 VM e2-micro di us-west1/us-central1/us-east1, disk standard 30 GB, 1 GB egress Amerika Utara per bulan | VM tetap e2-micro, disk `pd-standard`, region us-central1 |
| Cloud Build | 2.500 menit/bulan per billing account (e2-standard-2, default pool) | Billing > Reports, filter layanan Cloud Build |
| Artifact Registry | 0,5 GiB gratis, lalu sekitar $0,10 per GiB per bulan | Ukuran repo di Artifact Registry; cleanup policy tetap aktif; pemindaian kerentanan harus **nonaktif** |
| Cloud Storage (?) | sekitar 5 GB-bulan di region US tertentu | Ukuran bucket backup; aturan hapus 30 hari |
| Secret Manager (?) | beberapa versi aktif dan sekitar 10.000 operasi akses/bulan | Nonaktifkan versi secret lama; timer tidak memanggil Secret Manager |
| Trafik keluar | 1 GB gratis; selebihnya berbayar | Billing > Reports; foto produk dilayani Supabase, bukan VM |

Rutinitas mingguan:
1. **Billing > Reports**: biaya bulan berjalan harus Rp0 atau tertutup kredit trial; catat sisa kredit.
2. **Budget alert** tetap aktif dan email penerimanya benar.
3. **Cloud Build > History**: hitung jumlah build bulan ini dan catat durasi tiap build, lalu bandingkan dengan 2.500 menit.
4. **Artifact Registry**: jumlah image dan ukuran total.
5. **VM**: `sudo df -h /` (disk) dan `free -m` (memori; swap 2 GB aktif).
6. Matikan VM saat tidak dipakai (`gcloud compute instances stop tokoku-vm --zone=us-central1-a`); VM berhenti tidak memakai jam komputasi.

## 8. Mengubah rahasia

`app-env` berisi baris `KUNCI=nilai` (satu per baris): `SUPABASE_SERVICE_ROLE_KEY`, `APP_URL`, `CRON_SECRET`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`.

```
gcloud secrets versions add app-env --data-file=app-env.txt     # buat versi baru dari berkas lokal, lalu hapus berkasnya
gcloud secrets versions list app-env                             # lihat versi
gcloud secrets versions disable NOMOR_LAMA --secret=app-env      # matikan versi lama
```
Deployer selalu memakai versi terbaru yang aktif, tetapi hanya membacanya saat melakukan deploy. Setelah mengubah rahasia, jalankan ulang trigger build (atau ubah tag lewat metadata) agar kontainer memuatnya.

**Rotasi password database:** reset di Supabase > Connect > Reset database password, perbarui `.env` lokal, lalu tambahkan versi baru pada secret `database-url` dan `backup-database-url`, dan nonaktifkan versi lama.

## 9. Pemecahan masalah cepat

| Gejala | Periksa |
|---|---|
| Situs tidak terbuka | VM menyala? `gcloud compute instances list`. IP berubah? Firewall `tokoku-allow-http`? |
| Build merah di `migrate` | Secret `database-url`; coba string Session pooler sementara |
| Build hijau, situs lama | Log deployer (`journalctl -u tokoku-deploy`); `failed-tag` mungkin menahan tag tersebut |
| Unggah foto gagal | `SUPABASE_SERVICE_ROLE_KEY` di `app-env`; bucket ada (`npm run storage:setup`) |
| Email tidak terkirim | `notifications_log` (status failed atau skipped); variabel `SMTP_*` |
| GPS tidak berfungsi | Harus HTTPS (bagian 4a) |
| Terlalu banyak percobaan | Pembatasan laju; tunggu beberapa menit |
