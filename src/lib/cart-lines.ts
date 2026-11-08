import { cookies } from 'next/headers';
import { and, eq, inArray } from 'drizzle-orm';
import { asAnon } from '@/db';
import { products } from '@/db/schema';
import { cartCookieName, parseCart } from '@/lib/cart';
import { withCovers, type CardProduct } from '@/lib/catalog';

export type CartLine = { product: CardProduct; qty: number; ok: boolean; note: string | null };

/** Keranjang dari cookie dipadukan dengan data produk TERKINI dari database (harga dan stok tidak dipercaya dari cookie). */
export async function loadCart(storeId: string, slug: string) {
  const items = parseCart((await cookies()).get(cartCookieName(slug))?.value);
  if (items.length === 0) return { lines: [] as CartLine[], missing: [] as string[], subtotal: 0, valid: false };
  const found = await asAnon(async (tx) => {
    const rows = await tx.select({
      id: products.id, slug: products.slug, name: products.name, price: products.price,
      comparePrice: products.comparePrice, stock: products.stock, status: products.status,
    }).from(products).where(and(eq(products.storeId, storeId), inArray(products.id, items.map((i) => i.p)), eq(products.status, 'active')));
    return withCovers(tx, rows);
  });
  const byId = new Map(found.map((p) => [p.id, p]));
  const lines: CartLine[] = [];
  const missing: string[] = [];
  for (const i of items) {
    const product = byId.get(i.p);
    if (!product) { missing.push(i.p); continue; }
    const ok = product.stock >= i.q;
    lines.push({ product, qty: i.q, ok, note: ok ? null : product.stock === 0 ? 'Stok habis' : `Stok hanya ${product.stock}` });
  }
  const subtotal = lines.reduce((n, l) => n + l.product.price * l.qty, 0);
  return { lines, missing, subtotal, valid: lines.length > 0 && missing.length === 0 && lines.every((l) => l.ok) };
}
