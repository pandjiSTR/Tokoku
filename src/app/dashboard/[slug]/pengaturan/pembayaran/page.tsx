import type { Metadata } from 'next';
import Link from 'next/link';
import { asc, eq } from 'drizzle-orm';
import { asUser } from '@/db';
import { paymentMethods } from '@/db/schema';
import { getMyStore } from '@/lib/session';
import { imageUrl } from '@/lib/image-url';
import { Alert } from '@/components/Alert';
import { addBank, addQris, deleteMethod, toggleMethod } from './actions';

export const metadata: Metadata = { title: 'Pembayaran' };

export default async function PembayaranPage({ params, searchParams }: {
  params: Promise<{ slug: string }>; searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const { slug } = await params;
  const { ok, error } = await searchParams;
  const { user, store } = await getMyStore(slug);
  const methods = await asUser(user.id, (tx) => tx.select().from(paymentMethods).where(eq(paymentMethods.storeId, store.id)).orderBy(asc(paymentMethods.createdAt)));

  return (
    <main className="container">
      <Link href={`/dashboard/${slug}/pengaturan`} className="muted small">&larr; Pengaturan</Link>
      <h1>Pembayaran</h1>
      <p className="muted">Pembeli membayar lewat transfer bank atau QRIS statis. Anda memverifikasi pembayaran secara manual dengan memeriksa mutasi rekening.</p>
      {ok && <Alert kind="info">Perubahan tersimpan.</Alert>}
      {error && <Alert kind="error">{error}</Alert>}

      {methods.length === 0 ? (
        <section className="card empty"><h2>Belum ada metode pembayaran</h2><p className="muted">Tambahkan minimal satu agar pembeli dapat checkout.</p></section>
      ) : (
        <section className="stack" aria-label="Metode pembayaran">
          {methods.map((m) => (
            <div key={m.id} className="card stack">
              <div className="row">
                <strong>{m.type === 'qris' ? 'QRIS' : `Transfer ${m.bankName}`}</strong>
                <span className={`badge ${m.active ? '' : 'badge-muted'}`}>{m.active ? 'Aktif' : 'Nonaktif'}</span>
              </div>
              {m.type === 'bank' ? <p className="muted">{m.accountNumber} a.n. {m.accountName}</p> : m.qrisPath && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={imageUrl(m.qrisPath)} alt="QRIS" className="qris" />
              )}
              <div className="row">
                <form action={toggleMethod.bind(null, slug, m.id, !m.active)}><button type="submit" className="btn btn-secondary btn-sm">{m.active ? 'Nonaktifkan' : 'Aktifkan'}</button></form>
                <form action={deleteMethod.bind(null, slug, m.id)}><button type="submit" className="btn btn-ghost btn-sm">Hapus</button></form>
              </div>
            </div>
          ))}
        </section>
      )}

      <form action={addBank.bind(null, slug)} className="card stack">
        <h2>Tambah rekening bank</h2>
        <div className="field"><label htmlFor="bankName">Bank</label><input id="bankName" name="bankName" placeholder="BCA" required maxLength={40} /></div>
        <div className="field"><label htmlFor="accountNumber">Nomor rekening</label><input id="accountNumber" name="accountNumber" inputMode="numeric" required /></div>
        <div className="field"><label htmlFor="accountName">Nama pemilik rekening</label><input id="accountName" name="accountName" required maxLength={80} /></div>
        <button type="submit" className="btn btn-block">Tambah rekening</button>
      </form>

      <form action={addQris.bind(null, slug)} className="card stack">
        <h2>Tambah QRIS</h2>
        <div className="field">
          <label htmlFor="qris">Gambar QRIS</label>
          <input id="qris" name="qris" type="file" accept="image/jpeg,image/png,image/webp" required />
          <p className="hint">Gunakan gambar QRIS statis yang jelas dan tidak terpotong.</p>
        </div>
        <button type="submit" className="btn btn-block">Unggah QRIS</button>
      </form>
    </main>
  );
}
