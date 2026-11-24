import { beforeAll, describe, expect, it } from 'vitest';
import { drizzle } from 'drizzle-orm/pglite';
import type { PGlite } from '@electric-sql/pglite';
import * as schema from '@/db/schema';
import { DEMO_SLUG, seedDemoStore } from '@/lib/demo-seed';
import type { PgTx } from '@/lib/pg';
import { asBuyer, asRole, createTestDb } from './helpers';

const OWNER = '11111111-1111-1111-1111-111111111111';
const STORE = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const STORE2 = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const img = { products: ['p0.webp', 'p1.webp'], banners: ['b0.webp', 'b1.webp'], qris: 'q.webp', logo: 'l.webp', proof: 'pr.webp' };

let pg: PGlite;
let db: ReturnType<typeof drizzle<typeof schema>>;
const seed = (id: string, reset = false) => db.transaction((tx) => seedDemoStore(tx as unknown as PgTx, OWNER, id, img, { reset }));
const q = async <T,>(sql: string) => (await pg.query<T>(sql)).rows;

beforeAll(async () => {
  pg = await createTestDb();
  db = drizzle(pg, { schema });
  await pg.exec(`insert into users (id,email,name) values ('${OWNER}','owner@t','Owner')`);
});

describe('seed toko demo', () => {
  it('membuat toko lengkap tanpa melanggar aturan database', async () => {
    const r = await seed(STORE);
    expect(r.slug).toBe(DEMO_SLUG);
    expect(r.pendingToken.length).toBe(43);
    expect((await q<{ n: number }>('select count(*)::int n from products'))[0].n).toBe(8);
    expect((await q<{ n: number }>('select count(*)::int n from orders'))[0].n).toBe(6);
  });
  it('pesanan mencakup semua status contoh dan totalnya konsisten', async () => {
    const st = (await q<{ status: string }>('select status from orders order by order_number')).map((x) => x.status);
    expect(st).toEqual(['pending_payment', 'awaiting_verification', 'paid', 'completed', 'rejected', 'expired']);
    const bad = await q('select 1 from orders where total <> subtotal + shipping_fee + unique_code');
    expect(bad.length).toBe(0);
  });
  it('stok berkurang hanya untuk pesanan yang menahan atau menjual stok', async () => {
    const arabika = (await q<{ stock: number }>(`select stock from products where slug = 'arabika-gayo-250-g'`))[0].stock;
    expect(arabika).toBe(40 - 2 - 3);
    const blend = (await q<{ stock: number }>(`select stock from products where slug = 'blend-house-500-g'`))[0].stock;
    expect(blend).toBe(8);
  });
  it('pengunjung hanya melihat produk aktif dan banner yang sedang tayang', async () => {
    const prod = await asRole(pg, 'app_anon', null, async (tx) => (await tx.query<{ n: number }>('select count(*)::int n from products')).rows[0].n);
    expect(prod).toBe(6);
    const ban = await asRole(pg, 'app_anon', null, async (tx) => (await tx.query<{ n: number }>('select count(*)::int n from banners')).rows[0].n);
    expect(ban).toBe(1);
  });
  it('pembeli melihat metode pembayaran aktif saja dan ongkir kurir toko dapat dihitung', async () => {
    const m = await asBuyer(pg, null, async (tx) => (await tx.query<{ n: number }>('select count(*)::int n from payment_methods')).rows[0].n);
    expect(m).toBe(2);
    const loc = await asBuyer(pg, null, (tx) => tx.query(`select * from app_store_location('${STORE}')`));
    expect(loc.rows.length).toBe(1);
  });
  it('pemilik melihat semua pesanan dan satu pesanan menunggu verifikasi', async () => {
    const r = await asRole(pg, 'app_user', OWNER, async (tx) => (await tx.query<{ n: number }>(`select count(*)::int n from orders where status = 'awaiting_verification'`)).rows[0].n);
    expect(r).toBe(1);
  });
  it('kedaluwarsa berkala hanya menyentuh pesanan belum dibayar yang lewat batas', async () => {
    expect((await q<{ n: number }>('select app_expire_all_stale_orders() as n'))[0].n).toBe(0);
  });
  it('menolak membuat ulang tanpa reset, dan reset menggantikan seluruh isinya', async () => {
    await expect(seed(STORE2)).rejects.toThrow(/sudah ada/);
    await seed(STORE2, true);
    expect((await q<{ n: number }>(`select count(*)::int n from stores where slug = '${DEMO_SLUG}'`))[0].n).toBe(1);
    expect((await q<{ n: number }>('select count(*)::int n from products'))[0].n).toBe(8);
    expect((await q<{ n: number }>('select count(*)::int n from orders'))[0].n).toBe(6);
  });
});
