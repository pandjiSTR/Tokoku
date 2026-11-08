import { and, asc, count, desc, eq, ilike, inArray, type SQL } from 'drizzle-orm';
import type { Tx } from '@/db';
import { categories, productImages, products } from '@/db/schema';

export const PAGE_SIZE = 12;

export type CardProduct = {
  id: string; slug: string; name: string; price: number; comparePrice: number | null;
  stock: number; status: 'active' | 'draft' | 'archived'; cover: string | null;
};

/** Menambahkan path gambar utama (posisi terkecil) ke daftar produk. */
export async function withCovers(
  tx: Tx,
  rows: Omit<CardProduct, 'cover'>[],
): Promise<CardProduct[]> {
  if (rows.length === 0) return [];
  const imgs = await tx
    .select({ productId: productImages.productId, path: productImages.path })
    .from(productImages)
    .where(inArray(productImages.productId, rows.map((r) => r.id)))
    .orderBy(asc(productImages.position), asc(productImages.createdAt));
  const cover = new Map<string, string>();
  for (const i of imgs) if (!cover.has(i.productId)) cover.set(i.productId, i.path);
  return rows.map((r) => ({ ...r, cover: cover.get(r.id) ?? null }));
}

const cardColumns = {
  id: products.id, slug: products.slug, name: products.name, price: products.price,
  comparePrice: products.comparePrice, stock: products.stock, status: products.status,
};

export function escapeLike(q: string) {
  return q.replace(/[\\%_]/g, '\\$&');
}

export type CatalogQuery = { q?: string; categorySlug?: string; page?: number; featuredOnly?: boolean; limit?: number };

/** Daftar produk AKTIF untuk storefront (dipanggil di dalam asAnon). */
export async function listStorefrontProducts(tx: Tx, storeId: string, o: CatalogQuery) {
  const limit = o.limit ?? PAGE_SIZE;
  const page = Math.max(1, o.page ?? 1);
  const conds: (SQL | undefined)[] = [eq(products.storeId, storeId), eq(products.status, 'active')];
  if (o.featuredOnly) conds.push(eq(products.featured, true));
  if (o.q) conds.push(ilike(products.name, `%${escapeLike(o.q)}%`));
  if (o.categorySlug) {
    const [cat] = await tx.select({ id: categories.id }).from(categories)
      .where(and(eq(categories.storeId, storeId), eq(categories.slug, o.categorySlug))).limit(1);
    if (!cat) return { items: [] as CardProduct[], total: 0, pages: 1, page };
    conds.push(eq(products.categoryId, cat.id));
  }
  const where = and(...conds);
  const [{ n }] = await tx.select({ n: count() }).from(products).where(where);
  const rows = await tx.select(cardColumns).from(products).where(where)
    .orderBy(desc(products.featured), desc(products.createdAt)).limit(limit).offset((page - 1) * limit);
  return { items: await withCovers(tx, rows), total: n, pages: Math.max(1, Math.ceil(n / limit)), page };
}

/** Produk untuk dashboard (semua status) milik satu toko. */
export async function listDashboardProducts(tx: Tx, storeId: string) {
  const rows = await tx.select(cardColumns).from(products)
    .where(eq(products.storeId, storeId)).orderBy(desc(products.createdAt)).limit(200);
  return withCovers(tx, rows);
}
