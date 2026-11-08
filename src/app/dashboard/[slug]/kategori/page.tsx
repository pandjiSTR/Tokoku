import type { Metadata } from 'next';
import Link from 'next/link';
import { asc, count, eq } from 'drizzle-orm';
import { asUser } from '@/db';
import { categories, products } from '@/db/schema';
import { getMyStore } from '@/lib/session';
import { Alert } from '@/components/Alert';
import { createCategory, deleteCategory, renameCategory } from './actions';

export const metadata: Metadata = { title: 'Kategori' };

const okText: Record<string, string> = { dibuat: 'Kategori dibuat.', disimpan: 'Nama kategori diubah.', dihapus: 'Kategori dihapus. Produknya tetap ada tanpa kategori.' };

export default async function KategoriPage({ params, searchParams }: {
  params: Promise<{ slug: string }>; searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const { slug } = await params;
  const { ok, error } = await searchParams;
  const { user, store } = await getMyStore(slug);
  const rows = await asUser(user.id, (tx) =>
    tx.select({ id: categories.id, name: categories.name, n: count(products.id) }).from(categories)
      .leftJoin(products, eq(products.categoryId, categories.id))
      .where(eq(categories.storeId, store.id)).groupBy(categories.id).orderBy(asc(categories.name)));

  return (
    <main className="container">
      <Link href={`/dashboard/${slug}/produk`} className="muted small">&larr; Produk</Link>
      <h1>Kategori</h1>
      {ok && okText[ok] && <Alert kind="info">{okText[ok]}</Alert>}
      {error && <Alert kind="error">{error}</Alert>}

      <form action={createCategory.bind(null, slug)} className="card stack">
        <div className="field">
          <label htmlFor="name">Kategori baru</label>
          <input id="name" name="name" placeholder="Biji kopi" required maxLength={60} />
        </div>
        <button type="submit" className="btn btn-block">Tambah kategori</button>
      </form>

      {rows.length === 0 ? (
        <section className="card empty"><h2>Belum ada kategori</h2><p className="muted">Kategori membantu pembeli menyaring produk di katalog.</p></section>
      ) : (
        <section className="stack" aria-label="Daftar kategori">
          {rows.map((c) => (
            <div key={c.id} className="card stack">
              <form action={renameCategory.bind(null, slug, c.id)} className="row" style={{ alignItems: 'flex-end' }}>
                <div className="field grow">
                  <label htmlFor={`n-${c.id}`}>{c.n} produk</label>
                  <input id={`n-${c.id}`} name="name" defaultValue={c.name} required maxLength={60} />
                </div>
                <button type="submit" className="btn btn-secondary btn-sm">Simpan</button>
              </form>
              <form action={deleteCategory.bind(null, slug, c.id)}><button type="submit" className="btn btn-ghost btn-sm">Hapus kategori</button></form>
            </div>
          ))}
        </section>
      )}
    </main>
  );
}
