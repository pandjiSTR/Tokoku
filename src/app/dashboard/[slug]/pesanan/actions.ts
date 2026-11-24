'use server';
import { redirect, notFound } from 'next/navigation';
import { and, eq, inArray } from 'drizzle-orm';
import { asUser } from '@/db';
import { auditLogs, orders } from '@/db/schema';
import { getMyStore } from '@/lib/session';
import { isUuid } from '@/lib/product-form';
import { buyerFeeChanged, buyerStatus } from '@/lib/messages';
import { errCode } from '@/lib/pg';
import { parseRupiah } from '@/lib/validation';
import { notify } from '@/lib/notify';

type To = 'paid' | 'rejected' | 'processing' | 'shipped' | 'completed' | 'cancelled';
// Status asal yang diizinkan untuk tiap tujuan (aturan yang sama dijaga ulang oleh trigger di database).
const FROM: Record<To, ('pending_payment' | 'awaiting_verification' | 'paid' | 'processing' | 'shipped')[]> = {
  paid: ['awaiting_verification'], rejected: ['awaiting_verification'], processing: ['paid'],
  shipped: ['processing'], completed: ['shipped'], cancelled: ['pending_payment', 'awaiting_verification'],
};

async function move(slug: string, orderId: string, to: To, reason?: string) {
  const { user, store } = await getMyStore(slug);
  if (!isUuid(orderId)) notFound();
  const back = `/dashboard/${slug}/pesanan/${orderId}`;

  let updated: (typeof orders.$inferSelect)[] = [];
  let failed = false;
  try {
    updated = await asUser(user.id, async (tx) => {
      const set: Partial<typeof orders.$inferInsert> = { status: to, updatedAt: new Date() };
      if (to === 'paid') set.verifiedBy = user.id;
      if (to === 'rejected') set.rejectedReason = reason;
      const rows = await tx.update(orders).set(set)
        .where(and(eq(orders.storeId, store.id), eq(orders.id, orderId), inArray(orders.status, FROM[to]))).returning();
      if (rows.length) await tx.insert(auditLogs).values({ storeId: store.id, userId: user.id, action: `order.${to}`, meta: { orderId } });
      return rows;
    });
  } catch {
    failed = true;
  }
  if (failed) redirect(`${back}?error=${encodeURIComponent('Perubahan status ditolak. Periksa isian Anda.')}`);
  if (updated.length === 0) redirect(`${back}?error=${encodeURIComponent('Status pesanan sudah berubah. Muat ulang halaman.')}`);

  const o = updated[0];
  const m = buyerStatus(store.name, to, { orderNumber: o.orderNumber, total: o.total, buyerName: o.buyerName }, null, o.rejectedReason);
  if (m) await notify({ storeId: store.id, orderId: o.id, to: o.buyerEmail, template: `buyer_${to}`, ...m });
  redirect(`${back}?ok=${to}`);
}

export async function acceptPayment(slug: string, id: string) { await move(slug, id, 'paid'); }
export async function startProcessing(slug: string, id: string) { await move(slug, id, 'processing'); }
export async function markShipped(slug: string, id: string) { await move(slug, id, 'shipped'); }
export async function markCompleted(slug: string, id: string) { await move(slug, id, 'completed'); }
export async function cancelOrder(slug: string, id: string) { await move(slug, id, 'cancelled'); }

export async function rejectPayment(slug: string, id: string, formData: FormData) {
  const reason = String(formData.get('reason') ?? '').trim();
  if (reason.length < 3 || reason.length > 300) {
    redirect(`/dashboard/${slug}/pesanan/${id}?error=${encodeURIComponent('Alasan penolakan wajib diisi (3-300 karakter).')}`);
  }
  await move(slug, id, 'rejected', reason);
}

export async function updateShippingFee(slug: string, orderId: string, formData: FormData) {
  const { user, store } = await getMyStore(slug);
  if (!isUuid(orderId)) notFound();
  const back = `/dashboard/${slug}/pesanan/${orderId}`;
  const enc = encodeURIComponent;
  const fee = parseRupiah(String(formData.get('fee') ?? ''), 10_000_000);
  if (fee === undefined || fee === null) redirect(`${back}?error=${enc('Ongkir harus berupa angka rupiah, misalnya 15000.')}`);

  let result: { kind: 'ok'; order: typeof orders.$inferSelect; oldTotal: number } | { kind: 'state' | 'conflict' | 'denied' };
  try {
    result = await asUser(user.id, async (tx) => {
      const [o] = await tx.select().from(orders).where(and(eq(orders.storeId, store.id), eq(orders.id, orderId))).limit(1);
      if (!o || o.status !== 'pending_payment') return { kind: 'state' as const };
      const [row] = await tx.update(orders).set({ shippingFee: fee, total: o.subtotal + fee + o.uniqueCode })
        .where(and(eq(orders.storeId, store.id), eq(orders.id, orderId), eq(orders.status, 'pending_payment'))).returning();
      if (!row) return { kind: 'state' as const };
      await tx.insert(auditLogs).values({ storeId: store.id, userId: user.id, action: 'order.fee_changed', meta: { orderId, from: o.shippingFee, to: fee } });
      return { kind: 'ok' as const, order: row, oldTotal: o.total };
    });
  } catch (e) {
    result = { kind: errCode(e) === '23505' ? 'conflict' : 'denied' };
  }
  if (result.kind === 'conflict') redirect(`${back}?error=${enc('Nominal total bertabrakan dengan pesanan aktif lain. Coba ongkir yang sedikit berbeda.')}`);
  if (result.kind !== 'ok') redirect(`${back}?error=${enc('Ongkir hanya dapat diubah pada pesanan yang belum dibayar.')}`);

  const o = result.order;
  const m = buyerFeeChanged(store.name, { orderNumber: o.orderNumber, total: o.total, buyerName: o.buyerName }, result.oldTotal);
  await notify({ storeId: store.id, orderId: o.id, to: o.buyerEmail, template: 'buyer_fee_changed', ...m });
  redirect(`${back}?ok=fee`);
}
