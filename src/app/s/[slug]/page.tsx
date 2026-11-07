import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { resolveTenant } from '@/lib/tenant';

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const store = await resolveTenant({ pathname: `/s/${slug}` });
  return { title: store?.name ?? 'Toko tidak ditemukan' };
}

export default async function Storefront({ params }: Props) {
  const { slug } = await params;
  const store = await resolveTenant({ pathname: `/s/${slug}` });
  if (!store) notFound();
  return (
    <div className="page">
      <header className="topbar">
        <div className="topbar-inner">
          <span className="brand">
            <span className="brand-mark" aria-hidden="true">{store.name.slice(0, 2).toUpperCase()}</span>
            {store.name}
          </span>
          <span className="spacer" />
          <span className="badge badge-demo">DEMO</span>
        </div>
      </header>
      <main className="container">
        <h1>{store.name}</h1>
        {store.description && <p className="muted">{store.description}</p>}
        <section className="card empty">
          <h2>Katalog segera hadir</h2>
          <p className="muted">Produk, keranjang, dan checkout akan tersedia di tahap berikutnya.</p>
        </section>
      </main>
    </div>
  );
}
