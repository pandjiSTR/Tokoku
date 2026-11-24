// Data demo untuk pengujian beta. Sengaja hanya memakai impor relatif agar bisa dijalankan skrip tsx dan tes.
import { createHash, randomBytes } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import {
  banners, categories, orderItems, orders, paymentMethods, paymentProofs, pickupSettings, productImages, products, regions,
  shippingDefault, shippingGroupAreas, shippingGroups, shippingLocalOptions, shippingLocalTiers, shippingRates,
  socialLinks, storeLocations, storeMembers, storeSettings, stores,
} from '../db/schema';
import { rowsOf, type PgTx } from './pg';
import { toSlug } from './slug';

export const DEMO_SLUG = 'toko-demo';

export type DemoImages = { products: string[]; banners: string[]; qris: string; logo: string; proof: string };

const token = () => randomBytes(32).toString('base64url');
const hash = (t: string) => createHash('sha256').update(t).digest('hex');

type Status = 'pending_payment' | 'awaiting_verification' | 'paid' | 'completed' | 'rejected' | 'expired';

/**
 * Membuat toko demo lengkap (katalog, pembayaran, pengiriman, banner, dan 6 pesanan dengan status berbeda).
 * Dijalankan sebagai pemilik tabel di dalam satu transaksi. Mengembalikan tautan pesanan yang belum dibayar untuk demo.
 */
export async function seedDemoStore(tx: PgTx, ownerId: string, storeId: string, img: DemoImages, opts: { reset?: boolean } = {}) {
  const [existing] = await tx.select({ id: stores.id }).from(stores).where(eq(stores.slug, DEMO_SLUG)).limit(1);
  if (existing) {
    if (!opts.reset) throw new Error(`Toko "${DEMO_SLUG}" sudah ada. Jalankan dengan --reset untuk membuat ulang.`);
    await tx.delete(stores).where(eq(stores.id, existing.id));
  }

  await tx.insert(stores).values({
    id: storeId, slug: DEMO_SLUG, name: 'Toko Demo Kopi Senja', logoPath: img.logo,
    description: 'Toko contoh untuk pengujian Tokoku. Semua produk, rekening, dan pesanan di sini hanyalah data dummy.',
    address: 'Jl. Contoh No. 1, Bandung', provinceCode: '32', cityCode: '32.73',
    whatsapp: '6281234567890', waGreeting: 'Halo Toko Demo, saya mau tanya produk...',
  });
  await tx.insert(storeMembers).values({ storeId, userId: ownerId, role: 'owner' });
  await tx.insert(storeSettings).values({ storeId, config: { theme: 'minimal', brand: '#1f5c46', accent: '#f6d58e', font: 'jakarta' } });
  await tx.insert(socialLinks).values([{ storeId, platform: 'instagram', url: 'https://instagram.com/tokodemo' }, { storeId, platform: 'website', url: 'https://example.com/' }]);

  const cats = await tx.insert(categories).values(['Biji Kopi', 'Alat Seduh', 'Merchandise'].map((name) => ({ storeId, name, slug: toSlug(name, 40) }))).returning();
  const cat = (n: string) => cats.find((c) => c.name === n)!.id;
  const defs = [
    { name: 'Arabika Gayo 250 g', price: 85000, compare: 105000, stock: 40, cat: 'Biji Kopi', status: 'active', featured: true, w: 250 },
    { name: 'Robusta Temanggung 250 g', price: 65000, compare: null, stock: 25, cat: 'Biji Kopi', status: 'active', featured: false, w: 250 },
    { name: 'Blend House 500 g', price: 140000, compare: null, stock: 8, cat: 'Biji Kopi', status: 'active', featured: true, w: 500 },
    { name: 'Dripper V60 Keramik', price: 120000, compare: null, stock: 15, cat: 'Alat Seduh', status: 'active', featured: true, w: 400 },
    { name: 'Gooseneck Kettle 600 ml', price: 275000, compare: 320000, stock: 0, cat: 'Alat Seduh', status: 'active', featured: false, w: 900 },
    { name: 'Tumbler 350 ml', price: 95000, compare: null, stock: 30, cat: 'Merchandise', status: 'active', featured: false, w: 300 },
    { name: 'Tote Bag Kanvas', price: 55000, compare: null, stock: 50, cat: 'Merchandise', status: 'draft', featured: false, w: 200 },
    { name: 'Kopi Edisi Lama 250 g', price: 70000, compare: null, stock: 5, cat: 'Biji Kopi', status: 'archived', featured: false, w: 250 },
  ] as const;
  const prods = await tx.insert(products).values(defs.map((d) => ({
    storeId, categoryId: cat(d.cat), name: d.name, slug: toSlug(d.name, 60), price: d.price, comparePrice: d.compare, stock: d.stock,
    weightGram: d.w, status: d.status, featured: d.featured, description: `${d.name}. Produk contoh untuk pengujian.`,
  }))).returning();
  await tx.insert(productImages).values(prods.map((p, i) => ({ storeId, productId: p.id, path: img.products[i % img.products.length], position: 0 })));
  const P = (n: string) => prods.find((p) => p.name.startsWith(n))!;

  const methods = await tx.insert(paymentMethods).values([
    { storeId, type: 'bank' as const, bankName: 'BCA', accountNumber: '0000000000', accountName: 'Toko Demo (DUMMY)' },
    { storeId, type: 'qris' as const, qrisPath: img.qris },
    { storeId, type: 'bank' as const, bankName: 'BNI', accountNumber: '1111111111', accountName: 'Toko Demo (DUMMY)', active: false },
  ]).returning();

  await tx.insert(shippingDefault).values({ storeId, price: 25000, active: true });
  await tx.insert(shippingRates).values({ storeId, cityCode: '32.73', price: 18000, active: true });
  const [group] = await tx.insert(shippingGroups).values({ storeId, name: 'DKI Jakarta', price: 22000 }).returning();
  const jakarta = await tx.select({ code: regions.code }).from(regions).where(eq(regions.parentCode, '31'));
  if (jakarta.length) await tx.insert(shippingGroupAreas).values(jakarta.map((c) => ({ storeId, groupId: group.id, cityCode: c.code })));

  await tx.insert(storeLocations).values({ storeId, lat: -6.9218, lng: 107.6071 });
  await tx.insert(shippingLocalOptions).values({ storeId, enabled: true, maxRadiusKm: '10', correction: '1.30' });
  await tx.insert(shippingLocalTiers).values([{ storeId, upToKm: '3', price: 8000 }, { storeId, upToKm: '6', price: 12000 }, { storeId, upToKm: '10', price: 18000 }]);
  await tx.insert(pickupSettings).values({ storeId, enabled: true, instructions: 'Ambil di Jl. Contoh No. 1, Bandung. Buka 09.00-17.00.' });

  const day = 24 * 3600_000;
  await tx.insert(banners).values([
    { storeId, imagePath: img.banners[0], title: 'Promo akhir pekan', active: true, position: 0 },
    { storeId, imagePath: img.banners[1 % img.banners.length], title: 'Promo bulan depan (terjadwal)', active: true, position: 1, startsAt: new Date(Date.now() + 30 * day) },
  ]);

  // ---- Pesanan contoh ----
  const [district] = await tx.select({ code: regions.code, name: regions.name }).from(regions).where(eq(regions.parentCode, '32.73')).limit(1);
  const bandung = { provinceCode: '32', cityCode: '32.73', districtCode: district.code, provinceName: 'Jawa Barat', cityName: 'Kota Bandung', districtName: district.name };
  const bank = methods[0];
  const snap = { type: 'bank', bankName: 'BCA', accountNumber: '0000000000', accountName: 'Toko Demo (DUMMY)', qrisPath: null };
  let pendingToken = '';

  async function addOrder(o: {
    status: Status; items: [ReturnType<typeof P>, number][]; method: 'courier' | 'local' | 'pickup'; fee: number; code: number;
    buyer: string; reason?: string; proof?: boolean; consumesStock: boolean; expired?: boolean;
  }) {
    const num = rowsOf<{ n: string }>(await tx.execute(sql`select app_next_order_number(${storeId}::uuid) as n`))[0].n;
    const subtotal = o.items.reduce((s, [p, q]) => s + p.price * q, 0);
    const t = token();
    if (o.status === 'pending_payment') pendingToken = t;
    const [row] = await tx.insert(orders).values({
      storeId, orderNumber: num, tokenHash: hash(t), status: o.status, buyerName: o.buyer, buyerWhatsapp: '6281200000000',
      shippingMethod: o.method, ...(o.method === 'courier' ? bandung : {}),
      address: o.method === 'pickup' ? null : 'Jl. Pembeli Dummy No. 9',
      ...(o.method === 'local' ? { buyerLat: -6.93, buyerLng: 107.61, distanceKm: '1.80' } : {}),
      subtotal, shippingFee: o.fee, uniqueCode: o.code, total: subtotal + o.fee + o.code,
      shippingSnapshot: { method: o.method, price: o.fee }, paymentMethodId: bank.id, paymentSnapshot: snap,
      rejectedReason: o.reason ?? null,
      ...(o.status === 'paid' || o.status === 'completed' ? { verifiedAt: new Date(), verifiedBy: ownerId } : {}),
      ...(o.expired ? { expiresAt: new Date(Date.now() - day) } : {}),
    }).returning();
    await tx.insert(orderItems).values(o.items.map(([p, q]) => ({ storeId, orderId: row.id, productId: p.id, name: p.name, price: p.price, qty: q, weightGram: p.weightGram })));
    if (o.proof) await tx.insert(paymentProofs).values({ storeId, orderId: row.id, senderName: o.buyer, bankName: 'BCA', transferredAt: new Date(), path: img.proof });
    if (o.consumesStock) for (const [p, q] of o.items) await tx.update(products).set({ stock: sql`${products.stock} - ${q}` }).where(eq(products.id, p.id));
  }

  await addOrder({ status: 'pending_payment', items: [[P('Arabika'), 2]], method: 'courier', fee: 18000, code: 123, buyer: 'Rina (demo)', consumesStock: true });
  await addOrder({ status: 'awaiting_verification', items: [[P('Dripper'), 1]], method: 'local', fee: 8000, code: 234, buyer: 'Dimas (demo)', proof: true, consumesStock: true });
  await addOrder({ status: 'paid', items: [[P('Robusta'), 1], [P('Tumbler'), 1]], method: 'courier', fee: 18000, code: 345, buyer: 'Sari (demo)', consumesStock: true });
  await addOrder({ status: 'completed', items: [[P('Arabika'), 3]], method: 'pickup', fee: 0, code: 456, buyer: 'Budi (demo)', consumesStock: true });
  await addOrder({ status: 'rejected', items: [[P('Dripper'), 1]], method: 'courier', fee: 18000, code: 567, buyer: 'Toni (demo)', reason: 'Mutasi tidak ditemukan', consumesStock: false });
  await addOrder({ status: 'expired', items: [[P('Blend'), 1]], method: 'courier', fee: 18000, code: 678, buyer: 'Wati (demo)', consumesStock: false, expired: true });

  return { storeId, slug: DEMO_SLUG, pendingToken };
}
