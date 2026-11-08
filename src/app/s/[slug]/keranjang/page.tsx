import type { Metadata } from 'next';
import Link from 'next/link';
import { getStorefront } from '@/lib/tenant';
import { loadCart } from '@/lib/cart-lines';
import { formatRupiah } from '@/lib/format';
import { Alert } from '@/components/Alert';
import { ProductImage } from '@/components/ProductImage';
import { removeItem, setQty } from './actions';

export const metadata: Metadata = { title: 'Keranjang' };

export default async function KeranjangPage({ params, searchParams }: {
  params: Promise<{ slug: string }>; searchParams: Promise<{ error?: string }>;
}) {
  const { slug } = await params;
  const { error } = await searchParams;
  const store = await getStorefront(slug);
  const cart = await loadCart(store.id, slug);

  if (cart.lines.length === 0 && cart.missing.length === 0) {
    return (
      <main className="container wide">
        <h1>Keranjang</h1>
        <div className="card empty">
          <h2>Keranjang masih kosong</h2>
          <p className="muted">Pilih produk di katalog, lalu tambahkan ke keranjang.</p>
          <Link href={`/s/${slug}/katalog`} className="btn">Lihat katalog</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="container wide">
      <h1>Keranjang</h1>
      {error && <Alert kind="error">{error}</Alert>}
      {cart.missing.length > 0 && <Alert kind="error">Ada produk yang tidak lagi tersedia. Hapus dari keranjang untuk melanjutkan.</Alert>}

      <section className="stack" aria-label="Isi keranjang">
        {cart.lines.map(({ product: p, qty, note }) => (
          <div key={p.id} className="card cart-line">
            <ProductImage path={p.cover} alt={p.name} className="thumb-lg" />
            <div className="stack grow" style={{ gap: 6, minWidth: 0 }}>
              <Link href={`/s/${slug}/produk/${p.slug}`} className="ellipsis-block" style={{ color: 'var(--ink)', textDecoration: 'none', fontWeight: 600 }}>{p.name}</Link>
              <strong>{formatRupiah(p.price)}</strong>
              {note && <span className="error small">{note}</span>}
              <form action={setQty.bind(null, slug, p.id)} className="qty-form">
                <label htmlFor={`q-${p.id}`} className="sr-only">Jumlah {p.name}</label>
                <input id={`q-${p.id}`} name="qty" type="number" min={0} max={99} defaultValue={qty} inputMode="numeric" />
                <button type="submit" className="btn btn-secondary btn-sm">Ubah</button>
              </form>
            </div>
            <form action={removeItem.bind(null, slug, p.id)}><button type="submit" className="btn btn-ghost btn-sm" aria-label={`Hapus ${p.name}`}>Hapus</button></form>
          </div>
        ))}
        {cart.missing.map((id) => (
          <div key={id} className="card row">
            <span className="muted">Produk tidak lagi tersedia</span>
            <form action={removeItem.bind(null, slug, id)}><button type="submit" className="btn btn-ghost btn-sm">Hapus</button></form>
          </div>
        ))}
      </section>

      <section className="card stack">
        <div className="row"><span className="muted">Subtotal</span><strong style={{ fontSize: 20 }}>{formatRupiah(cart.subtotal)}</strong></div>
        <p className="hint">Ongkir dihitung setelah alamat diisi di checkout.</p>
        {cart.valid
          ? <Link href={`/s/${slug}/checkout`} className="btn btn-block">Lanjut ke checkout</Link>
          : <span className="btn btn-block disabled-btn" aria-disabled="true">Perbaiki keranjang untuk melanjutkan</span>}
      </section>
    </main>
  );
}
