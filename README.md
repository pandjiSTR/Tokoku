# Tokoku (M0: Fondasi)

Next.js (App Router) + Supabase (Auth + PostgreSQL) + Drizzle ORM.

## Menjalankan
1. Buat project Supabase (free tier).
2. `cp .env.example .env.local` lalu isi nilainya. `DATABASE_URL` memakai Transaction pooler (port 6543).
3. Di Supabase > Authentication > Providers > Email: matikan "Confirm email" selama development (opsional).
4. `npm install`
5. `npm run db:migrate` (menerapkan folder `drizzle/`)
6. `npm run dev` lalu buka http://localhost:3000

## Uji kriteria selesai M0
Daftar di `/register`, masuk di `/login`, buat toko di `/dashboard`, buka `/s/<slug>`.

## Catatan
- Tenant ditentukan hanya lewat `resolveTenant()` di `src/lib/tenant.ts`.
- `forStore()` menambahkan filter `store_id` pada query milik toko (dipakai mulai M1).
- RLS dan tes isolasi tenant dikerjakan di M1.
- `output: 'standalone'` sudah aktif untuk Dockerfile di M0.5.
