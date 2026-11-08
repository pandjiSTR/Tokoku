import { createHash, randomBytes, randomInt } from 'node:crypto';
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { PgTransaction } from 'drizzle-orm/pg-core';
import type * as schema from '@/db/schema';
import { orderItems, orders, paymentMethods, products, regions, shippingDefault, shippingGroupAreas, shippingGroups, shippingRates } from '@/db/schema';
import { resolveShippingRate } from '@/lib/shipping';

// Dipakai bersama oleh postgres-js (aplikasi) dan PGlite (tes).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type PgTx = PgTransaction<any, typeof schema, any>;

export const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
export const hashToken = (t: string) => createHash('sha256').update(t).digest('hex');
export function newOrderToken() {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashToken(token) };
}

export type OrderErrorCode = 'empty' | 'unavailable' | 'out_of_stock' | 'region' | 'shipping' | 'payment' | 'busy';
export class OrderError extends Error {
  constructor(public code: OrderErrorCode, message: string) { super(message); }
}

export type CreateOrderInput = {
  storeId: string;
  items: { productId: string; qty: number }[];
  buyer: { name: string; whatsapp: string; email: string | null };
  address: { provinceCode: string; cityCode: string; districtCode: string; text: string };
  paymentMethodId: string;
  tokenHash: string;
  pickCode?: () => number;
};

// postgres-js mengembalikan array, PGlite mengembalikan { rows }.
function rowsOf<T>(res: unknown): T[] {
  return (Array.isArray(res) ? res : (res as { rows: T[] }).rows) as T[];
}
function errCode(e: unknown): string | undefined {
  const x = e as { code?: string; cause?: { code?: string } };
  return x?.code ?? x?.cause?.code;
}

/**
 * Membuat pesanan. HARUS dipanggil di dalam transaksi dengan role app_buyer.
 * Harga, ongkir, dan total SELALU dihitung ulang dari database; stok dikurangi secara atomik.
 * Melempar OrderError jika gagal sehingga seluruh transaksi (termasuk stok) dibatalkan.
 */
export async function createOrder(tx: PgTx, input: CreateOrderInput) {
  const { storeId } = input;
  await tx.execute(sql`select set_config('app.order_token_hash', ${input.tokenHash}, true)`);
  await tx.execute(sql`select app_expire_stale_orders(${storeId}::uuid)`);

  const wanted = new Map<string, number>();
  for (const i of input.items) wanted.set(i.productId, (wanted.get(i.productId) ?? 0) + i.qty);
  if (wanted.size === 0 || wanted.size > 20) throw new OrderError('empty', 'Keranjang kosong.');

  const prods = await tx.select().from(products).where(and(eq(products.storeId, storeId), inArray(products.id, [...wanted.keys()])));
  if (prods.length !== wanted.size) throw new OrderError('unavailable', 'Ada produk yang tidak lagi tersedia. Periksa keranjang Anda.');

  // Wilayah harus berjenjang: kecamatan -> kota -> provinsi
  const a = input.address;
  const regs = await tx.select().from(regions).where(inArray(regions.code, [a.provinceCode, a.cityCode, a.districtCode]));
  const prov = regs.find((r) => r.code === a.provinceCode && r.level === 'province');
  const city = regs.find((r) => r.code === a.cityCode && r.level === 'city' && r.parentCode === a.provinceCode);
  const dist = regs.find((r) => r.code === a.districtCode && r.level === 'district' && r.parentCode === a.cityCode);
  if (!prov || !city || !dist) throw new OrderError('region', 'Alamat tidak valid. Pilih provinsi, kota/kabupaten, dan kecamatan.');

  const [rates, groups, areas, [def]] = [
    await tx.select().from(shippingRates).where(eq(shippingRates.storeId, storeId)),
    await tx.select().from(shippingGroups).where(eq(shippingGroups.storeId, storeId)),
    await tx.select().from(shippingGroupAreas).where(eq(shippingGroupAreas.storeId, storeId)),
    await tx.select().from(shippingDefault).where(eq(shippingDefault.storeId, storeId)),
  ];
  const ship = resolveShippingRate(a.cityCode, { rates, groups, areas, def: def ?? null });
  if (!ship) throw new OrderError('shipping', 'Toko belum melayani pengiriman ke kota ini. Hubungi toko lewat WhatsApp.');

  const [pm] = await tx.select().from(paymentMethods)
    .where(and(eq(paymentMethods.storeId, storeId), eq(paymentMethods.id, input.paymentMethodId), eq(paymentMethods.active, true))).limit(1);
  if (!pm) throw new OrderError('payment', 'Metode pembayaran tidak tersedia.');

  // Reservasi stok atomik (fungsi SECURITY DEFINER; pembeli tidak bisa mengubah stok langsung)
  let subtotal = 0;
  for (const p of prods) {
    const qty = wanted.get(p.id)!;
    const res = await tx.execute(sql`select app_reserve_stock(${storeId}::uuid, ${p.id}::uuid, ${qty}::int) as ok`);
    if (!rowsOf<{ ok: boolean }>(res)[0]?.ok) throw new OrderError('out_of_stock', `Stok "${p.name}" tidak mencukupi.`);
    subtotal += p.price * qty;
  }

  const numRes = await tx.execute(sql`select app_next_order_number(${storeId}::uuid) as n`);
  const orderNumber = rowsOf<{ n: string }>(numRes)[0].n;

  const pick = input.pickCode ?? (() => randomInt(1, 1000));
  const tried = new Set<number>();
  let created: { id: string; uniqueCode: number } | null = null;
  for (let attempt = 0; attempt < 40 && !created; attempt++) {
    const code = pick();
    if (tried.has(code)) continue;
    tried.add(code);
    try {
      const [row] = await tx.transaction((sp) => sp.insert(orders).values({
        storeId, orderNumber, tokenHash: input.tokenHash,
        buyerName: input.buyer.name, buyerWhatsapp: input.buyer.whatsapp, buyerEmail: input.buyer.email,
        provinceCode: prov.code, cityCode: city.code, districtCode: dist.code,
        provinceName: prov.name, cityName: city.name, districtName: dist.name, address: a.text,
        subtotal, shippingFee: ship.price, uniqueCode: code, total: subtotal + ship.price + code,
        shippingSnapshot: { source: ship.source, label: ship.label, price: ship.price },
        paymentMethodId: pm.id,
        paymentSnapshot: { type: pm.type, bankName: pm.bankName, accountNumber: pm.accountNumber, accountName: pm.accountName, qrisPath: pm.qrisPath },
      }).returning({ id: orders.id }));
      created = { id: row.id, uniqueCode: code };
    } catch (e) {
      if (errCode(e) !== '23505') throw e; // 23505 = nominal sudah dipakai pesanan aktif lain: coba kode lain
    }
  }
  if (!created) throw new OrderError('busy', 'Toko sedang ramai. Coba lagi sebentar.');

  await tx.insert(orderItems).values(prods.map((p) => ({
    storeId, orderId: created!.id, productId: p.id, name: p.name, price: p.price, qty: wanted.get(p.id)!, weightGram: p.weightGram,
  })));

  return { orderId: created.id, orderNumber, subtotal, shippingFee: ship.price, uniqueCode: created.uniqueCode, total: subtotal + ship.price + created.uniqueCode };
}
