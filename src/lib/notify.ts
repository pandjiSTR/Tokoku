import 'server-only';
import { db } from '@/db';
import { notificationsLog } from '@/db/schema';
import { mailConfigured, sendMail } from '@/lib/mail';

export const appUrl = () => (process.env.APP_URL ?? '').replace(/\/$/, '') || null;

/** Mengirim email dan mencatat hasilnya. TIDAK PERNAH melempar error: gagal kirim tidak boleh menggagalkan pesanan. */
export async function notify(p: { storeId: string; orderId: string; to: string | null | undefined; template: string; subject: string; text: string }) {
  if (!p.to) return;
  let status = 'sent';
  let error: string | null = null;
  try {
    if (!mailConfigured()) status = 'skipped';
    else await sendMail({ to: p.to, subject: p.subject, text: p.text });
  } catch (e) {
    status = 'failed';
    error = e instanceof Error ? e.message.slice(0, 300) : 'error';
  }
  try {
    await db.insert(notificationsLog).values({ storeId: p.storeId, orderId: p.orderId, recipient: p.to, template: p.template, status, error });
  } catch {
    /* pencatatan gagal: abaikan */
  }
}
