import type { Metadata } from 'next';
import Link from 'next/link';
import { asUser } from '@/db';
import { getMyStore } from '@/lib/session';
import { loadSetupProgress } from '@/lib/setup-progress';
import { CopyButton } from '@/components/CopyButton';

export const metadata: Metadata = { title: 'Panduan setup' };

export default async function MulaiPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { user, store } = await getMyStore(slug);
  const steps = await asUser(user.id, (tx) => loadSetupProgress(tx, store, slug));
  const done = steps.filter((s) => s.done).length;
  const next = steps.find((s) => !s.done);
  const minutesLeft = steps.filter((s) => !s.done).reduce((n, s) => n + s.minutes, 0);
  const pct = Math.round((done / steps.length) * 100);

  return (
    <main className="container">
      <div className="stack" style={{ gap: 4 }}>
        <span className="muted">Panduan setup</span>
        <h1>{next ? 'Siapkan tokomu' : 'Tokomu siap!'}</h1>
      </div>

      <section className="card stack" aria-label="Progres">
        <div className="row"><strong>{done} dari {steps.length} langkah</strong><span className="muted small">{next ? `sekitar ${minutesLeft} menit lagi` : 'selesai'}</span></div>
        <div className="progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Kemajuan setup"><span style={{ width: `${pct}%` }} /></div>
        {next && <Link href={next.href} className="btn btn-block">Lanjut: {next.title}</Link>}
      </section>

      <ol className="steps" aria-label="Langkah setup">
        {steps.map((s, i) => (
          <li key={s.key} className={`card step ${s === next ? 'current' : ''}`}>
            <span className={`check ${s.done ? 'done' : ''}`} aria-hidden="true">{s.done ? '✓' : i + 1}</span>
            <div className="stack grow" style={{ gap: 2, minWidth: 0 }}>
              <strong>{s.title}<span className="sr-only">{s.done ? ' (selesai)' : ' (belum)'}</span></strong>
              <span className="muted small">{s.text}</span>
            </div>
            <Link href={s.href} className={`btn btn-sm ${s.done ? 'btn-secondary' : ''}`}>{s.done ? 'Ubah' : 'Isi'}</Link>
          </li>
        ))}
      </ol>

      {!next && (
        <section className="card stack" aria-labelledby="link">
          <h2 id="link">Link toko Anda</h2>
          <p className="muted">Bagikan ke pelanggan lewat WhatsApp, Instagram, atau status Anda.</p>
          <code className="link-code">/s/{slug}</code>
          <div className="row">
            <Link href={`/s/${slug}`} className="btn btn-sm">Buka toko</Link>
            <CopyButton value={`/s/${slug}`} label="Salin alamat" />
          </div>
          <Link href={`/dashboard/${slug}`} className="btn btn-ghost btn-block">Ke dashboard</Link>
        </section>
      )}
      <p className="muted small">Langkah lain yang bisa Anda atur nanti: <Link href={`/dashboard/${slug}/pengaturan/banner`}>banner promosi</Link> dan <Link href={`/dashboard/${slug}/pengaturan/kurir-toko`}>kurir toko</Link>.</p>
    </main>
  );
}
