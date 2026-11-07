import Link from 'next/link';
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { stores, storeMembers } from '@/db/schema';
import { createClient } from '@/lib/supabase/server';
import { logout } from '../login/actions';
import { createStore } from './actions';

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
    <main>
      <h1>Dashboard</h1>
      <p className="muted">{user.email}</p>
      {error && <p className="error" role="alert">{error}</p>}

      {myStores.length > 0 && (
        <section className="stack" aria-label="Toko saya">
          {myStores.map((s) => (
            <div className="card" key={s.id}>
              <strong>{s.name}</strong> <span className="muted">({s.role})</span>
              <div><Link href={`/s/${s.slug}`}>Lihat toko: /s/{s.slug}</Link></div>
            </div>
          ))}
        </section>
      )}

      <section className="card stack" aria-label="Buat toko">
        <strong>Buat toko baru</strong>
        <form action={createStore} className="stack">
          <div><label htmlFor="name">Nama toko</label><input id="name" name="name" required /></div>
          <div><label htmlFor="slug">Slug (alamat toko)</label><input id="slug" name="slug" placeholder="kopi-senja" required /></div>
          <button type="submit">Buat toko</button>
        </form>
      </section>

      <form action={logout}><button type="submit" style={{ background: 'transparent', color: 'var(--muted)' }}>Keluar</button></form>
    </main>
  );
}
