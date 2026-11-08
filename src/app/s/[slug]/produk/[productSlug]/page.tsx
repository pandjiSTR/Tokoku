import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { and, asc, eq } from 'drizzle-orm';
import { cache } from 'react';
import { asAnon } from '@/db';
import { categories, productImages, products } from '@/db/schema';
import { getStorefront } from '@/lib/tenant';
import { formatRupiah } from '@/lib/format';
import { Alert } from '@/components/Alert';
import { ProductImage } from '@/components/ProductImage';
import { addToCart } from '../../keranjang/actions';

type Props = { params: Promise<{ slug: string; productSlug: string }>; searchParams?: Promise<{ error?: string }> };

const load = cache(async (storeId: string, productSlug: string) =>
  asAnon(async (tx) => {
    const [product] = await tx.select().from(products)
      .where(and(eq(products.storeId, storeId), eq(products.slug, productSlug), eq(products.status, 'active'))).limit(1);
    if (!product) return null;
    const imgs = await tx.select({ id: productImages.id, path: productImages.path }).from(productImages)
      .where(and(eq(productImages.storeId, storeId), eq(productImages.productId, product.id)))
      .orderBy(asc(productImages.position), asc(productImages.createdAt));
    const [cat] = product.categoryId
      ? await tx.select({ name: categories.name, slug: categories.slug }).from(categories).where(eq(categories.id, product.categoryId)).limit(1)
      : [];
    return { product, imgs, cat };
  }));

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, productSlug } = await params;
  const store = await getStorefront(slug);
  const data = await load(store.id, productSlug);
  return { title: data?.product.name ?? 'Produk tidak ditemukan', description: data?.product.description?.slice(0, 150) ?? undefined };
}

export default async function ProductDetail({ params, searchParams }: Props) {
  const { slug, productSlug } = await params;
  const error = (await searchParams)?.error;
  const store = await getStorefront(slug);
  const data = await load(store.id, productSlug);
  if (!data) notFound();
  const { product, imgs, cat } = data;

  const waHref = store.whatsapp
    ? `https://wa.me/${store.whatsapp}?text=${encodeURIComponent(`Halo ${store.name}, saya mau tanya produk: ${product.name}`)}`
    : null;
  const stockText = product.stock === 0 ? 'Stok habis' : product.stock <= 5 ? `Stok tinggal ${product.stock}` : `Stok ${product.stock}`;

  return (
    <main className="container wide">
      <nav className="muted small" aria-label="Navigasi">
        <Link href={`/s/${slug}/katalog`}>Katalog</Link>
        {cat && <> / <Link href={`/s/${slug}/katalog?kategori=${cat.slug}`}>{cat.name}</Link></>}
      </nav>

      <div className="detail">
        <div className="gallery" aria-label="Foto produk">
          {imgs.length === 0
            ? <ProductImage path={null} alt={product.name} className="gallery-img" />
            : imgs.map((i, n) => <ProductImage key={i.id} path={i.path} alt={`${product.name} foto ${n + 1}`} className="gallery-img" />)}
        </div>

        <div className="stack">
          <h1>{product.name}</h1>
          <div className="price-row">
            <span className="price price-lg">{formatRupiah(product.price)}</span>
            {product.comparePrice && <span className="price-old">{formatRupiah(product.comparePrice)}</span>}
          </div>
          <span className={`badge ${product.stock === 0 ? 'badge-muted' : ''}`} style={{ alignSelf: 'flex-start' }}>{stockText}</span>
          {product.description && <p className="desc">{product.description}</p>}
          {product.weightGram && <p className="muted small">Berat {product.weightGram} g</p>}
          {waHref && <a href={waHref} target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-block">Tanya produk ini via WhatsApp</a>}
          {error && <Alert kind="error">{error}</Alert>}
          {product.stock > 0 ? (
            <form action={addToCart.bind(null, slug, product.id)} className="qty-form">
              <label htmlFor="qty" className="sr-only">Jumlah</label>
              <input id="qty" name="qty" type="number" min={1} max={Math.min(99, product.stock)} defaultValue={1} inputMode="numeric" />
              <button type="submit" className="btn grow">Tambah ke keranjang</button>
            </form>
          ) : (
            <span className="btn btn-block disabled-btn" aria-disabled="true">Stok habis</span>
          )}
        </div>
      </div>
    </main>
  );
}
