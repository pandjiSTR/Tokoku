'use server';
import { redirect, notFound } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { asUser } from '@/db';
import { categories } from '@/db/schema';
import { getMyStore } from '@/lib/session';
import { forStore } from '@/lib/tenant';
import { toSlug } from '@/lib/slug';
import { isUuid } from '@/lib/product-form';

const enc = encodeURIComponent;

export async function createCategory(slug: string, formData: FormData) {
  const { user, store } = await getMyStore(slug);
  const back = `/dashboard/${slug}/kategori`;
  const name = String(formData.get('name') ?? '').trim();
  if (name.length < 2 || name.length > 60) redirect(`${back}?error=${enc('Nama kategori 2-60 karakter.')}`);
  const base = toSlug(name, 40) || 'kategori';

  let ok = false;
  try {
    ok = await asUser(user.id, async (tx) => {
      for (let i = 1; i <= 20; i++) {
        const candidate = i === 1 ? base : `${base}-${i}`;
        const hit = await tx.select({ id: categories.id }).from(categories).where(forStore(categories.storeId, store.id, eq(categories.slug, candidate))).limit(1);
        if (hit.length === 0) {
          await tx.insert(categories).values({ storeId: store.id, name, slug: candidate });
          return true;
        }
      }
      return false;
    });
  } catch {
    ok = false;
  }
  if (!ok) redirect(`${back}?error=${enc('Kategori gagal disimpan.')}`);
  redirect(`${back}?ok=dibuat`);
}

export async function renameCategory(slug: string, id: string, formData: FormData) {
  const { user, store } = await getMyStore(slug);
  if (!isUuid(id)) notFound();
  const back = `/dashboard/${slug}/kategori`;
  const name = String(formData.get('name') ?? '').trim();
  if (name.length < 2 || name.length > 60) redirect(`${back}?error=${enc('Nama kategori 2-60 karakter.')}`);
  const rows = await asUser(user.id, (tx) =>
    tx.update(categories).set({ name }).where(forStore(categories.storeId, store.id, eq(categories.id, id))).returning({ id: categories.id }));
  if (rows.length === 0) notFound();
  redirect(`${back}?ok=disimpan`);
}

export async function deleteCategory(slug: string, id: string) {
  const { user, store } = await getMyStore(slug);
  if (!isUuid(id)) notFound();
  await asUser(user.id, (tx) => tx.delete(categories).where(forStore(categories.storeId, store.id, eq(categories.id, id))));
  redirect(`/dashboard/${slug}/kategori?ok=dihapus`);
}
