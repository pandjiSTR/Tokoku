import { beforeAll, describe, expect, it } from 'vitest';
import { drizzle } from 'drizzle-orm/pglite';
import { sql } from 'drizzle-orm';
import type { PGlite } from '@electric-sql/pglite';
import * as schema from '@/db/schema';
import { createOrder, hashToken, OrderError, type CreateOrderInput, type PgTx } from '@/lib/orders';
import { asBuyer, asRole, createTestDb } from './helpers';

const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';
const SA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const SB = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const P1 = 'd0000000-0000-0000-0000-0000000000a1'; // aktif, 85.000, stok 5
const P2 = 'd0000000-0000-0000-0000-0000000000a2'; // draf
const P3 = 'd0000000-0000-0000-0000-0000000000a3'; // aktif, 10.000, stok 1
const PB = 'd0000000-0000-0000-0000-0000000000b1'; // toko B
const PM_A = 'e0000000-0000-0000-0000-0000000000a1';
const PM_OFF = 'e0000000-0000-0000-0000-0000000000a2';
const PM_B = 'e0000000-0000-0000-0000-0000000000b1';

let pg: PGlite;
let db: ReturnType<typeof drizzle<typeof schema>>;
let addr: NonNullable<CreateOrderInput['address']>;
let seq = 0;

const stockOf = async (id: string) => (await pg.query<{ stock: number }>(`select stock from products where id='${id}'`)).rows[0].stock;
const countOrders = async () => (await pg.query<{ n: number }>('select count(*)::int n from orders')).rows[0].n;

function input(over: Partial<CreateOrderInput> = {}): CreateOrderInput {
  return {
    storeId: SA, items: [{ productId: P1, qty: 1 }],
    buyer: { name: 'Rina', whatsapp: '6281234567890', email: null }, address: addr,
    paymentMethodId: PM_A, tokenHash: hashToken(`token-${++seq}`), ...over,
  };
}
const place = (i: CreateOrderInput) =>
  db.transaction(async (tx) => { await tx.execute(sql`set local role app_buyer`); return createOrder(tx as unknown as PgTx, i); });

beforeAll(async () => {
  pg = await createTestDb();
  db = drizzle(pg, { schema });
  const d = (await pg.query<{ code: string }>(`select code from regions where parent_code = '32.73' order by code limit 1`)).rows[0].code;
  addr = { provinceCode: '32', cityCode: '32.73', districtCode: d, text: 'Jl. Contoh No. 1' };
  await pg.exec(`
    insert into users (id,email,name) values ('${A}','a@t','A'),('${B}','b@t','B');
    insert into stores (id,slug,name) values ('${SA}','toko-a','Toko A'),('${SB}','toko-b','Toko B');
    insert into store_members (store_id,user_id,role) values ('${SA}','${A}','owner'),('${SB}','${B}','owner');
    insert into products (id,store_id,name,slug,price,stock,status,weight_gram) values
      ('${P1}','${SA}','Arabika','arabika',85000,5,'active',250),
      ('${P2}','${SA}','Draf','draf',5000,9,'draft',null),
      ('${P3}','${SA}','Langka','langka',10000,1,'active',null),
      ('${PB}','${SB}','Milik B','milik-b',1000,9,'active',null);
    insert into payment_methods (id,store_id,type,bank_name,account_number,account_name,active) values
      ('${PM_A}','${SA}','bank','BCA','0000111122','Toko A',true),
      ('${PM_OFF}','${SA}','bank','BNI','999','Toko A',false),
      ('${PM_B}','${SB}','bank','BRI','555','Toko B',true);
    insert into shipping_default (store_id, price, active) values ('${SA}', 20000, true), ('${SB}', 5000, true);
    insert into shipping_rates (store_id, city_code, price, active) values ('${SA}', '32.73', 18000, true);
  `);
});

describe('createOrder: harga, stok, dan kode unik', () => {
  it('menghitung total dari database dan mengurangi stok', async () => {
    const r = await place(input({ items: [{ productId: P1, qty: 2 }], pickCode: () => 287 }));
    expect(r).toMatchObject({ subtotal: 170000, shippingFee: 18000, uniqueCode: 287, total: 188287, orderNumber: 'TK-1001' });
    expect(await stockOf(P1)).toBe(3);
    const items = (await pg.query<{ name: string; price: number; qty: number }>(`select name, price, qty from order_items where order_id = '${r.orderId}'`)).rows;
    expect(items).toEqual([{ name: 'Arabika', price: 85000, qty: 2 }]);
    const o = (await pg.query<{ payment_snapshot: { bankName: string }; province_name: string }>(`select payment_snapshot, province_name from orders where id='${r.orderId}'`)).rows[0];
    expect(o.payment_snapshot.bankName).toBe('BCA');
    expect(o.province_name).toBe('Jawa Barat');
  });

  it('mengubah harga produk setelahnya tidak mengubah pesanan lama (snapshot)', async () => {
    await pg.exec(`update products set price = 99000 where id = '${P1}'`);
    const o = (await pg.query<{ price: number }>(`select price from order_items limit 1`)).rows[0];
    expect(o.price).toBe(85000);
    await pg.exec(`update products set price = 85000 where id = '${P1}'`);
  });

  it('menolak jika stok kurang dan membatalkan seluruh transaksi (stok tidak berubah)', async () => {
    const before = await countOrders();
    await expect(place(input({ items: [{ productId: P1, qty: 1 }, { productId: P3, qty: 2 }] }))).rejects.toMatchObject({ code: 'out_of_stock' });
    expect(await stockOf(P1)).toBe(3);
    expect(await stockOf(P3)).toBe(1);
    expect(await countOrders()).toBe(before);
  });

  it('unit terakhir hanya bisa dibeli satu pembeli (tidak oversell)', async () => {
    await place(input({ items: [{ productId: P3, qty: 1 }] }));
    await expect(place(input({ items: [{ productId: P3, qty: 1 }] }))).rejects.toBeInstanceOf(OrderError);
    expect(await stockOf(P3)).toBe(0);
  });

  it('menolak produk draf dan produk toko lain', async () => {
    await expect(place(input({ items: [{ productId: P2, qty: 1 }] }))).rejects.toMatchObject({ code: 'unavailable' });
    await expect(place(input({ items: [{ productId: PB, qty: 1 }] }))).rejects.toMatchObject({ code: 'unavailable' });
  });

  it('menolak keranjang kosong, metode pembayaran nonaktif atau milik toko lain', async () => {
    await expect(place(input({ items: [] }))).rejects.toMatchObject({ code: 'empty' });
    await expect(place(input({ paymentMethodId: PM_OFF }))).rejects.toMatchObject({ code: 'payment' });
    await expect(place(input({ paymentMethodId: PM_B }))).rejects.toMatchObject({ code: 'payment' });
  });

  it('menolak alamat yang tidak berjenjang', async () => {
    await expect(place(input({ address: { ...addr, provinceCode: '33' } }))).rejects.toMatchObject({ code: 'region' });
    await expect(place(input({ address: { ...addr, districtCode: '11.01.01' } }))).rejects.toMatchObject({ code: 'region' });
  });

  it('memakai tarif default untuk kota tanpa tarif khusus, dan menolak jika tidak ada tarif', async () => {
    const cityB = (await pg.query<{ code: string }>(`select code from regions where parent_code = '32' and code <> '32.73' order by code limit 1`)).rows[0].code;
    const distB = (await pg.query<{ code: string }>(`select code from regions where parent_code = '${cityB}' order by code limit 1`)).rows[0].code;
    const other = { provinceCode: '32', cityCode: cityB, districtCode: distB, text: 'Jl. Lain' };
    expect((await place(input({ address: other, pickCode: () => 111 }))).shippingFee).toBe(20000);
    await pg.exec(`update shipping_default set active = false where store_id = '${SA}'`);
    await expect(place(input({ address: other }))).rejects.toMatchObject({ code: 'shipping' });
    await pg.exec(`update shipping_default set active = true where store_id = '${SA}'`);
  });

  it('kode unik bertabrakan: otomatis mencoba kode lain agar nominal aktif tetap unik', async () => {
    await pg.exec(`update products set stock = 50 where id = '${P1}'`);
    const codes = [500, 500, 501];
    const make = () => input({ pickCode: () => codes.shift() ?? 777 });
    const first = await place(make());
    const second = await place(make());
    expect(first.total).not.toBe(second.total);
    expect(second.uniqueCode).toBe(501);
  });

  it('gagal dengan pesan ramai jika semua kode terpakai, dan stok dikembalikan', async () => {
    const stock = await stockOf(P1);
    const fixed = () => 321;
    await place(input({ pickCode: fixed }));
    await expect(place(input({ pickCode: fixed }))).rejects.toMatchObject({ code: 'busy' });
    expect(await stockOf(P1)).toBe(stock - 1);
  });
});

describe('akses pesanan lewat token (RLS)', () => {
  const tA = hashToken('rahasia-a');
  const tB = hashToken('rahasia-b');
  let orderA: string;

  beforeAll(async () => {
    await pg.exec(`update products set stock = 50 where id = '${P1}'`);
    orderA = (await place(input({ tokenHash: tA, pickCode: () => 601 }))).orderId;
    await place(input({ storeId: SB, items: [{ productId: PB, qty: 1 }], paymentMethodId: PM_B, tokenHash: tB, pickCode: () => 602 }));
  });

  it('pembeli hanya melihat pesanannya sendiri', async () => {
    const mine = await asBuyer(pg, tA, async (tx) => (await tx.query<{ id: string }>('select id from orders')).rows);
    expect(mine.map((r) => r.id)).toEqual([orderA]);
    const none = await asBuyer(pg, hashToken('salah'), async (tx) => (await tx.query('select id from orders')).rows);
    expect(none.length).toBe(0);
    expect((await asBuyer(pg, null, async (tx) => (await tx.query('select id from orders')).rows)).length).toBe(0);
  });

  it('pengunjung anonim tidak dapat membaca pesanan, item, bukti, atau metode pembayaran', async () => {
    for (const t of ['orders', 'order_items', 'payment_proofs', 'payment_methods', 'shipping_rates']) {
      await expect(asRole(pg, 'app_anon', null, (tx) => tx.query(`select 1 from ${t}`))).rejects.toThrow();
    }
  });

  it('pembeli tidak dapat mengubah nominal, data pembeli, atau status selain menunggu verifikasi', async () => {
    await expect(asBuyer(pg, tA, (tx) => tx.query(`update orders set total = 1 where id = '${orderA}'`))).rejects.toThrow();
    await expect(asBuyer(pg, tA, (tx) => tx.query(`update orders set buyer_name = 'x' where id = '${orderA}'`))).rejects.toThrow();
    await expect(asBuyer(pg, tA, (tx) => tx.query(`update orders set status = 'paid' where id = '${orderA}'`))).rejects.toThrow();
  });

  it('pembeli tidak dapat membuat pesanan berstatus dibayar', async () => {
    await expect(asBuyer(pg, hashToken('x'), (tx) => tx.query(
      `insert into orders (store_id, order_number, token_hash, status, buyer_name, buyer_whatsapp, province_code, city_code, district_code, province_name, city_name, district_name, address, subtotal, shipping_fee, unique_code, total, shipping_snapshot, payment_snapshot)
       values ('${SA}','TK-X', '${hashToken('x')}', 'paid', 'a','b','32','32.73','${addr.districtCode}','p','c','d','e',0,0,1,1,'{}','{}')`))).rejects.toThrow();
  });

  it('bukti bayar: hanya dengan token yang benar, dan pesanan menjadi menunggu verifikasi', async () => {
    const ins = (store: string, order: string) =>
      `insert into payment_proofs (store_id, order_id, sender_name, bank_name, transferred_at, path) values ('${store}','${order}','Rina','BCA', now(), 'p.webp')`;
    await expect(asBuyer(pg, tB, (tx) => tx.query(ins(SA, orderA)))).rejects.toThrow();
    await asBuyer(pg, tA, async (tx) => {
      await tx.query(ins(SA, orderA));
      await tx.query(`update orders set status = 'awaiting_verification' where id = '${orderA}'`);
    });
    expect((await pg.query<{ status: string }>(`select status from orders where id='${orderA}'`)).rows[0].status).toBe('awaiting_verification');
  });

  it('pemilik toko lain tidak melihat atau memverifikasi pesanan toko ini', async () => {
    expect((await asRole(pg, 'app_user', B, async (tx) => (await tx.query('select id from orders')).rows)).every((r) => (r as { id: string }).id !== orderA)).toBe(true);
    const res = await asRole(pg, 'app_user', B, (tx) => tx.query(`update orders set status = 'paid' where id = '${orderA}' returning id`));
    expect(res.rows.length).toBe(0);
    expect((await asRole(pg, 'app_user', B, async (tx) => (await tx.query('select id from payment_proofs')).rows)).length).toBe(0);
  });

  it('penolakan wajib disertai alasan; stok kembali saat ditolak', async () => {
    const before = await stockOf(P1);
    await expect(asRole(pg, 'app_user', A, (tx) => tx.query(`update orders set status = 'rejected' where id = '${orderA}'`))).rejects.toThrow();
    await asRole(pg, 'app_user', A, (tx) => tx.query(`update orders set status = 'rejected', rejected_reason = 'Mutasi tidak ditemukan' where id = '${orderA}'`));
    expect(await stockOf(P1)).toBe(before + 1);
  });

  it('transisi tidak sah ditolak dan pesanan yang ditolak tidak dapat dibuka lagi', async () => {
    await expect(asRole(pg, 'app_user', A, (tx) => tx.query(`update orders set status = 'paid' where id = '${orderA}'`))).rejects.toThrow();
  });

  it('alur sukses: terima -> proses -> kirim -> selesai, dan kedaluwarsa hanya dari sistem', async () => {
    const o = await place(input({ pickCode: () => 701 }));
    const tok = (await pg.query<{ token_hash: string }>(`select token_hash from orders where id='${o.orderId}'`)).rows[0].token_hash;
    await asBuyer(pg, tok, (tx) => tx.query(`update orders set status = 'awaiting_verification' where id = '${o.orderId}'`));
    for (const next of ['paid', 'processing', 'shipped', 'completed']) {
      await asRole(pg, 'app_user', A, (tx) => tx.query(`update orders set status = '${next}' where id = '${o.orderId}'`));
    }
    const r = (await pg.query<{ status: string; verified_at: string | null }>(`select status, verified_at from orders where id='${o.orderId}'`)).rows[0];
    expect(r.status).toBe('completed');
    expect(r.verified_at).not.toBeNull();
    const o2 = await place(input({ pickCode: () => 702 }));
    await expect(asRole(pg, 'app_user', A, (tx) => tx.query(`update orders set status = 'expired' where id = '${o2.orderId}'`))).rejects.toThrow();
  });

  it('pesanan belum dibayar yang lewat batas waktu kedaluwarsa dan stok dikembalikan', async () => {
    const before = await stockOf(P1);
    const o = await place(input({ pickCode: () => 801 }));
    expect(await stockOf(P1)).toBe(before - 1);
    await pg.exec(`update orders set expires_at = now() - interval '1 minute' where id = '${o.orderId}'`);
    const n = await asBuyer(pg, null, async (tx) => (await tx.query<{ n: number }>(`select app_expire_stale_orders('${SA}') as n`)).rows[0].n);
    expect(n).toBeGreaterThanOrEqual(1);
    expect((await pg.query<{ status: string }>(`select status from orders where id='${o.orderId}'`)).rows[0].status).toBe('expired');
    expect(await stockOf(P1)).toBe(before);
  });

  it('pembeli tidak dapat mengubah stok atau memanggil fungsi internal secara langsung', async () => {
    await expect(asBuyer(pg, null, (tx) => tx.query(`update products set stock = 9999`))).rejects.toThrow();
    await expect(asBuyer(pg, null, (tx) => tx.query(`select app_release_order_stock('${orderA}')`))).rejects.toThrow();
  });
});
