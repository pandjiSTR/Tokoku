'use server';
import { randomUUID } from 'node:crypto';
import { redirect, notFound } from 'next/navigation';
import { count, eq } from 'drizzle-orm';
import { asUser } from '@/db';
import { auditLogs, paymentMethods } from '@/db/schema';
import { getMyStore } from '@/lib/session';
import { forStore } from '@/lib/tenant';
import { isUuid } from '@/lib/product-form';
import { compressImage, ImageError, MAX_UPLOAD_BYTES } from '@/lib/image';
import { removeImages, uploadImage } from '@/lib/storage';
import { rateGuard, TOO_MANY } from '@/lib/rate-limit';

const enc = encodeURIComponent;
const MAX_METHODS = 5;

async function insertMethod(userId: string, storeId: string, values: Omit<typeof paymentMethods.$inferInsert, 'storeId'>) {
  return asUser(userId, async (tx) => {
    const [{ n }] = await tx.select({ n: count() }).from(paymentMethods).where(eq(paymentMethods.storeId, storeId));
    if (n >= MAX_METHODS) return 'limit' as const;
    await tx.insert(paymentMethods).values({ ...values, storeId });
    await tx.insert(auditLogs).values({ storeId, userId, action: 'payment.add', meta: { type: values.type } });
    return 'ok' as const;
  }).catch(() => 'denied' as const);
}
const msg = (r: 'ok' | 'limit' | 'denied', back: string) => {
  if (r === 'limit') redirect(`${back}?error=${enc(`Maksimal ${MAX_METHODS} metode pembayaran.`)}`);
  if (r === 'denied') redirect(`${back}?error=${enc('Hanya pemilik toko yang dapat mengubah pembayaran.')}`);
  redirect(`${back}?ok=1`);
};

export async function addBank(slug: string, formData: FormData) {
  const { user, store } = await getMyStore(slug);
  const back = `/dashboard/${slug}/pengaturan/pembayaran`;
  const bankName = String(formData.get('bankName') ?? '').trim();
  const accountNumber = String(formData.get('accountNumber') ?? '').trim();
  const accountName = String(formData.get('accountName') ?? '').trim();
  if (bankName.length < 2 || bankName.length > 40) redirect(`${back}?error=${enc('Nama bank 2-40 karakter.')}`);
  if (!/^[0-9 -]{4,30}$/.test(accountNumber)) redirect(`${back}?error=${enc('Nomor rekening hanya berisi angka (4-30 digit).')}`);
  if (accountName.length < 2 || accountName.length > 80) redirect(`${back}?error=${enc('Nama pemilik rekening 2-80 karakter.')}`);
  msg(await insertMethod(user.id, store.id, { type: 'bank', bankName, accountNumber, accountName }), back);
}

export async function addQris(slug: string, formData: FormData) {
  const { user, store } = await getMyStore(slug);
  const back = `/dashboard/${slug}/pengaturan/pembayaran`;
  if (!(await rateGuard('upload', 30, 600, user.id)).ok) redirect(`${back}?error=${enc(TOO_MANY)}`);
  const file = formData.get('qris');
  if (!(file instanceof File) || file.size === 0) redirect(`${back}?error=${enc('Pilih gambar QRIS.')}`);
  if (file.size > MAX_UPLOAD_BYTES) redirect(`${back}?error=${enc('Ukuran gambar maksimal 5 MB.')}`);

  let result: 'ok' | 'limit' | 'denied' | null = null;
  let error: string | null = null;
  const path = `${store.id}/qris/${randomUUID()}.webp`;
  try {
    const { data } = await compressImage(Buffer.from(await file.arrayBuffer()), 1600);
    await uploadImage(path, data);
    result = await insertMethod(user.id, store.id, { type: 'qris', qrisPath: path });
    if (result !== 'ok') await removeImages([path]);
  } catch (e) {
    error = e instanceof ImageError ? e.message : 'Unggah gagal. Coba lagi.';
    await removeImages([path]);
  }
  if (error) redirect(`${back}?error=${enc(error)}`);
  msg(result ?? 'denied', back);
}

export async function toggleMethod(slug: string, id: string, active: boolean) {
  const { user, store } = await getMyStore(slug);
  if (!isUuid(id)) notFound();
  await asUser(user.id, (tx) => tx.update(paymentMethods).set({ active }).where(forStore(paymentMethods.storeId, store.id, eq(paymentMethods.id, id))));
  redirect(`/dashboard/${slug}/pengaturan/pembayaran?ok=1`);
}

// Gambar QRIS tidak dihapus dari penyimpanan: pesanan yang belum dibayar masih menampilkannya (snapshot).
export async function deleteMethod(slug: string, id: string) {
  const { user, store } = await getMyStore(slug);
  if (!isUuid(id)) notFound();
  await asUser(user.id, (tx) => tx.delete(paymentMethods).where(forStore(paymentMethods.storeId, store.id, eq(paymentMethods.id, id))));
  redirect(`/dashboard/${slug}/pengaturan/pembayaran?ok=1`);
}
