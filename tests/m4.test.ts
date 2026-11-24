import { beforeAll, describe, expect, it } from 'vitest';
import { drizzle } from 'drizzle-orm/pglite';
import { sql } from 'drizzle-orm';
import type { PGlite } from '@electric-sql/pglite';
import * as schema from '@/db/schema';
import { createOrder, hashToken, type CreateOrderInput, type PgTx } from '@/lib/orders';
import { asBuyer, asRole, createTestDb } from './helpers';

const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';
const SA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const SB = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const P1 = 'd0000000-0000-0000-0000-0000000000a1';
const PB = 'd0000000-0000-0000-0000-0000000000b1';
const PM_A = 'e0000000-0000-0000-0000-0000000000a1';
const PM_B = 'e0000000-0000-0000-0000-0000000000b1';

let pg: PGlite;
let db: ReturnType<typeof drizzle<typeof schema>>;
let seq = 0;
const place = (i: Partial<CreateOrderInput> & Pick<CreateOrderInput, 'shipping'>) =>
  db.transaction(async (tx) => {
    await tx.execute(sql`set local role app_buyer`);
    return createOrder(tx as unknown as PgTx, {
      storeId: SA, items: [{ productId: P1, qty: 1 }], buyer: { name: 'Rina', whatsapp: '6281234567890', email: null },
      paymentMethodId: PM_A, tokenHash: hashToken(`m4-${++seq}`), address: { text: 'Jl. Merdeka No. 10, Jakarta' }, ...i,
    });
  });
const set = (q: string) => pg.exec(q);
const near = { method: 'local' as const, lat: -6.193, lng: 106.8272 };   // ~2 km (x1,3 = 2,5) -> tier 3 km
const mid = { method: 'local' as const, lat: -6.23, lng: 106.8272 };     // ~6 km (x1,3 = 7,9) -> tier 10 km
const far = { method: 'local' as const, lat: -6.3, lng: 106.8272 };      // ~14 km (x1,3 = 18) -> di luar radius

beforeAll(async () => {
  pg = await createTestDb();
  db = drizzle(pg, { schema });
  await set(`
    insert into users (id,email,name) values ('${A}','a@t','A'),('${B}','b@t','B');
    insert into stores (id,slug,name) values ('${SA}','toko-a','A'),('${SB}','toko-b','B');
    insert into store_members (store_id,user_id,role) values ('${SA}','${A}','owner'),('${SB}','${B}','owner');
    insert into products (id,store_id,name,slug,price,stock,status) values ('${P1}','${SA}','Arabika','arabika',85000,500,'active'),('${PB}','${SB}','B','b',1000,500,'active');
    insert into payment_methods (id,store_id,type,bank_name,account_number,account_name) values ('${PM_A}','${SA}','bank','BCA','1','A'),('${PM_B}','${SB}','bank','BCA','2','B');
    insert into store_locations (store_id, lat, lng) values ('${SA}', -6.1754, 106.8272);
    insert into shipping_local_options (store_id, enabled, max_radius_km, correction) values ('${SA}', true, 10, 1.30), ('${SB}', true, 10, 1.30);
    insert into shipping_local_tiers (store_id, up_to_km, price) values ('${SA}', 3, 8000), ('${SA}', 6, 12000), ('${SA}', 10, 18000), ('${SB}', 3, 5000);
    insert into pickup_settings (store_id, enabled, instructions) values ('${SA}', true, 'Ambil di Jl. Contoh 1, jam 9-17');
  `);
});

describe('kurir toko (Haversine di server)', () => {
  it('menghitung jarak efektif dan tarif berjenjang, menyimpan titik pembeli', async () => {
    const r = await place({ shipping: near, pickCode: () => 101 });
    expect(r.shippingFee).toBe(8000);
    const o = (await pg.query<{ shipping_method: string; buyer_lat: number; distance_km: string; province_code: string | null; address: string }>(
      `select shipping_method, buyer_lat, distance_km, province_code, address from orders where id = '${r.orderId}'`)).rows[0];
    expect(o).toMatchObject({ shipping_method: 'local', buyer_lat: -6.193, province_code: null, address: 'Jl. Merdeka No. 10, Jakarta' });
    expect(Number(o.distance_km)).toBeGreaterThan(2);
    expect(Number(o.distance_km)).toBeLessThan(3);
    expect((await place({ shipping: mid, pickCode: () => 102 })).shippingFee).toBe(18000);
  });
  it('menolak di luar radius, koordinat tidak valid, dan alamat terlalu pendek', async () => {
    await expect(place({ shipping: far })).rejects.toMatchObject({ code: 'shipping' });
    await expect(place({ shipping: { method: 'local', lat: 0, lng: 0 } })).rejects.toMatchObject({ code: 'shipping' });
    await expect(place({ shipping: { method: 'local' } })).rejects.toMatchObject({ code: 'shipping' });
    await expect(place({ shipping: near, address: { text: 'pendek' } })).rejects.toMatchObject({ code: 'region' });
  });
  it('ditolak jika dinonaktifkan atau toko belum memasang lokasi', async () => {
    await set(`update shipping_local_options set enabled = false where store_id = '${SA}'`);
    await expect(place({ shipping: near })).rejects.toMatchObject({ code: 'shipping' });
    await set(`update shipping_local_options set enabled = true where store_id = '${SA}'`);
    await expect(place({ storeId: SB, items: [{ productId: PB, qty: 1 }], paymentMethodId: PM_B, shipping: near })).rejects.toMatchObject({ code: 'shipping' });
  });
  it('stok dikembalikan (transaksi dibatalkan) saat ongkir gagal', async () => {
    const before = (await pg.query<{ stock: number }>(`select stock from products where id='${P1}'`)).rows[0].stock;
    await expect(place({ shipping: far })).rejects.toThrow();
    expect((await pg.query<{ stock: number }>(`select stock from products where id='${P1}'`)).rows[0].stock).toBe(before);
  });
});

describe('pickup', () => {
  it('ongkir Rp0 tanpa alamat, dengan instruksi tersimpan', async () => {
    const r = await place({ shipping: { method: 'pickup' }, address: null, pickCode: () => 201 });
    expect(r.shippingFee).toBe(0);
    const o = (await pg.query<{ address: string | null; shipping_snapshot: { instructions: string } }>(`select address, shipping_snapshot from orders where id = '${r.orderId}'`)).rows[0];
    expect(o.address).toBeNull();
    expect(o.shipping_snapshot.instructions).toContain('Jl. Contoh');
  });
  it('ditolak jika pickup dinonaktifkan', async () => {
    await set(`update pickup_settings set enabled = false where store_id = '${SA}'`);
    await expect(place({ shipping: { method: 'pickup' }, address: null })).rejects.toMatchObject({ code: 'shipping' });
    await set(`update pickup_settings set enabled = true where store_id = '${SA}'`);
  });
  it('database menolak pesanan ekspedisi tanpa alamat lengkap', async () => {
    await expect(set(`insert into orders (store_id, order_number, token_hash, buyer_name, buyer_whatsapp, subtotal, shipping_fee, unique_code, total, shipping_snapshot, payment_snapshot)
      values ('${SA}','TK-BAD','hbad','x','x',0,0,1,1,'{}','{}')`)).rejects.toThrow();
  });
});

describe('koordinat toko bersifat privat', () => {
  it('pengunjung dan pembeli tidak dapat membaca tabel lokasi', async () => {
    await expect(asRole(pg, 'app_anon', null, (tx) => tx.query('select * from store_locations'))).rejects.toThrow();
    await expect(asBuyer(pg, null, (tx) => tx.query('select * from store_locations'))).rejects.toThrow();
  });
  it('pengunjung tidak dapat memanggil fungsi lokasi; pembeli bisa (hanya di server)', async () => {
    await expect(asRole(pg, 'app_anon', null, (tx) => tx.query(`select * from app_store_location('${SA}')`))).rejects.toThrow();
    const r = await asBuyer(pg, null, (tx) => tx.query(`select * from app_store_location('${SA}')`));
    expect(r.rows.length).toBe(1);
  });
  it('pemilik toko lain tidak membaca atau mengubah lokasi toko ini', async () => {
    expect((await asRole(pg, 'app_user', B, (tx) => tx.query('select * from store_locations'))).rows.length).toBe(0);
    const u = await asRole(pg, 'app_user', B, (tx) => tx.query(`update store_locations set lat = 0 where store_id = '${SA}' returning store_id`));
    expect(u.rows.length).toBe(0);
    await expect(asRole(pg, 'app_user', B, (tx) => tx.query(`insert into store_locations (store_id, lat, lng) values ('${SA}', 1, 1)`))).rejects.toThrow();
  });
  it('pemilik toko dapat membaca dan mengubah lokasinya sendiri', async () => {
    expect((await asRole(pg, 'app_user', A, (tx) => tx.query('select * from store_locations'))).rows.length).toBe(1);
    await asRole(pg, 'app_user', A, (tx) => tx.query(`update store_locations set lat = -6.1754 where store_id = '${SA}'`));
  });
});

describe('banner terjadwal', () => {
  beforeAll(async () => {
    await set(`
      insert into banners (store_id, image_path, title, active, starts_at, ends_at) values
        ('${SA}','a/aktif.webp','aktif',true,null,null),
        ('${SA}','a/nonaktif.webp','nonaktif',false,null,null),
        ('${SA}','a/belum.webp','belum',true, now() + interval '1 day', null),
        ('${SA}','a/lewat.webp','lewat',true, null, now() - interval '1 day'),
        ('${SA}','a/dalam.webp','dalam',true, now() - interval '1 day', now() + interval '1 day'),
        ('${SB}','b/b.webp','b',true,null,null);`);
  });
  it('pengunjung hanya melihat banner aktif yang sedang dalam jadwal', async () => {
    const r = await asRole(pg, 'app_anon', null, async (tx) => (await tx.query<{ title: string }>('select title from banners order by title')).rows);
    expect(r.map((x) => x.title)).toEqual(['aktif', 'b', 'dalam']);
  });
  it('pemilik melihat semua banner tokonya, tetapi tidak banner nonaktif toko lain', async () => {
    const r = await asRole(pg, 'app_user', A, async (tx) => (await tx.query<{ title: string }>('select title from banners order by title')).rows);
    expect(r.map((x) => x.title)).toEqual(['aktif', 'b', 'belum', 'dalam', 'lewat', 'nonaktif']);
  });
  it('pemilik toko lain tidak dapat mengubah atau menambah banner', async () => {
    const u = await asRole(pg, 'app_user', B, (tx) => tx.query(`update banners set title = 'x' where store_id = '${SA}' returning id`));
    expect(u.rows.length).toBe(0);
    await expect(asRole(pg, 'app_user', B, (tx) => tx.query(`insert into banners (store_id, image_path) values ('${SA}','x.webp')`))).rejects.toThrow();
  });
});

describe('ubah ongkir selama belum dibayar', () => {
  let orderId: string;
  let token: string;
  beforeAll(async () => {
    const r = await place({ shipping: { method: 'pickup' }, address: null, pickCode: () => 301 });
    orderId = r.orderId;
    token = (await pg.query<{ token_hash: string }>(`select token_hash from orders where id='${orderId}'`)).rows[0].token_hash;
  });
  it('pemilik dapat mengubah ongkir dan total secara konsisten', async () => {
    const r = await asRole(pg, 'app_user', A, (tx) => tx.query(`update orders set shipping_fee = 5000, total = subtotal + 5000 + unique_code where id = '${orderId}' returning total`));
    expect((r.rows[0] as { total: number }).total).toBe(85000 + 5000 + 301);
  });
  it('mengubah ongkir tanpa total ditolak (total harus = subtotal + ongkir + kode unik)', async () => {
    await expect(asRole(pg, 'app_user', A, (tx) => tx.query(`update orders set shipping_fee = 9000 where id = '${orderId}'`))).rejects.toThrow();
  });
  it('pembeli tidak dapat mengubah ongkir', async () => {
    await expect(asBuyer(pg, token, (tx) => tx.query(`update orders set shipping_fee = 0, total = subtotal + unique_code where id = '${orderId}'`))).rejects.toThrow();
  });
  it('pemilik toko lain tidak dapat mengubah ongkir', async () => {
    const r = await asRole(pg, 'app_user', B, (tx) => tx.query(`update orders set shipping_fee = 1, total = subtotal + 1 + unique_code where id = '${orderId}' returning id`));
    expect(r.rows.length).toBe(0);
  });
  it('setelah menunggu verifikasi, ongkir tidak dapat diubah lagi', async () => {
    await asBuyer(pg, token, (tx) => tx.query(`update orders set status = 'awaiting_verification' where id = '${orderId}'`));
    await expect(asRole(pg, 'app_user', A, (tx) => tx.query(`update orders set shipping_fee = 1000, total = subtotal + 1000 + unique_code where id = '${orderId}'`))).rejects.toThrow();
  });
});
