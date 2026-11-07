import Link from 'next/link';
import { login } from './actions';

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; info?: string }> }) {
  const { error, info } = await searchParams;
  return (
    <main>
      <h1>Masuk</h1>
      {error && <p className="error" role="alert">{error}</p>}
      {info && <p className="muted" role="status">{info}</p>}
      <form action={login} className="stack">
        <div><label htmlFor="email">Email</label><input id="email" name="email" type="email" required /></div>
        <div><label htmlFor="password">Password</label><input id="password" name="password" type="password" required /></div>
        <button type="submit">Masuk</button>
      </form>
      <Link href="/register">Belum punya akun? Daftar</Link>
    </main>
  );
}
