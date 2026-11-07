import Link from 'next/link';
import { Brand } from '@/components/Brand';

export default function NotFound() {
  return (
    <main className="container">
      <Brand />
      <div className="stack">
        <h1>Halaman tidak ditemukan</h1>
        <p className="muted">Alamat yang kamu buka tidak ada, atau toko tersebut belum dibuat.</p>
      </div>
      <Link href="/" className="btn">Kembali ke beranda</Link>
    </main>
  );
}
