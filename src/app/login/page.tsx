import type { Metadata } from 'next';
import Link from 'next/link';
import { Brand } from '@/components/Brand';
import { Alert } from '@/components/Alert';
import { login } from './actions';

export const metadata: Metadata = { title: 'Masuk' };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; info?: string }> }) {
  const { error, info } = await searchParams;
  return (
    <main className="container">
      <Brand />
      <div className="stack">
        <h1>Masuk</h1>
        <p className="muted">Kelola toko dan pesananmu dari dashboard.</p>
      </div>
      {error && <Alert kind="error">{error}</Alert>}
      {info && <Alert kind="info">{info}</Alert>}
      <form action={login} className="card stack">
        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" autoComplete="email" required />
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <input id="password" name="password" type="password" autoComplete="current-password" required />
        </div>
        <button type="submit" className="btn btn-block">Masuk</button>
      </form>
      <p className="muted">Belum punya akun? <Link href="/register">Daftar</Link></p>
    </main>
  );
}
