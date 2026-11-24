'use server';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { db, asUser } from '@/db';
import { auditLogs, stores, storeMembers, storeSettings, users } from '@/db/schema';
import { getUser } from '@/lib/session';
import { isValidSlug } from '@/lib/slug';

const schema = z.object({ name: z.string().trim().min(2).max(80), slug: z.string().trim().toLowerCase() });

export async function createStore(formData: FormData) {
  const user = await getUser();
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success || !isValidSlug(parsed.data.slug)) {
    redirect('/dashboard?error=Slug+3-30+karakter:+huruf+kecil,+angka,+tanda+hubung+(tidak+boleh+kata+yang+dicadangkan).');
  }
  const { name, slug } = parsed.data;

  // Tugas sistem (idempoten): pastikan baris profil pengguna ada.
  await db.insert(users).values({
    id: user.id, email: user.email!, name: String(user.user_metadata?.name ?? user.email),
  }).onConflictDoNothing();

  let ok = true;
  try {
    await asUser(user.id, async (tx) => {
      const [store] = await tx.insert(stores).values({ name, slug }).returning({ id: stores.id });
      await tx.insert(storeMembers).values({ storeId: store.id, userId: user.id, role: 'owner' });
      await tx.insert(storeSettings).values({ storeId: store.id });
      await tx.insert(auditLogs).values({ storeId: store.id, userId: user.id, action: 'store.create', meta: { slug } });
    });
  } catch {
    ok = false;
  }
  if (!ok) redirect('/dashboard?error=Slug+sudah+dipakai+toko+lain.');
  redirect(`/dashboard/${slug}/mulai`);
}
