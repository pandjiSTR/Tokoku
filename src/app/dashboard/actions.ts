'use server';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { db } from '@/db';
import { stores, storeMembers, users } from '@/db/schema';
import { createClient } from '@/lib/supabase/server';
import { isValidSlug } from '@/lib/slug';

const schema = z.object({ name: z.string().trim().min(2).max(80), slug: z.string().trim().toLowerCase() });

export async function createStore(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success || !isValidSlug(parsed.data.slug)) {
    redirect('/dashboard?error=Slug+3-30+karakter:+huruf+kecil,+angka,+tanda+hubung+(tidak+boleh+kata+yang+dicadangkan).');
  }
  const { name, slug } = parsed.data;

  try {
    await db.transaction(async (tx) => {
      await tx.insert(users).values({
        id: user.id, email: user.email!, name: String(user.user_metadata?.name ?? user.email),
      }).onConflictDoNothing();
      const [store] = await tx.insert(stores).values({ name, slug }).returning({ id: stores.id });
      await tx.insert(storeMembers).values({ storeId: store.id, userId: user.id, role: 'owner' });
    });
  } catch {
    redirect('/dashboard?error=Slug+sudah+dipakai+toko+lain.');
  }
  redirect('/dashboard');
}
