import Link from 'next/link';
import { Brand } from '@/components/Brand';

export default function NotFound() {
  return (
    <main className="container">
      <Brand />
      <div className="card empty">
        <h2>Toko tidak ditemukan</h2>
        <p className="muted">Alamat toko ini tidak ada atau salah ketik. Periksa kembali tautan yang Anda terima.</p>
        <Link href="/" className="btn">Ke beranda</Link>
      </div>
    </main>
  );
}
