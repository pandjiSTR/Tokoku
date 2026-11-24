'use server';
import { randomUUID } from 'node:crypto';
import { notFound, redirect } from 'next/navigation';
import { count, eq, sql } from 'drizzle-orm';
import { asBuyer } from '@/db';
import { orders, paymentProofs } from '@/db/schema';
import { compressImage, ImageError, MAX_UPLOAD_BYTES } from '@/lib/image';
import { hashToken, TOKEN_RE } from '@/lib/orders';
import { ownerProofUploaded } from '@/lib/messages';
import { appUrl, notify } from '@/lib/notify';
import { getStorefront } from '@/lib/tenant';
import { rateGuard, TOO_MANY } from '@/lib/rate-limit';
import { removeProofs, uploadProof } from '@/lib/storage';

const enc = encodeURIComponent;
const MAX_PROOFS = 5;

export async function submitProof(slug: string, token: string, formData: FormData) {
  const store = await getStorefront(slug);
  if (!TOKEN_RE.test(token)) notFound();
  const hash = hashToken(token);
  const back = `/s/${slug}/pesanan/${token}`;
  if (!(await rateGuard('proof', 10, 600)).ok || !(await rateGuard('proof-store', 60, 600, store.id)).ok) redirect(`${back}?error=${enc(TOO_MANY)}`);

  const senderName = String(formData.get('senderName') ?? '').trim();
  const bankName = String(formData.get('bankName') ?? '').trim();
  const whenRaw = String(formData.get('transferredAt') ?? '');
  const file = formData.get('proof');
  if (senderName.length < 2 || senderName.length > 80 || bankName.length < 2 || bankName.length > 60) {
    redirect(`${back}?error=${enc('Isi nama pengirim dan bank asal dengan benar.')}`);
  }
  // Input datetime-local tidak membawa zona waktu: dianggap WIB.
  const transferredAt = new Date(`${whenRaw}:00+07:00`);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(whenRaw) || Number.isNaN(transferredAt.getTime()) || transferredAt.getTime() > Date.now() + 3600_000) {
    redirect(`${back}?error=${enc('Waktu transfer tidak valid.')}`);
  }
  if (!(file instanceof File) || file.size === 0) redirect(`${back}?error=${enc('Pilih foto bukti pembayaran.')}`);
  if (file.size > MAX_UPLOAD_BYTES) redirect(`${back}?error=${enc('Ukuran foto maksimal 5 MB.')}`);

  const order = await asBuyer(hash, async (tx) => {
    await tx.execute(sql`select app_expire_stale_orders(${store.id}::uuid)`);
    const [o] = await tx.select().from(orders).where(eq(orders.tokenHash, hash)).limit(1);
    if (!o || o.storeId !== store.id) return null;
    const [{ n }] = await tx.select({ n: count() }).from(paymentProofs).where(eq(paymentProofs.orderId, o.id));
    return { o, proofs: n };
  });
  if (!order) notFound();
  const { o } = order;
  if (o.status !== 'pending_payment' && o.status !== 'awaiting_verification') {
    redirect(`${back}?error=${enc('Pesanan ini tidak lagi menerima bukti pembayaran.')}`);
  }
  if (order.proofs >= MAX_PROOFS) redirect(`${back}?error=${enc('Jumlah bukti pembayaran sudah mencapai batas.')}`);

  let error: string | null = null;
  try {
    const { data } = await compressImage(Buffer.from(await file.arrayBuffer()), 1600);
    const path = `${store.id}/${o.id}/${randomUUID()}.webp`;
    await uploadProof(path, data);
    try {
      await asBuyer(hash, async (tx) => {
        await tx.insert(paymentProofs).values({ storeId: store.id, orderId: o.id, senderName, bankName, transferredAt, path });
        if (o.status === 'pending_payment') await tx.update(orders).set({ status: 'awaiting_verification' }).where(eq(orders.id, o.id));
      });
    } catch (e) {
      await removeProofs([path]);
      throw e;
    }
  } catch (e) {
    error = e instanceof ImageError ? e.message : 'Unggah gagal. Coba lagi.';
    if (!(e instanceof ImageError)) console.error('submitProof', e);
  }
  if (error) redirect(`${back}?error=${enc(error)}`);

  const base = appUrl();
  const m = ownerProofUploaded(store.name, { orderNumber: o.orderNumber, total: o.total, buyerName: o.buyerName }, base ? `${base}/dashboard/${slug}/pesanan/${o.id}` : null);
  await notify({ storeId: store.id, orderId: o.id, to: store.email, template: 'owner_proof_uploaded', ...m });
  redirect(`${back}?ok=bukti`);
}
