import Link from 'next/link';
import { Brand } from '@/components/Brand';

const points = [
  { title: 'Siap dalam 5 menit', text: 'Pilih tema, isi profil dan rekening, tambah produk. Link tokomu langsung aktif.' },
  { title: 'Mobile-first', text: 'Tampilan toko nyaman di smartphone, tempat sebagian besar pelanggan UMKM berbelanja.' },
  { title: 'Terhubung ke WhatsApp', text: 'Pembeli tanya produk dan konfirmasi pembayaran langsung lewat WhatsApp tokomu.' },
];

export default function Landing() {
  return (
    <div className="page">
      <header className="topbar">
        <div className="topbar-inner">
          <Brand />
          <span className="spacer" />
          <Link href="/login" className="btn btn-ghost btn-sm">Masuk</Link>
        </div>
      </header>
      <main className="container wide">
        <section className="hero">
          <span className="badge badge-demo" style={{ alignSelf: 'flex-start' }}>Proyek demo</span>
          <h1>Website online shop untuk UMKM, tanpa membangun dari nol.</h1>
          <p>Tokoku membantu pemilik toko punya website sendiri lengkap dengan katalog, keranjang, dan pembayaran transfer atau QRIS.</p>
          <div className="hero-actions">
            <Link href="/register" className="btn">Buat toko</Link>
            <Link href="/login" className="btn btn-secondary">Sudah punya akun</Link>
          </div>
        </section>
        <section className="grid-3" aria-label="Keunggulan">
          {points.map((p) => (
            <div className="card stack" key={p.title} style={{ gap: 6 }}>
              <h2>{p.title}</h2>
              <p className="muted">{p.text}</p>
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}
