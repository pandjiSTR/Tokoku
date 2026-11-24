import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="container">
      <div className="card empty">
        <h2>Halaman tidak ditemukan</h2>
        <p className="muted">Produk atau halaman ini tidak tersedia, atau sudah tidak dijual.</p>
        <Link href="." className="btn">Kembali ke toko</Link>
      </div>
    </main>
  );
}
