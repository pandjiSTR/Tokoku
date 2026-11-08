// Membuat/memperbarui bucket publik untuk foto produk. Jalankan sekali: npm run storage:setup
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Isi NEXT_PUBLIC_SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY di file .env terlebih dahulu.');
  process.exit(1);
}

const sb = createClient(url, key, { auth: { persistSession: false } });
const buckets = [
  { id: 'product-images', options: { public: true, fileSizeLimit: 2 * 1024 * 1024, allowedMimeTypes: ['image/webp'] } },
  { id: 'payment-proofs', options: { public: false, fileSizeLimit: 3 * 1024 * 1024, allowedMimeTypes: ['image/webp'] } },
];

for (const { id, options } of buckets) {
  const { data: existing } = await sb.storage.getBucket(id);
  const { error } = existing ? await sb.storage.updateBucket(id, options) : await sb.storage.createBucket(id, options);
  if (error) {
    console.error(`Gagal (${id}):`, error.message);
    process.exit(1);
  }
  console.log(`Bucket ${id} ${existing ? 'diperbarui' : 'dibuat'} (${options.public ? 'publik' : 'privat'}).`);
}
