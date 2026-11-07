import type { Metadata } from 'next';
import Link from 'next/link';
import { Brand } from '@/components/Brand';
import { Alert } from '@/components/Alert';
import { register } from './actions';

export const metadata: Metadata = { title: 'Daftar' };

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <main className="container">
      <Brand />
      <div className="stack">
        <h1>Buat akun</h1>
        <p className="muted">Daftar dulu, lalu buat toko pertamamu.</p>
      </div>
      {error && <Alert kind="error">{error}</Alert>}
      <form action={register} className="card stack">
        <div className="field">
          <label htmlFor="name">Nama</label>
          <input id="name" name="name" autoComplete="name" required />
        </div>
        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" autoComplete="email" required />
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <input id="password" name="password" type="password" minLength={8} autoComplete="new-password" required />
          <p className="hint">Minimal 8 karakter.</p>
        </div>
        <button type="submit" className="btn btn-block">Daftar</button>
      </form>
      <p className="muted">Sudah punya akun? <Link href="/login">Masuk</Link></p>
    </main>
  );
}
