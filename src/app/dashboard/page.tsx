import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { stores, storeMembers } from '@/db/schema';
import { createClient } from '@/lib/supabase/server';
import { Brand } from '@/components/Brand';
import { Alert } from '@/components/Alert';
import { logout } from '../login/actions';
import { createStore } from './actions';

export const metadata: Metadata = { title: 'Dashboard' };

const roleLabel = { owner: 'Pemilik', staff: 'Staf' } as const;

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const myStores = await db
    .select({ id: stores.id, name: stores.name, slug: stores.slug, role: storeMembers.role })
    .from(storeMembers)
    .innerJoin(stores, eq(stores.id, storeMembers.storeId))
    .where(eq(storeMembers.userId, user.id));

  return (
    <div className="page">
      <header className="topbar">
        <div className="topbar-inner">
          <Brand href="/dashboard" />
          <span className="spacer" />
          <span className="muted small" style={{ overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 160 }}>{user.email}</span>
          <form action={logout}><button type="submit" className="btn btn-ghost btn-sm">Keluar</button></form>
        </div>
      </header>

      <main className="container">
        <h1>Dashboard</h1>
        {error && <Alert kind="error">{error}</Alert>}

        {myStores.length === 0 ? (
          <section className="card empty" aria-label="Belum ada toko">
            <span className="empty-icon" aria-hidden="true">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l1-5h16l1 5M3 9v11h18V9M3 9h18M9 20v-6h6v6" /></svg>
            </span>
            <h2>Belum ada toko</h2>
            <p className="muted">Buat toko pertamamu di bawah ini. Kamu bisa mengisi detailnya nanti.</p>
          </section>
        ) : (
          <section className="stack" aria-label="Toko saya">
            <h2>Toko saya</h2>
            {myStores.map((s) => (
              <div className="card row" key={s.id}>
                <div className="stack" style={{ gap: 4, minWidth: 0 }}>
                  <strong>{s.name}</strong>
                  <span className="muted small">/s/{s.slug}</span>
                  <span className="badge" style={{ alignSelf: 'flex-start' }}>{roleLabel[s.role]}</span>
                </div>
                <Link href={`/s/${s.slug}`} className="btn btn-secondary btn-sm">Lihat toko</Link>
              </div>
            ))}
          </section>
        )}

        <section className="card stack" aria-labelledby="buat-toko">
          <h2 id="buat-toko">{myStores.length === 0 ? 'Buat toko pertama' : 'Buat toko baru'}</h2>
          <form action={createStore} className="stack">
            <div className="field">
              <label htmlFor="name">Nama toko</label>
              <input id="name" name="name" autoComplete="off" required />
            </div>
            <div className="field">
              <label htmlFor="slug">Alamat toko (slug)</label>
              <input id="slug" name="slug" placeholder="kopi-senja" pattern="[a-z0-9][a-z0-9\-]{1,28}[a-z0-9]" autoCapitalize="none" autoComplete="off" required />
              <p className="hint">3-30 karakter: huruf kecil, angka, dan tanda hubung.</p>
            </div>
            <button type="submit" className="btn btn-block">Buat toko</button>
          </form>
        </section>
      </main>
    </div>
  );
}
