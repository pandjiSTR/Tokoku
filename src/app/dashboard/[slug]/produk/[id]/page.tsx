import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { asc, eq } from 'drizzle-orm';
import { asUser } from '@/db';
import { categories, productImages, products } from '@/db/schema';
import { getMyStore } from '@/lib/session';
import { forStore } from '@/lib/tenant';
import { isUuid } from '@/lib/product-form';
import { MAX_IMAGES_PER_PRODUCT } from '@/lib/image';
import { Alert } from '@/components/Alert';
import { ProductForm } from '@/components/ProductForm';
import { ProductImage } from '@/components/ProductImage';
import { deleteImage, deleteProduct, makeMainImage, updateProduct, uploadImages } from '../actions';

export const metadata: Metadata = { title: 'Ubah produk' };

const okText: Record<string, string> = {
  dibuat: 'Produk dibuat. Tambahkan foto di bawah, lalu ubah status menjadi Aktif agar tampil di toko.',
  disimpan: 'Perubahan tersimpan.',
  gambar: 'Gambar diunggah.',
  hapus_gambar: 'Gambar dihapus.',
  utama: 'Gambar utama diubah.',
};

export default async function EditPage({ params, searchParams }: {
  params: Promise<{ slug: string; id: string }>; searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const { slug, id } = await params;
  const { ok, error } = await searchParams;
  if (!isUuid(id)) notFound();
  const { user, store } = await getMyStore(slug);

  const data = await asUser(user.id, async (tx) => {
    const [product] = await tx.select().from(products).where(forStore(products.storeId, store.id, eq(products.id, id))).limit(1);
    if (!product) return null;
    const imgs = await tx.select().from(productImages)
      .where(forStore(productImages.storeId, store.id, eq(productImages.productId, id)))
      .orderBy(asc(productImages.position), asc(productImages.createdAt));
    const cats = await tx.select({ id: categories.id, name: categories.name }).from(categories)
      .where(eq(categories.storeId, store.id)).orderBy(asc(categories.name));
    return { product, imgs, cats };
  });
  if (!data) notFound();
  const { product, imgs, cats } = data;

  return (
    <main className="container">
      <Link href={`/dashboard/${slug}/produk`} className="muted small">&larr; Produk</Link>
      <h1>{product.name}</h1>
      {ok && okText[ok] && <Alert kind="info">{okText[ok]}</Alert>}
      {error && <Alert kind="error">{error}</Alert>}

      <section className="card stack" aria-labelledby="foto">
        <div className="row"><h2 id="foto">Foto produk</h2><span className="muted small">{imgs.length}/{MAX_IMAGES_PER_PRODUCT}</span></div>
        {imgs.length === 0 ? (
          <p className="muted">Belum ada foto. Foto pertama menjadi foto utama.</p>
        ) : (
          <ul className="image-list">
            {imgs.map((img, i) => (
              <li key={img.id} className="image-item">
                <ProductImage path={img.path} alt={`${product.name} foto ${i + 1}`} className="thumb-lg" />
                <div className="stack" style={{ gap: 8 }}>
                  {i === 0 ? <span className="badge">Foto utama</span> : (
                    <form action={makeMainImage.bind(null, slug, id, img.id)}><button className="btn btn-secondary btn-sm" type="submit">Jadikan utama</button></form>
                  )}
                  <form action={deleteImage.bind(null, slug, id, img.id)}><button className="btn btn-ghost btn-sm" type="submit">Hapus</button></form>
                </div>
              </li>
            ))}
          </ul>
        )}
        {imgs.length < MAX_IMAGES_PER_PRODUCT && (
          <form action={uploadImages.bind(null, slug, id)} className="stack">
            <div className="field">
              <label htmlFor="images">Tambah foto</label>
              <input id="images" name="images" type="file" accept="image/jpeg,image/png,image/webp" multiple />
              <p className="hint">JPG, PNG, atau WebP, maksimal 5 MB per foto dan 3 foto sekali unggah. Foto otomatis dikecilkan.</p>
            </div>
            <button type="submit" className="btn btn-secondary btn-block">Unggah</button>
          </form>
        )}
      </section>

      <ProductForm
        action={updateProduct.bind(null, slug, id)}
        categories={cats}
        defaults={{
          name: product.name, description: product.description, price: product.price, comparePrice: product.comparePrice,
          stock: product.stock, weightGram: product.weightGram, status: product.status, categoryId: product.categoryId, featured: product.featured,
        }}
        submitLabel="Simpan perubahan"
        cancelHref={`/dashboard/${slug}/produk`}
      />

      <details className="card danger-zone">
        <summary>Hapus produk</summary>
        <p className="muted">Produk dan semua fotonya dihapus permanen. Untuk menyembunyikan saja, ubah status menjadi Arsip.</p>
        <form action={deleteProduct.bind(null, slug, id)}><button className="btn btn-danger" type="submit">Ya, hapus produk ini</button></form>
      </details>
    </main>
  );
}
