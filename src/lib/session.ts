import { cache } from 'react';
import { notFound, redirect } from 'next/navigation';
import { and, eq } from 'drizzle-orm';
import { asUser, type Tx } from '@/db';
import { stores, storeMembers } from '@/db/schema';
import { createClient } from '@/lib/supabase/server';

export const getUser = cache(async () => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  return user;
});

export async function findMyStore(tx: Tx, userId: string, slug: string) {
  const [row] = await tx
    .select({ store: stores, role: storeMembers.role })
    .from(storeMembers)
    .innerJoin(stores, eq(stores.id, storeMembers.storeId))
    .where(and(eq(storeMembers.userId, userId), eq(stores.slug, slug)))
    .limit(1);
  return row ?? null;
}

/** Toko milik pengguna yang login; 404 jika bukan anggota toko tersebut. */
export const getMyStore = cache(async (slug: string) => {
  const user = await getUser();
  const row = await asUser(user.id, (tx) => findMyStore(tx, user.id, slug));
  if (!row) notFound();
  return { user, store: row.store, role: row.role };
});
