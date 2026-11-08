'use server';
import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { and, eq } from 'drizzle-orm';
import { asAnon } from '@/db';
import { products } from '@/db/schema';
import { addItem, cartCookieName, MAX_QTY, parseCart, serializeCart, type CartItem } from '@/lib/cart';
import { isUuid } from '@/lib/product-form';
import { getStorefront } from '@/lib/tenant';

const enc = encodeURIComponent;

async function readCart(slug: string) {
  return parseCart((await cookies()).get(cartCookieName(slug))?.value);
}
async function writeCart(slug: string, items: CartItem[]) {
  const jar = await cookies();
  jar.set(cartCookieName(slug), items.length ? serializeCart(items) : '', {
    httpOnly: true, sameSite: 'lax', path: `/s/${slug}`, maxAge: items.length ? 7 * 24 * 3600 : 0,
  });
}
const qtyOf = (fd: FormData) => {
  const n = Number.parseInt(String(fd.get('qty') ?? '1'), 10);
  return Number.isInteger(n) ? Math.max(0, Math.min(MAX_QTY, n)) : 1;
};
async function activeProduct(storeId: string, id: string) {
  const [p] = await asAnon((tx) => tx.select({ id: products.id, slug: products.slug, stock: products.stock })
    .from(products).where(and(eq(products.storeId, storeId), eq(products.id, id), eq(products.status, 'active'))).limit(1));
  return p ?? null;
}

export async function addToCart(slug: string, productId: string, formData: FormData) {
  const store = await getStorefront(slug);
  if (!isUuid(productId)) notFound();
  const p = await activeProduct(store.id, productId);
  if (!p) redirect(`/s/${slug}/katalog`);
  const items = await readCart(slug);
  const qty = Math.max(1, qtyOf(formData));
  const have = items.find((i) => i.p === p.id)?.q ?? 0;
  if (p.stock === 0) redirect(`/s/${slug}/produk/${p.slug}?error=${enc('Stok habis.')}`);
  if (have + qty > p.stock) redirect(`/s/${slug}/produk/${p.slug}?error=${enc(`Stok hanya ${p.stock}${have ? `, ${have} sudah ada di keranjang` : ''}.`)}`);
  await writeCart(slug, addItem(items, p.id, qty));
  redirect(`/s/${slug}/keranjang`);
}

export async function setQty(slug: string, productId: string, formData: FormData) {
  const store = await getStorefront(slug);
  if (!isUuid(productId)) notFound();
  const qty = qtyOf(formData);
  const items = await readCart(slug);
  if (qty === 0) {
    await writeCart(slug, items.filter((i) => i.p !== productId));
    redirect(`/s/${slug}/keranjang`);
  }
  const p = await activeProduct(store.id, productId);
  if (p && qty > p.stock) redirect(`/s/${slug}/keranjang?error=${enc(`Stok hanya ${p.stock}.`)}`);
  await writeCart(slug, items.map((i) => (i.p === productId ? { ...i, q: qty } : i)));
  redirect(`/s/${slug}/keranjang`);
}

export async function removeItem(slug: string, productId: string) {
  await getStorefront(slug);
  if (!isUuid(productId)) notFound();
  await writeCart(slug, (await readCart(slug)).filter((i) => i.p !== productId));
  redirect(`/s/${slug}/keranjang`);
}
