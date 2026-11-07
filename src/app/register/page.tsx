import Link from 'next/link';
import { register } from './actions';

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <main>
      <h1>Daftar</h1>
      {error && <p className="error" role="alert">{error}</p>}
      <form action={register} className="stack">
        <div><label htmlFor="name">Nama</label><input id="name" name="name" required /></div>
        <div><label htmlFor="email">Email</label><input id="email" name="email" type="email" required /></div>
        <div><label htmlFor="password">Password</label><input id="password" name="password" type="password" minLength={8} required /></div>
        <button type="submit">Daftar</button>
      </form>
      <Link href="/login">Sudah punya akun? Masuk</Link>
    </main>
  );
}
