import type { Metadata } from 'next';
import type { CSSProperties } from 'react';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { cartCookieName, cartCount, parseCart } from '@/lib/cart';
import { getPublicSocials, getStorefront } from '@/lib/tenant';
import { SOCIAL_LABEL } from '@/lib/validation';
import { imageUrl } from '@/lib/image-url';
import { getStoreTheme } from '@/lib/storefront-theme';
import { themeVars } from '@/lib/theme';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const store = await getStorefront((await params).slug);
  return store.faviconPath ? { icons: { icon: imageUrl(store.faviconPath) } } : {};
}

export default async function StorefrontLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const store = await getStorefront(slug);
  const socials = await getPublicSocials(store.id);
  const { theme, preview } = await getStoreTheme(store.id);
  const count = cartCount(parseCart((await cookies()).get(cartCookieName(slug))?.value));
  const waHref = store.whatsapp
    ? `https://wa.me/${store.whatsapp}?text=${encodeURIComponent(store.waGreeting || `Halo ${store.name}`)}`
    : null;

  return (
    <div className={`page theme-${theme.theme}`} style={themeVars(theme) as CSSProperties}>
      {preview && <div className="preview-bar" role="status">Pratinjau tampilan. Belum dipublikasikan.</div>}
      <header className="topbar">
        <div className="topbar-inner store-bar">
          <Link href={`/s/${slug}`} className="brand">
            {store.logoPath
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={imageUrl(store.logoPath)} alt="" className="brand-logo" />
              : <span className="brand-mark" aria-hidden="true">{store.name.slice(0, 2).toUpperCase()}</span>}
            <span className="ellipsis">{store.name}</span>
          </Link>
          <span className="spacer" />
          <span className="badge badge-demo">DEMO</span>
          <Link href={`/s/${slug}/keranjang`} className="btn btn-secondary btn-sm" aria-label={`Keranjang, ${count} item`}>
            Keranjang{count > 0 && <span className="badge" style={{ marginLeft: 6 }}>{count}</span>}
          </Link>
        </div>
        <div className="topbar-inner">
          <form action={`/s/${slug}/katalog`} method="get" role="search" className="search-form">
            <label htmlFor="q" className="sr-only">Cari produk</label>
            <input id="q" name="q" type="search" placeholder="Cari produk" autoComplete="off" />
            <button type="submit" className="btn btn-sm">Cari</button>
          </form>
        </div>
      </header>

      {children}

      <footer className="store-footer">
        <div className="container">
          <strong>{store.name}</strong>
          {store.address && <p className="muted">{store.address}</p>}
          {store.email && <p className="muted">{store.email}</p>}
          {socials.length > 0 && (
            <ul className="chips">
              {socials.map((s) => (
                <li key={s.platform}>
                  <a href={s.url} target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-sm">{SOCIAL_LABEL[s.platform]}</a>
                </li>
              ))}
            </ul>
          )}
          <p className="muted small">Situs demo untuk tugas kuliah. Bukan tempat transaksi sungguhan.</p>
        </div>
      </footer>

      {waHref && <a href={waHref} target="_blank" rel="noopener noreferrer" className="wa-fab" aria-label="Chat WhatsApp toko">Chat WhatsApp</a>}
    </div>
  );
}
