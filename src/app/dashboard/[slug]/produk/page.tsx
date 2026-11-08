import type { Metadata } from 'next';
import Link from 'next/link';
import { asUser } from '@/db';
import { getMyStore } from '@/lib/session';
import { listDashboardProducts } from '@/lib/catalog';
import { formatRupiah } from '@/lib/format';
import { Alert } from '@/components/Alert';
import { ProductImage } from '@/components/ProductImage';

export const metadata: Metadata = { title: 'Produk' };

const statusLabel = { active: 'Aktif', draft: 'Draf', archived: 'Arsip' } as const;

export default async function ProdukPage({ params, searchParams }: {
  params: Promise<{ slug: string }>; searchParams: Promise<{ ok?: string }>;
}) {
  const { slug } = await params;
  const { ok } = await searchParams;
  const { user, store } = await getMyStore(slug);
  const items = await asUser(user.id, (tx) => listDashboardProducts(tx, store.id));

  return (
    <main className="container">
      <div className="row">
        <h1>Produk</h1>
        <Link href={`/dashboard/${slug}/produk/baru`} className="btn btn-sm">Tambah produk</Link>
      </div>
      {ok === 'dihapus' && <Alert kind="info">Produk dihapus.</Alert>}
      <Link href={`/dashboard/${slug}/kategori`} className="card link-card">
        <strong>Kelola kategori</strong>
        <span className="muted small">Kelompokkan produk agar mudah dicari pembeli</span>
      </Link>

      {items.length === 0 ? (
        <section className="card empty" aria-label="Belum ada produk">
          <h2>Belum ada produk</h2>
          <p className="muted">Tambahkan produk pertama, lalu ubah statusnya menjadi Aktif agar tampil di toko.</p>
          <Link href={`/dashboard/${slug}/produk/baru`} className="btn">Tambah produk</Link>
        </section>
      ) : (
        <section className="stack" aria-label="Daftar produk">
          {items.map((p) => (
            <Link key={p.id} href={`/dashboard/${slug}/produk/${p.id}`} className="card product-row">
              <ProductImage path={p.cover} alt={p.name} className="thumb" />
              <div className="stack" style={{ gap: 2, minWidth: 0 }}>
                <strong className="ellipsis-block">{p.name}</strong>
                <span>{formatRupiah(p.price)}</span>
                <span className="muted small">Stok {p.stock}</span>
              </div>
              <span className={`badge ${p.status === 'active' ? '' : 'badge-muted'}`}>{statusLabel[p.status]}</span>
            </Link>
          ))}
        </section>
      )}
    </main>
  );
}
