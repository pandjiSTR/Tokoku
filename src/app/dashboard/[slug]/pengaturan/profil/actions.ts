'use server';
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { asUser } from '@/db';
import { auditLogs, regions, stores } from '@/db/schema';
import { getMyStore } from '@/lib/session';

const schema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(500).default(''),
  address: z.string().trim().max(250).default(''),
  provinceCode: z.string().regex(/^\d{2}$/).or(z.literal('')).default(''),
  cityCode: z.string().regex(/^\d{2}\.\d{2}$/).or(z.literal('')).default(''),
});

export async function updateProfile(slug: string, formData: FormData) {
  const { user, store } = await getMyStore(slug);
  const back = `/dashboard/${slug}/pengaturan/profil`;
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect(`${back}?error=Periksa+kembali+isian+Anda.`);
  const v = parsed.data;

  const result = await asUser(user.id, async (tx) => {
    if (v.cityCode) {
      const [city] = await tx.select().from(regions).where(eq(regions.code, v.cityCode)).limit(1);
      if (!city || city.parentCode !== v.provinceCode) return 'wilayah' as const;
    }
    const updated = await tx.update(stores).set({
      name: v.name,
      description: v.description || null,
      address: v.address || null,
      provinceCode: v.provinceCode || null,
      cityCode: v.cityCode || null,
      updatedAt: new Date(),
    }).where(eq(stores.id, store.id)).returning({ id: stores.id });
    if (updated.length === 0) return 'izin' as const;
    await tx.insert(auditLogs).values({ storeId: store.id, userId: user.id, action: 'store.update_profile', meta: { name: v.name } });
    return 'ok' as const;
  });

  if (result === 'wilayah') redirect(`${back}?error=Kota+tidak+sesuai+provinsi.`);
  if (result === 'izin') redirect(`${back}?error=Hanya+pemilik+toko+yang+dapat+mengubah+profil.`);
  redirect(`${back}?ok=1`);
}
