import type { Metadata } from 'next';
import Link from 'next/link';
import { asc, eq } from 'drizzle-orm';
import { asUser } from '@/db';
import { banners } from '@/db/schema';
import { getMyStore } from '@/lib/session';
import { imageUrl } from '@/lib/image-url';
import { formatDateTime, toWibInput } from '@/lib/format';
import { Alert } from '@/components/Alert';
import { addBanner, deleteBanner, moveBanner, updateBanner } from './actions';

export const metadata: Metadata = { title: 'Banner promosi' };

export default async function BannerPage({ params, searchParams }: {
  params: Promise<{ slug: string }>; searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const { slug } = await params;
  const { ok, error } = await searchParams;
  const { user, store } = await getMyStore(slug);
  const rows = await asUser(user.id, (tx) => tx.select().from(banners).where(eq(banners.storeId, store.id)).orderBy(asc(banners.position), asc(banners.createdAt)));
  const now = Date.now();
  const state = (b: (typeof rows)[number]) =>
    !b.active ? 'Nonaktif' : b.startsAt && b.startsAt.getTime() > now ? `Tayang ${formatDateTime(b.startsAt)}` : b.endsAt && b.endsAt.getTime() < now ? 'Sudah berakhir' : 'Sedang tayang';

  return (
    <main className="container">
      <Link href={`/dashboard/${slug}/pengaturan`} className="muted small">&larr; Pengaturan</Link>
      <h1>Banner promosi</h1>
      <p className="muted">Poster promosi di beranda. Atur jadwal tayang (WIB) dan urutannya. Gambar lebar (rasio sekitar 16:7) tampil paling baik.</p>
      {ok && <Alert kind="info">Perubahan tersimpan.</Alert>}
      {error && <Alert kind="error">{error}</Alert>}

      <section className="stack" aria-label="Daftar banner">
        {rows.length === 0 && <div className="card empty"><h2>Belum ada banner</h2><p className="muted">Tambahkan poster promosi pertama di bawah.</p></div>}
        {rows.map((b, i) => (
          <div key={b.id} className="card stack">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imageUrl(b.imagePath)} alt={b.title ?? 'Banner'} className="banner-img" />
            <span className="badge" style={{ alignSelf: 'flex-start' }}>{state(b)}</span>
            <form action={updateBanner.bind(null, slug, b.id)} className="stack">
              <div className="field"><label htmlFor={`t-${b.id}`}>Judul (opsional)</label><input id={`t-${b.id}`} name="title" maxLength={80} defaultValue={b.title ?? ''} /></div>
              <div className="field"><label htmlFor={`l-${b.id}`}>Tautan saat diketuk (opsional)</label><input id={`l-${b.id}`} name="link" defaultValue={b.linkUrl ?? ''} placeholder="https://..." /></div>
              <div className="grid-2">
                <div className="field"><label htmlFor={`s-${b.id}`}>Mulai tayang</label><input id={`s-${b.id}`} name="startsAt" type="datetime-local" defaultValue={toWibInput(b.startsAt)} /></div>
                <div className="field"><label htmlFor={`e-${b.id}`}>Selesai tayang</label><input id={`e-${b.id}`} name="endsAt" type="datetime-local" defaultValue={toWibInput(b.endsAt)} /></div>
              </div>
              <label className="check-row"><input type="checkbox" name="active" defaultChecked={b.active} /><span>Aktif</span></label>
              <button type="submit" className="btn btn-secondary btn-block">Simpan banner</button>
            </form>
            <div className="row">
              <div className="rate-form">
                <form action={moveBanner.bind(null, slug, b.id, 'up')}><button type="submit" className="btn btn-secondary btn-sm" disabled={i === 0}>Naik</button></form>
                <form action={moveBanner.bind(null, slug, b.id, 'down')}><button type="submit" className="btn btn-secondary btn-sm" disabled={i === rows.length - 1}>Turun</button></form>
              </div>
              <form action={deleteBanner.bind(null, slug, b.id)}><button type="submit" className="btn btn-ghost btn-sm">Hapus</button></form>
            </div>
          </div>
        ))}
      </section>

      <form action={addBanner.bind(null, slug)} className="card stack">
        <h2>Tambah banner</h2>
        <div className="field"><label htmlFor="file">Gambar</label><input id="file" name="file" type="file" accept="image/jpeg,image/png,image/webp" required /><p className="hint">JPG, PNG, atau WebP, maksimal 5 MB. Otomatis dikecilkan.</p></div>
        <div className="field"><label htmlFor="title">Judul (opsional)</label><input id="title" name="title" maxLength={80} /></div>
        <div className="field"><label htmlFor="link">Tautan saat diketuk (opsional)</label><input id="link" name="link" placeholder="https://..." /></div>
        <div className="grid-2">
          <div className="field"><label htmlFor="startsAt">Mulai tayang</label><input id="startsAt" name="startsAt" type="datetime-local" /></div>
          <div className="field"><label htmlFor="endsAt">Selesai tayang</label><input id="endsAt" name="endsAt" type="datetime-local" /></div>
        </div>
        <label className="check-row"><input type="checkbox" name="active" defaultChecked /><span>Aktif</span></label>
        <button type="submit" className="btn btn-block">Tambah banner</button>
      </form>
    </main>
  );
}
