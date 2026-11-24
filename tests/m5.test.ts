import { beforeAll, describe, expect, it, beforeEach } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { _resetRateLimits, checkLimit } from '@/lib/rate-limit-core';
import { asBuyer, asRole, createTestDb } from './helpers';

describe('pembatasan laju', () => {
  beforeEach(() => _resetRateLimits());
  it('mengizinkan sampai batas, lalu menolak dengan waktu tunggu', () => {
    const t = 1_000_000;
    for (let i = 0; i < 3; i++) expect(checkLimit('k', 3, 60, t + i).ok).toBe(true);
    const r = checkLimit('k', 3, 60, t + 10);
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.retryAfter).toBeGreaterThan(0);
  });
  it('jendela baru setelah waktu habis', () => {
    const t = 5_000_000;
    for (let i = 0; i < 3; i++) checkLimit('k', 3, 60, t);
    expect(checkLimit('k', 3, 60, t + 1000).ok).toBe(false);
    expect(checkLimit('k', 3, 60, t + 61_000).ok).toBe(true);
  });
  it('kunci berbeda tidak saling memengaruhi', () => {
    for (let i = 0; i < 5; i++) checkLimit('a', 5, 60, 1);
    expect(checkLimit('a', 5, 60, 2).ok).toBe(false);
    expect(checkLimit('b', 5, 60, 2).ok).toBe(true);
  });
});

describe('kedaluwarsa berkala semua toko', () => {
  let pg: PGlite;
  const SA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const SB = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  const P1 = 'd0000000-0000-0000-0000-0000000000a1';
  const P2 = 'd0000000-0000-0000-0000-0000000000b1';
  const order = (id: string, store: string, num: string, status: string, code: number, product: string) => `
    insert into orders (id, store_id, order_number, token_hash, status, buyer_name, buyer_whatsapp, subtotal, shipping_fee, unique_code, total, shipping_snapshot, payment_snapshot, shipping_method, expires_at)
    values ('${id}','${store}','${num}','h-${num}','${status}','x','x',1000,0,${code},${1000 + code},'{}','{}','pickup', now() - interval '1 hour');
    insert into order_items (store_id, order_id, product_id, name, price, qty) values ('${store}','${id}','${product}','p',1000,2);`;
  beforeAll(async () => {
    pg = await createTestDb();
    await pg.exec(`
      insert into stores (id,slug,name) values ('${SA}','a','A'),('${SB}','b','B');
      insert into products (id,store_id,name,slug,price,stock,status) values ('${P1}','${SA}','p','p',1000,10,'active'),('${P2}','${SB}','p','p',1000,10,'active');
      ${order('f0000000-0000-0000-0000-000000000001', SA, 'TK-1', 'pending_payment', 11, P1)}
      ${order('f0000000-0000-0000-0000-000000000002', SB, 'TK-2', 'pending_payment', 12, P2)}
      ${order('f0000000-0000-0000-0000-000000000003', SA, 'TK-3', 'awaiting_verification', 13, P1)}`);
  });
  it('role aplikasi tidak boleh menjalankan fungsi sistem', async () => {
    await expect(asBuyer(pg, null, (tx) => tx.query('select app_expire_all_stale_orders()'))).rejects.toThrow();
    await expect(asRole(pg, 'app_user', null, (tx) => tx.query('select app_expire_all_stale_orders()'))).rejects.toThrow();
  });
  it('mengedarkan semua toko sekaligus, hanya yang belum dibayar, dan mengembalikan stok', async () => {
    const r = await pg.query<{ n: number }>('select app_expire_all_stale_orders() as n');
    expect(r.rows[0].n).toBe(2);
    const st = (await pg.query<{ order_number: string; status: string }>('select order_number, status from orders order by order_number')).rows;
    expect(st).toEqual([{ order_number: 'TK-1', status: 'expired' }, { order_number: 'TK-2', status: 'expired' }, { order_number: 'TK-3', status: 'awaiting_verification' }]);
    const stock = (await pg.query<{ stock: number }>('select stock from products order by id')).rows.map((x) => x.stock);
    expect(stock).toEqual([12, 12]);
    expect((await pg.query<{ n: number }>('select app_expire_all_stale_orders() as n')).rows[0].n).toBe(0);
  });
});
