'use server';
import { redirect } from 'next/navigation';
import { and, eq } from 'drizzle-orm';
import { asUser } from '@/db';
import { auditLogs, socialLinks } from '@/db/schema';
import { getMyStore } from '@/lib/session';
import { normalizeSocial, SOCIAL_PLATFORMS, SOCIAL_LABEL } from '@/lib/validation';

export async function updateSocials(slug: string, formData: FormData) {
  const { user, store } = await getMyStore(slug);
  const back = `/dashboard/${slug}/pengaturan/sosial`;

  const entries = SOCIAL_PLATFORMS.map((p) => ({ platform: p, url: normalizeSocial(p, String(formData.get(p) ?? '')) }));
  const bad = entries.find((e) => e.url === undefined);
  if (bad) redirect(`${back}?error=${encodeURIComponent(`Tautan ${SOCIAL_LABEL[bad.platform]} tidak valid.`)}`);

  const saved = await asUser(user.id, async (tx) => {
    for (const e of entries) {
      if (e.url === null) {
        await tx.delete(socialLinks).where(and(eq(socialLinks.storeId, store.id), eq(socialLinks.platform, e.platform)));
      } else if (typeof e.url === 'string') {
        await tx.insert(socialLinks).values({ storeId: store.id, platform: e.platform, url: e.url })
          .onConflictDoUpdate({ target: [socialLinks.storeId, socialLinks.platform], set: { url: e.url, updatedAt: new Date() } });
      }
    }
    await tx.insert(auditLogs).values({ storeId: store.id, userId: user.id, action: 'store.update_socials', meta: {} });
    return true;
  }).catch(() => false);

  if (!saved) redirect(`${back}?error=Hanya+pemilik+toko+yang+dapat+mengubah+media+sosial.`);
  redirect(`${back}?ok=1`);
}
