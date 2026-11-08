import type { Metadata } from 'next';
import Link from 'next/link';
import { eq } from 'drizzle-orm';
import { asUser } from '@/db';
import { socialLinks } from '@/db/schema';
import { getMyStore } from '@/lib/session';
import { Alert } from '@/components/Alert';
import { SOCIAL_LABEL, SOCIAL_PLATFORMS } from '@/lib/validation';
import { updateSocials } from './actions';

export const metadata: Metadata = { title: 'Media sosial' };

export default async function SosialPage({ params, searchParams }: {
  params: Promise<{ slug: string }>; searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const { slug } = await params;
  const { ok, error } = await searchParams;
  const { user, store } = await getMyStore(slug);
  const rows = await asUser(user.id, (tx) => tx.select().from(socialLinks).where(eq(socialLinks.storeId, store.id)));
  const current = Object.fromEntries(rows.map((r) => [r.platform, r.url]));
  return (
    <main className="container">
      <Link href={`/dashboard/${slug}/pengaturan`} className="muted small">&larr; Pengaturan</Link>
      <h1>Media sosial</h1>
      {ok && <Alert kind="info">Perubahan tersimpan.</Alert>}
      {error && <Alert kind="error">{error}</Alert>}
      <form action={updateSocials.bind(null, slug)} className="card stack">
        {SOCIAL_PLATFORMS.map((p) => (
          <div className="field" key={p}>
            <label htmlFor={p}>{SOCIAL_LABEL[p]}</label>
            <input id={p} name={p} defaultValue={current[p] ?? ''}
              placeholder={p === 'instagram' || p === 'tiktok' ? '@namaakun atau tautan' : 'https://...'} autoCapitalize="none" />
          </div>
        ))}
        <p className="hint">Kosongkan kolom untuk menghapus tautan.</p>
        <button type="submit" className="btn btn-block">Simpan</button>
      </form>
    </main>
  );
}
