import type { Metadata } from 'next';
import Link from 'next/link';
import { asc, eq } from 'drizzle-orm';
import { asAnon } from '@/db';
import { categories } from '@/db/schema';
import { listStorefrontProducts } from '@/lib/catalog';
import { getStorefront } from '@/lib/tenant';
import { ProductCard } from '@/components/ProductCard';

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const store = await getStorefront((await params).slug);
  return { title: store.name, description: store.description ?? undefined };
}

export default async function StorefrontHome({ params }: Props) {
  const { slug } = await params;
  const store = await getStorefront(slug);

  const { cats, featured, latest } = await asAnon(async (tx) => {
    const feat = await listStorefrontProducts(tx, store.id, { featuredOnly: true, limit: 8 });
    return {
      cats: await tx.select({ name: categories.name, slug: categories.slug }).from(categories)
        .where(eq(categories.storeId, store.id)).orderBy(asc(categories.name)),
      featured: feat.items,
      latest: feat.items.length === 0 ? (await listStorefrontProducts(tx, store.id, { limit: 8 })).items : [],
    };
  });
  const shown = featured.length > 0 ? featured : latest;

  return (
    <main className="container wide">
      <section className="hero-card">
        <h1>{store.name}</h1>
        {store.description && <p>{store.description}</p>}
        <Link href={`/s/${slug}/katalog`} className="btn btn-accent">Lihat semua produk</Link>
      </section>

      {cats.length > 0 && (
        <section aria-label="Kategori" className="stack">
          <h2>Kategori</h2>
          <ul className="chips scroll-x">
            {cats.map((c) => (
              <li key={c.slug}><Link href={`/s/${slug}/katalog?kategori=${c.slug}`} className="btn btn-secondary btn-sm">{c.name}</Link></li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="unggulan" className="stack">
        <h2 id="unggulan">{featured.length > 0 ? 'Produk unggulan' : 'Produk terbaru'}</h2>
        {shown.length === 0 ? (
          <div className="card empty"><h2>Produk segera hadir</h2><p className="muted">Toko ini belum menampilkan produk.</p></div>
        ) : (
          <div className="product-grid">{shown.map((p) => <ProductCard key={p.id} storeSlug={slug} p={p} />)}</div>
        )}
      </section>
    </main>
  );
}
