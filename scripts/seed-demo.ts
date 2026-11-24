// Membuat toko demo berdata dummy. Pemakaian: npm run seed:demo -- --email=akun@anda.com [--reset]
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq } from 'drizzle-orm';
import postgres from 'postgres';
import sharp from 'sharp';
import { users } from '../src/db/schema';
import { DEMO_SLUG, seedDemoStore } from '../src/lib/demo-seed';

const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const email = arg('email');
const reset = process.argv.includes('--reset');
const { DATABASE_URL, NEXT_PUBLIC_SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: key } = process.env;
if (!email || !DATABASE_URL || !url || !key) {
  console.error('Pemakaian: npm run seed:demo -- --email=akun@anda.com [--reset]\nPastikan .env berisi DATABASE_URL, NEXT_PUBLIC_SUPABASE_URL, dan SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

// Gambar dummy dibuat dari bentuk sederhana (tanpa teks), jadi tidak bergantung pada font sistem.
async function art(w: number, h: number, bg: string, fg: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="${bg}"/><circle cx="${w * 0.7}" cy="${h * 0.35}" r="${Math.min(w, h) * 0.28}" fill="${fg}" opacity=".85"/><rect x="${w * 0.12}" y="${h * 0.62}" width="${w * 0.5}" height="${h * 0.14}" rx="${h * 0.04}" fill="${fg}" opacity=".5"/></svg>`;
  return sharp(Buffer.from(svg)).webp({ quality: 80 }).toBuffer();
}

const dbUrl: string = DATABASE_URL;
const ownerEmail: string = email;

async function main() {
  const sb = createClient(url as string, key as string, { auth: { persistSession: false } });
  const client = postgres(dbUrl, { prepare: false, max: 1 });
  const db = drizzle(client);

  const [owner] = await db.select({ id: users.id }).from(users).where(eq(users.email, ownerEmail)).limit(1);
  if (!owner) {
    console.error(`Akun ${ownerEmail} belum terdaftar. Daftar dulu lewat /register, lalu jalankan ulang.`);
    await client.end();
    process.exit(1);
  }

  const storeId = randomUUID();
  async function up(bucket: string, path: string, data: Buffer) {
    const { error } = await sb.storage.from(bucket).upload(path, data, { contentType: 'image/webp', upsert: true });
    if (error) throw new Error(`Unggah ${path} gagal: ${error.message}`);
    return path;
  }
  const colors: [string, string][] = [['#d9c3a5', '#8b5e3c'], ['#b9cdbf', '#2f6b4f'], ['#e3b9a0', '#a8452a'], ['#c9c0da', '#5b4a8a'], ['#f0e0b0', '#b8860b'], ['#cfd8dc', '#455a64']];
  const products = await Promise.all(colors.map(async ([bg, fg], i) => up('product-images', `${storeId}/demo/p${i}.webp`, await art(900, 900, bg, fg))));
  const banners = await Promise.all([['#1f5c46', '#f6d58e'], ['#7a1f2b', '#ffd166']].map(async ([bg, fg], i) => up('product-images', `${storeId}/demo/b${i}.webp`, await art(1600, 700, bg, fg))));
  const qris = await up('product-images', `${storeId}/demo/qris.webp`, await art(600, 600, '#ffffff', '#000000'));
  const logo = await up('product-images', `${storeId}/demo/logo.webp`, await art(256, 256, '#1f5c46', '#f6d58e'));
  const proof = await up('payment-proofs', `${storeId}/demo/proof.webp`, await art(600, 900, '#eeeeee', '#1565c0'));

  const result = await db.transaction((tx) => seedDemoStore(tx as never, owner.id, storeId, { products, banners, qris, logo, proof }, { reset }));
  await client.end();

  console.log(`Toko demo dibuat: /s/${DEMO_SLUG}`);
  console.log(`Dashboard: /dashboard/${DEMO_SLUG}`);
  console.log(`Pesanan belum dibayar (untuk uji unggah bukti): /s/${DEMO_SLUG}/pesanan/${result.pendingToken}`);
  console.log('Catatan: gambar toko demo lama (jika --reset) tidak dihapus dari Storage.');
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
