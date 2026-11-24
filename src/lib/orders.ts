import { createHash, randomBytes, randomInt } from 'node:crypto';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { orderItems, orders, paymentMethods, pickupSettings, products, regions, shippingDefault, shippingGroupAreas, shippingGroups, shippingRates } from '@/db/schema';
import { quoteLocal } from '@/lib/local-delivery';
import { errCode, rowsOf, type PgTx } from '@/lib/pg';
import { resolveShippingRate } from '@/lib/shipping';

export type { PgTx } from '@/lib/pg';

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
  /** courier: wajib lengkap. local: cukup text. pickup: boleh kosong. */
  address?: { provinceCode?: string; cityCode?: string; districtCode?: string; text?: string } | null;
  /** Metode pengiriman. Default: courier (ekspedisi per kota). */
  shipping?: { method: 'courier' | 'local' | 'pickup'; lat?: number; lng?: number };
  paymentMethodId: string;
  tokenHash: string;
  pickCode?: () => number;
};

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

  const method = input.shipping?.method ?? 'courier';
  const a = input.address ?? {};
  const text = (a.text ?? '').trim();
  type Ship = {
    price: number; snapshot: Record<string, unknown>;
    region: { provinceCode: string; cityCode: string; districtCode: string; provinceName: string; cityName: string; districtName: string } | null;
    lat: number | null; lng: number | null; distanceKm: number | null;
  };
  let ship: Ship;

  if (method === 'courier') {
    // Wilayah harus berjenjang: kecamatan -> kota -> provinsi
    if (!a.provinceCode || !a.cityCode || !a.districtCode || !text) throw new OrderError('region', 'Alamat tidak valid. Pilih provinsi, kota/kabupaten, dan kecamatan.');
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
    const r = resolveShippingRate(a.cityCode, { rates, groups, areas, def: def ?? null });
    if (!r) throw new OrderError('shipping', 'Toko belum melayani pengiriman ke kota ini. Hubungi toko lewat WhatsApp.');
    ship = {
      price: r.price, snapshot: { method, source: r.source, label: r.label, price: r.price },
      region: { provinceCode: prov.code, cityCode: city.code, districtCode: dist.code, provinceName: prov.name, cityName: city.name, districtName: dist.name },
      lat: null, lng: null, distanceKm: null,
    };
  } else if (method === 'local') {
    if (text.length < 8) throw new OrderError('region', 'Alamat lengkap wajib diisi untuk kurir toko.');
    const q = await quoteLocal(tx, storeId, input.shipping?.lat, input.shipping?.lng);
    if (!q.available) {
      const why = { invalid: 'Titik lokasi tidak valid. Geser pin ke lokasi Anda.', disabled: 'Kurir toko tidak tersedia.', no_location: 'Toko belum mengatur lokasinya.', out_of_radius: 'Lokasi Anda di luar jangkauan kurir toko.' }[q.reason];
      throw new OrderError('shipping', why);
    }
    ship = {
      price: q.price, snapshot: { method, distanceKm: q.distanceKm, tierUpToKm: q.tierUpToKm, price: q.price }, region: null,
      lat: Math.round((input.shipping!.lat as number) * 1e5) / 1e5, lng: Math.round((input.shipping!.lng as number) * 1e5) / 1e5, distanceKm: q.distanceKm,
    };
  } else {
    const [pk] = await tx.select().from(pickupSettings).where(eq(pickupSettings.storeId, storeId)).limit(1);
    if (!pk?.enabled) throw new OrderError('shipping', 'Pengambilan di toko tidak tersedia.');
    ship = { price: 0, snapshot: { method, price: 0, instructions: pk.instructions }, region: null, lat: null, lng: null, distanceKm: null };
  }

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
        shippingMethod: method, buyerLat: ship.lat, buyerLng: ship.lng, distanceKm: ship.distanceKm === null ? null : String(ship.distanceKm),
        provinceCode: ship.region?.provinceCode ?? null, cityCode: ship.region?.cityCode ?? null, districtCode: ship.region?.districtCode ?? null,
        provinceName: ship.region?.provinceName ?? null, cityName: ship.region?.cityName ?? null, districtName: ship.region?.districtName ?? null,
        address: method === 'pickup' ? null : text,
        subtotal, shippingFee: ship.price, uniqueCode: code, total: subtotal + ship.price + code,
        shippingSnapshot: ship.snapshot,
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
