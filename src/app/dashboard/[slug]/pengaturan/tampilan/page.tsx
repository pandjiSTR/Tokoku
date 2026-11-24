import type { Metadata } from 'next';
import Link from 'next/link';
import { eq } from 'drizzle-orm';
import { asUser } from '@/db';
import { storeSettings } from '@/db/schema';
import { getMyStore } from '@/lib/session';
import { imageUrl } from '@/lib/image-url';
import { parseThemeConfig } from '@/lib/theme';
import { Alert } from '@/components/Alert';
import { ThemeEditor } from '@/components/ThemeEditor';
import { removeBrandImage, saveTheme, uploadFavicon, uploadLogo } from './actions';

export const metadata: Metadata = { title: 'Tampilan toko' };

export default async function TampilanPage({ params, searchParams }: {
  params: Promise<{ slug: string }>; searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const { slug } = await params;
  const { ok, error } = await searchParams;
  const { user, store } = await getMyStore(slug);
  const [row] = await asUser(user.id, (tx) => tx.select({ config: storeSettings.config }).from(storeSettings).where(eq(storeSettings.storeId, store.id)).limit(1));

  return (
    <main className="container wide">
      <Link href={`/dashboard/${slug}/pengaturan`} className="muted small">&larr; Pengaturan</Link>
      <h1>Tampilan toko</h1>
      <p className="muted">Tema Minimal dengan warna, font, logo, favicon, dan urutan beranda yang bisa Anda sesuaikan. Lihat hasilnya langsung di pratinjau sebelum dipublikasikan.</p>
      {ok && <Alert kind="info">Perubahan tersimpan.</Alert>}
      {error && <Alert kind="error">{error}</Alert>}

      <ThemeEditor slug={slug} initial={parseThemeConfig(row?.config)} action={saveTheme.bind(null, slug)} />

      <section className="grid-2" aria-label="Logo dan favicon">
        <form action={uploadLogo.bind(null, slug)} className="card stack">
          <h2>Logo</h2>
          {store.logoPath && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageUrl(store.logoPath)} alt="Logo toko" className="thumb-lg" />
          )}
          <div className="field"><label htmlFor="logo">Gambar logo</label><input id="logo" name="file" type="file" accept="image/jpeg,image/png,image/webp" required /></div>
          <button type="submit" className="btn btn-secondary btn-block">Unggah logo</button>
          {store.logoPath && <button formAction={removeBrandImage.bind(null, slug, 'logo')} className="btn btn-ghost btn-block" type="submit" formNoValidate>Hapus logo</button>}
        </form>
        <form action={uploadFavicon.bind(null, slug)} className="card stack">
          <h2>Favicon</h2>
          {store.faviconPath && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageUrl(store.faviconPath)} alt="Favicon toko" className="thumb" />
          )}
          <div className="field"><label htmlFor="favicon">Gambar favicon</label><input id="favicon" name="file" type="file" accept="image/jpeg,image/png,image/webp" required /></div>
          <button type="submit" className="btn btn-secondary btn-block">Unggah favicon</button>
          {store.faviconPath && <button formAction={removeBrandImage.bind(null, slug, 'favicon')} className="btn btn-ghost btn-block" type="submit" formNoValidate>Hapus favicon</button>}
        </form>
      </section>
    </main>
  );
}
