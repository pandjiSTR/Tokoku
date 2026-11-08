import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { sql } from 'drizzle-orm';
import * as schema from './schema';

// prepare:false wajib untuk Supabase transaction pooler.
// max kecil karena VM e2-micro hanya punya 1 GB RAM.
const client = postgres(process.env.DATABASE_URL!, { prepare: false, max: 3 });

/**
 * Koneksi pemilik tabel (melewati RLS). HANYA untuk tugas sistem seperti
 * mendaftarkan profil pengguna. Data toko selalu lewat asUser() atau asAnon().
 */
export const db = drizzle(client, { schema });

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Jalankan query sebagai pengguna login: RLS memakai app.user_id sebagai identitas. */
export function asUser<T>(userId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.user_id', ${userId}, true)`);
    await tx.execute(sql`set local role app_user`);
    return fn(tx);
  });
}

/** Jalankan query sebagai pengunjung publik (storefront): hanya bisa membaca data publik. */
export function asAnon<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`set local role app_anon`);
    return fn(tx);
  });
}

/** Pembeli tanpa akun: role app_buyer. Identitas pesanan = hash token (RLS membandingkan dengan kolom token_hash). */
export function asBuyer<T>(tokenHash: string | null, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    if (tokenHash) await tx.execute(sql`select set_config('app.order_token_hash', ${tokenHash}, true)`);
    await tx.execute(sql`set local role app_buyer`);
    return fn(tx);
  });
}
