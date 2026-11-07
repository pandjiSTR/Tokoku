import Link from 'next/link';

export default function Landing() {
  return (
    <main>
      <h1>Tokoku</h1>
      <p className="muted">Buat website online shop untuk UMKM tanpa membangun dari nol.</p>
      <Link className="btn" href="/register">Buat toko</Link>
      <Link href="/login">Sudah punya akun? Masuk</Link>
    </main>
  );
}
