import type { Metadata } from 'next';
import Link from 'next/link';
import { getMyStore } from '@/lib/session';

export const metadata: Metadata = { title: 'Pengaturan' };

export default async function Pengaturan({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  await getMyStore(slug);
  const base = `/dashboard/${slug}/pengaturan`;
  const active = [
    { href: `${base}/profil`, title: 'Profil toko', text: 'Nama, deskripsi, alamat, dan kota' },
    { href: `${base}/kontak`, title: 'Kontak dan WhatsApp', text: 'Nomor WhatsApp, email, dan pesan sapaan' },
    { href: `${base}/sosial`, title: 'Media sosial', text: 'Instagram, TikTok, dan tautan lain' },
    { href: `${base}/pembayaran`, title: 'Pembayaran', text: 'Rekening bank dan QRIS' },
    { href: `${base}/pengiriman`, title: 'Pengiriman', text: 'Tarif ekspedisi per kota/kabupaten' },
  ];
  const soon = ['Anggota tim'];
  return (
    <main className="container">
      <h1>Pengaturan</h1>
      <div className="stack">
        {active.map((a) => (
          <Link key={a.href} href={a.href} className="card link-card">
            <strong>{a.title}</strong>
            <span className="muted small">{a.text}</span>
          </Link>
        ))}
        {soon.map((s) => (
          <div key={s} className="card link-card disabled" aria-disabled="true">
            <strong>{s}</strong>
            <span className="muted small">Segera hadir</span>
          </div>
        ))}
      </div>
    </main>
  );
}
