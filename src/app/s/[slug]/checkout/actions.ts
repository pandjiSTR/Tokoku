'use server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { asBuyer } from '@/db';
import { cartCookieName, parseCart } from '@/lib/cart';
import { createOrder, newOrderToken, OrderError } from '@/lib/orders';
import { getStorefront } from '@/lib/tenant';
import { normalizeWhatsapp } from '@/lib/validation';
import { buyerOrderCreated, ownerNewOrder } from '@/lib/messages';
import { appUrl, notify } from '@/lib/notify';
import { rateGuard, TOO_MANY } from '@/lib/rate-limit';

const schema = z.object({
  name: z.string().trim().min(2).max(80),
  whatsapp: z.string().trim().max(30),
  email: z.string().trim().max(120).default(''),
  paymentMethodId: z.string().uuid(),
  shippingMethod: z.enum(['courier', 'local', 'pickup']).default('courier'),
  provinceCode: z.string().regex(/^\d{2}$/).optional(),
  cityCode: z.string().regex(/^\d{2}\.\d{2}$/).optional(),
  districtCode: z.string().regex(/^\d{2}\.\d{2}\.\d{2}$/).optional(),
  address: z.string().trim().max(300).default(''),
  lat: z.coerce.number().optional(),
  lng: z.coerce.number().optional(),
});

export async function placeOrder(slug: string, formData: FormData) {
  const store = await getStorefront(slug);
  const back = (msg: string) => `/s/${slug}/checkout?error=${encodeURIComponent(msg)}`;
  // Per klien, dan batas global per toko (tetap melindungi jika header IP tidak dipercaya)
  if (!(await rateGuard('checkout', 10, 600)).ok || !(await rateGuard('checkout-store', 60, 600, store.id)).ok) redirect(back(TOO_MANY));

  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect(back('Periksa kembali isian Anda. Semua kolom bertanda wajib diisi.'));
  const v = parsed.data;
  const whatsapp = normalizeWhatsapp(v.whatsapp);
  if (!whatsapp) redirect(back('Nomor WhatsApp tidak valid. Contoh: 081234567890.'));
  if (v.shippingMethod === 'courier' && (!v.provinceCode || !v.cityCode || !v.districtCode || v.address.length < 8)) redirect(back('Lengkapi alamat pengiriman.'));
  if (v.email && !z.string().email().safeParse(v.email).success) redirect(back('Format email tidak valid.'));

  const jar = await cookies();
  const items = parseCart(jar.get(cartCookieName(slug))?.value).map((i) => ({ productId: i.p, qty: i.q }));
  const { token, hash } = newOrderToken();

  let failure: string | null = null;
  let result: Awaited<ReturnType<typeof createOrder>> | null = null;
  try {
    result = await asBuyer(hash, (tx) => createOrder(tx, {
      storeId: store.id, items, tokenHash: hash, paymentMethodId: v.paymentMethodId,
      buyer: { name: v.name, whatsapp, email: v.email || null },
      address: v.shippingMethod === 'pickup' ? null : { provinceCode: v.provinceCode, cityCode: v.cityCode, districtCode: v.districtCode, text: v.address },
      shipping: { method: v.shippingMethod, lat: v.lat, lng: v.lng },
    }));
  } catch (e) {
    failure = e instanceof OrderError ? e.message : 'Pesanan gagal dibuat. Coba lagi.';
    if (!(e instanceof OrderError)) console.error('placeOrder', e);
  }
  if (failure || !result) redirect(back(failure ?? 'Pesanan gagal dibuat.'));

  jar.set(cartCookieName(slug), '', { path: `/s/${slug}`, maxAge: 0 });

  const base = appUrl();
  const o = { orderNumber: result.orderNumber, total: result.total, buyerName: v.name };
  const own = ownerNewOrder(store.name, o, base ? `${base}/dashboard/${slug}/pesanan` : null);
  await notify({ storeId: store.id, orderId: result.orderId, to: store.email, template: 'owner_new_order', ...own });
  if (v.email) {
    const m = buyerOrderCreated(store.name, o, base ? `${base}/s/${slug}/pesanan/${token}` : null);
    await notify({ storeId: store.id, orderId: result.orderId, to: v.email, template: 'buyer_order_created', ...m });
  }
  redirect(`/s/${slug}/pesanan/${token}`);
}
