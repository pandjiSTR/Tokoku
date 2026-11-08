import { isUuid } from '@/lib/product-form';

export type CartItem = { p: string; q: number };
export const MAX_CART_ITEMS = 20;
export const MAX_QTY = 99;

export const cartCookieName = (slug: string) => `cart_${slug}`;

/** Membaca cookie keranjang dengan aman: input dari pengguna tidak pernah dipercaya. */
export function parseCart(raw: string | undefined): CartItem[] {
  if (!raw) return [];
  try {
    const data: unknown = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    const merged = new Map<string, number>();
    for (const x of data) {
      if (!x || typeof x !== 'object') continue;
      const { p, q } = x as { p?: unknown; q?: unknown };
      if (typeof p !== 'string' || !isUuid(p) || typeof q !== 'number' || !Number.isInteger(q) || q < 1) continue;
      merged.set(p, Math.min(MAX_QTY, (merged.get(p) ?? 0) + q));
    }
    return [...merged].slice(0, MAX_CART_ITEMS).map(([p, q]) => ({ p, q }));
  } catch {
    return [];
  }
}

export const serializeCart = (items: CartItem[]) => JSON.stringify(items);
export const cartCount = (items: CartItem[]) => items.reduce((n, i) => n + i.q, 0);

export function addItem(items: CartItem[], productId: string, qty: number): CartItem[] {
  const next = items.map((i) => ({ ...i }));
  const hit = next.find((i) => i.p === productId);
  if (hit) hit.q = Math.min(MAX_QTY, hit.q + qty);
  else if (next.length < MAX_CART_ITEMS) next.push({ p: productId, q: Math.min(MAX_QTY, qty) });
  return next;
}
