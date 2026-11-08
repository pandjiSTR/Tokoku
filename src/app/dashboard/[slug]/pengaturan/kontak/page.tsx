import type { Metadata } from 'next';
import Link from 'next/link';
import { getMyStore } from '@/lib/session';
import { Alert } from '@/components/Alert';
import { updateContact } from './actions';

export const metadata: Metadata = { title: 'Kontak dan WhatsApp' };

export default async function KontakPage({ params, searchParams }: {
  params: Promise<{ slug: string }>; searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const { slug } = await params;
  const { ok, error } = await searchParams;
  const { store } = await getMyStore(slug);
  return (
    <main className="container">
      <Link href={`/dashboard/${slug}/pengaturan`} className="muted small">&larr; Pengaturan</Link>
      <h1>Kontak dan WhatsApp</h1>
      {ok && <Alert kind="info">Perubahan tersimpan.</Alert>}
      {error && <Alert kind="error">{error}</Alert>}
      <form action={updateContact.bind(null, slug)} className="card stack">
        <div className="field">
          <label htmlFor="whatsapp">Nomor WhatsApp</label>
          <input id="whatsapp" name="whatsapp" inputMode="tel" placeholder="081234567890" defaultValue={store.whatsapp ?? ''} />
          <p className="hint">Boleh diawali 0 atau 62. Disimpan dalam format internasional (62...).</p>
        </div>
        <div className="field">
          <label htmlFor="email">Email toko</label>
          <input id="email" name="email" type="email" defaultValue={store.email ?? ''} />
        </div>
        <div className="field">
          <label htmlFor="waGreeting">Pesan sapaan WhatsApp</label>
          <input id="waGreeting" name="waGreeting" maxLength={200} placeholder="Halo, saya mau tanya produk..." defaultValue={store.waGreeting ?? ''} />
          <p className="hint">Teks awal yang terisi saat pembeli menekan tombol WhatsApp.</p>
        </div>
        <button type="submit" className="btn btn-block">Simpan</button>
      </form>
    </main>
  );
}
