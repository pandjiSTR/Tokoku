import type { Metadata } from 'next';
import Link from 'next/link';
import { asc, eq } from 'drizzle-orm';
import { asAnon } from '@/db';
import { banners, categories } from '@/db/schema';
import { listStorefrontProducts } from '@/lib/catalog';
import { getStorefront } from '@/lib/tenant';
import { getStoreTheme } from '@/lib/storefront-theme';
import { imageUrl } from '@/lib/image-url';
import { ProductCard } from '@/components/ProductCard';

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const store = await getStorefront((await params).slug);
  return { title: store.name, description: store.description ?? undefined };
}

export default async function StorefrontHome({ params }: Props) {
  const { slug } = await params;
  const store = await getStorefront(slug);
  const { theme } = await getStoreTheme(store.id);

  const { cats, featured, latest, bannerRows } = await asAnon(async (tx) => {
    const feat = await listStorefrontProducts(tx, store.id, { featuredOnly: true, limit: 8 });
    return {
      cats: await tx.select({ name: categories.name, slug: categories.slug }).from(categories)
        .where(eq(categories.storeId, store.id)).orderBy(asc(categories.name)),
      featured: feat.items,
      latest: feat.items.length === 0 ? (await listStorefrontProducts(tx, store.id, { limit: 8 })).items : [],
      // Kebijakan RLS hanya meloloskan banner aktif yang sedang dalam jadwal tayang.
      bannerRows: await tx.select().from(banners).where(eq(banners.storeId, store.id)).orderBy(asc(banners.position), asc(banners.createdAt)),
    };
  });
  const shown = featured.length > 0 ? featured : latest;
  const waHref = store.whatsapp ? `https://wa.me/${store.whatsapp}?text=${encodeURIComponent(store.waGreeting || `Halo ${store.name}`)}` : null;

  const blocks: Record<string, React.ReactNode> = {
    banner: bannerRows.length > 0 && (
      <section key="banner" aria-label="Promo" className="banner-track">
        {bannerRows.map((b) => {
          // eslint-disable-next-line @next/next/no-img-element
          const img = <img src={imageUrl(b.imagePath)} alt={b.title ?? 'Promo'} loading="lazy" className="banner-img" />;
          return b.linkUrl
            ? <a key={b.id} href={b.linkUrl} target="_blank" rel="noopener noreferrer" className="banner-item">{img}</a>
            : <div key={b.id} className="banner-item">{img}</div>;
        })}
      </section>
    ),
    categories: cats.length > 0 && (
      <section key="categories" aria-label="Kategori" className="stack">
        <h2>Kategori</h2>
        <ul className="chips scroll-x">
          {cats.map((c) => <li key={c.slug}><Link href={`/s/${slug}/katalog?kategori=${c.slug}`} className="btn btn-secondary btn-sm">{c.name}</Link></li>)}
        </ul>
      </section>
    ),
    featured_products: (
      <section key="featured" aria-labelledby="unggulan" className="stack">
        <h2 id="unggulan">{featured.length > 0 ? 'Produk unggulan' : 'Produk terbaru'}</h2>
        {shown.length === 0 ? (
          <div className="card empty"><h2>Produk segera hadir</h2><p className="muted">Toko ini belum menampilkan produk.</p></div>
        ) : (
          <div className="product-grid">{shown.map((p) => <ProductCard key={p.id} storeSlug={slug} p={p} />)}</div>
        )}
      </section>
    ),
    about: (store.description || store.address) && (
      <section key="about" className="card stack" aria-labelledby="tentang">
        <h2 id="tentang">Tentang {store.name}</h2>
        {store.description && <p>{store.description}</p>}
        {store.address && <p className="muted">{store.address}</p>}
      </section>
    ),
    contact: (waHref || store.email) && (
      <section key="contact" className="card stack" aria-labelledby="hubungi">
        <h2 id="hubungi">Hubungi kami</h2>
        {store.email && <p className="muted">{store.email}</p>}
        {waHref && <a href={waHref} target="_blank" rel="noopener noreferrer" className="btn btn-secondary">Chat WhatsApp</a>}
      </section>
    ),
  };

  return (
    <main className="container wide">
      <section className="hero-card">
        <h1>{store.name}</h1>
        {store.description && <p>{store.description}</p>}
        <Link href={`/s/${slug}/katalog`} className="btn btn-accent">Lihat semua produk</Link>
      </section>
      {theme.sections.filter((s) => s.visible).map((s) => blocks[s.id] || null)}
    </main>
  );
}
