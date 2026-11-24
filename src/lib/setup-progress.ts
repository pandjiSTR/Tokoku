import { and, count, eq } from 'drizzle-orm';
import type { Tx } from '@/db';
import { paymentMethods, pickupSettings, products, shippingDefault, shippingLocalOptions, shippingRates, socialLinks, storeSettings, type Store } from '@/db/schema';
import { DEFAULT_THEME, parseThemeConfig } from '@/lib/theme';

export type SetupStep = { key: string; title: string; text: string; minutes: number; done: boolean; href: string };

/** Langkah penyiapan toko (sama untuk setup wizard dan checklist di Ringkasan). */
export async function loadSetupProgress(tx: Tx, store: Store, slug: string): Promise<SetupStep[]> {
  const sid = store.id;
  const n = async (q: Promise<{ n: number }[]>) => (await q)[0].n;
  const [settings] = await tx.select({ config: storeSettings.config }).from(storeSettings).where(eq(storeSettings.storeId, sid)).limit(1);
  const cfg = parseThemeConfig(settings?.config);
  const customized = !!store.logoPath || cfg.brand !== DEFAULT_THEME.brand || cfg.accent !== DEFAULT_THEME.accent || cfg.font !== DEFAULT_THEME.font;

  const socials = await n(tx.select({ n: count() }).from(socialLinks).where(eq(socialLinks.storeId, sid)));
  const methods = await n(tx.select({ n: count() }).from(paymentMethods).where(and(eq(paymentMethods.storeId, sid), eq(paymentMethods.active, true))));
  const active = await n(tx.select({ n: count() }).from(products).where(and(eq(products.storeId, sid), eq(products.status, 'active'))));
  const rates = await n(tx.select({ n: count() }).from(shippingRates).where(eq(shippingRates.storeId, sid)));
  const [def] = await tx.select().from(shippingDefault).where(eq(shippingDefault.storeId, sid));
  const [local] = await tx.select().from(shippingLocalOptions).where(eq(shippingLocalOptions.storeId, sid));
  const [pickup] = await tx.select().from(pickupSettings).where(eq(pickupSettings.storeId, sid));
  const shippingOk = rates > 0 || !!def?.active || !!local?.enabled || !!pickup?.enabled;

  const base = `/dashboard/${slug}`;
  return [
    { key: 'tampilan', title: 'Tampilan toko', text: 'Logo, warna, dan font agar toko terasa seperti brand Anda.', minutes: 1, done: customized, href: `${base}/pengaturan/tampilan` },
    { key: 'profil', title: 'Profil dan kontak', text: 'Deskripsi, alamat, kota, dan nomor WhatsApp.', minutes: 1, done: !!(store.description && store.address && store.cityCode && store.whatsapp), href: `${base}/pengaturan/profil` },
    { key: 'sosial', title: 'Media sosial', text: 'Tautan Instagram, TikTok, atau website.', minutes: 1, done: socials > 0, href: `${base}/pengaturan/sosial` },
    { key: 'pembayaran', title: 'Pembayaran', text: 'Rekening bank atau QRIS untuk menerima pembayaran.', minutes: 1, done: methods > 0, href: `${base}/pengaturan/pembayaran` },
    { key: 'pengiriman', title: 'Pengiriman', text: 'Tarif ekspedisi, kurir toko, atau ambil di toko.', minutes: 1, done: shippingOk, href: `${base}/pengaturan/pengiriman` },
    { key: 'produk', title: 'Produk pertama', text: 'Tambahkan produk, unggah foto, lalu aktifkan.', minutes: 1, done: active > 0, href: `${base}/produk` },
  ];
}
