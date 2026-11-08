import type { Metadata } from 'next';
import Link from 'next/link';
import { asc, eq } from 'drizzle-orm';
import { asAnon } from '@/db';
import { categories } from '@/db/schema';
import { listStorefrontProducts } from '@/lib/catalog';
import { getStorefront } from '@/lib/tenant';
import { ProductCard } from '@/components/ProductCard';

export const metadata: Metadata = { title: 'Katalog' };

export default async function Katalog({ params, searchParams }: {
  params: Promise<{ slug: string }>; searchParams: Promise<{ q?: string; kategori?: string; hal?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const store = await getStorefront(slug);
  const q = (sp.q ?? '').trim().slice(0, 80);
  const kategori = /^[a-z0-9-]{1,40}$/.test(sp.kategori ?? '') ? sp.kategori : undefined;
  const page = Math.max(1, Math.min(500, Number.parseInt(sp.hal ?? '1', 10) || 1));

  const { cats, result } = await asAnon(async (tx) => ({
    cats: await tx.select({ name: categories.name, slug: categories.slug }).from(categories)
      .where(eq(categories.storeId, store.id)).orderBy(asc(categories.name)),
    result: await listStorefrontProducts(tx, store.id, { q: q || undefined, categorySlug: kategori, page }),
  }));

  const href = (over: { kategori?: string | null; hal?: number }) => {
    const p = new URLSearchParams();
    if (q) p.set('q', q);
    const k = over.kategori === undefined ? kategori : over.kategori;
    if (k) p.set('kategori', k);
    if (over.hal && over.hal > 1) p.set('hal', String(over.hal));
    const qs = p.toString();
    return `/s/${slug}/katalog${qs ? `?${qs}` : ''}`;
  };

  return (
    <main className="container wide">
      <h1>Katalog</h1>
      {q && <p className="muted">Hasil pencarian untuk &ldquo;{q}&rdquo; ({result.total} produk)</p>}

      {cats.length > 0 && (
        <ul className="chips scroll-x" aria-label="Filter kategori">
          <li><Link href={href({ kategori: null })} aria-current={!kategori ? 'true' : undefined} className={`btn btn-sm ${!kategori ? '' : 'btn-secondary'}`}>Semua</Link></li>
          {cats.map((c) => (
            <li key={c.slug}><Link href={href({ kategori: c.slug })} aria-current={kategori === c.slug ? 'true' : undefined} className={`btn btn-sm ${kategori === c.slug ? '' : 'btn-secondary'}`}>{c.name}</Link></li>
          ))}
        </ul>
      )}

      {result.items.length === 0 ? (
        <div className="card empty">
          <h2>Produk tidak ditemukan</h2>
          <p className="muted">{q || kategori ? 'Coba kata kunci atau kategori lain.' : 'Toko ini belum menampilkan produk.'}</p>
          {(q || kategori) && <Link href={`/s/${slug}/katalog`} className="btn btn-secondary">Hapus filter</Link>}
        </div>
      ) : (
        <div className="product-grid">{result.items.map((p) => <ProductCard key={p.id} storeSlug={slug} p={p} />)}</div>
      )}

      {result.pages > 1 && (
        <nav className="pagination" aria-label="Halaman">
          {page > 1 ? <Link href={href({ hal: page - 1 })} className="btn btn-secondary btn-sm">Sebelumnya</Link> : <span />}
          <span className="muted small">Halaman {result.page} dari {result.pages}</span>
          {page < result.pages ? <Link href={href({ hal: page + 1 })} className="btn btn-secondary btn-sm">Berikutnya</Link> : <span />}
        </nav>
      )}
    </main>
  );
}
