'use server';
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { asUser } from '@/db';
import { auditLogs, stores } from '@/db/schema';
import { getMyStore } from '@/lib/session';
import { normalizeWhatsapp } from '@/lib/validation';

const schema = z.object({
  whatsapp: z.string().trim().max(30).default(''),
  email: z.string().trim().max(120).default(''),
  waGreeting: z.string().trim().max(200).default(''),
});

export async function updateContact(slug: string, formData: FormData) {
  const { user, store } = await getMyStore(slug);
  const back = `/dashboard/${slug}/pengaturan/kontak`;
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect(`${back}?error=Periksa+kembali+isian+Anda.`);
  const v = parsed.data;

  const wa = v.whatsapp ? normalizeWhatsapp(v.whatsapp) : null;
  if (v.whatsapp && !wa) redirect(`${back}?error=Nomor+WhatsApp+tidak+valid.+Contoh:+081234567890.`);
  if (v.email && !z.string().email().safeParse(v.email).success) redirect(`${back}?error=Format+email+tidak+valid.`);

  const updated = await asUser(user.id, async (tx) => {
    const rows = await tx.update(stores).set({
      whatsapp: wa, email: v.email || null, waGreeting: v.waGreeting || null, updatedAt: new Date(),
    }).where(eq(stores.id, store.id)).returning({ id: stores.id });
    if (rows.length === 0) return false;
    await tx.insert(auditLogs).values({ storeId: store.id, userId: user.id, action: 'store.update_contact', meta: {} });
    return true;
  });
  if (!updated) redirect(`${back}?error=Hanya+pemilik+toko+yang+dapat+mengubah+kontak.`);
  redirect(`${back}?ok=1`);
}
