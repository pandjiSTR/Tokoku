import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { asc, eq, sql } from 'drizzle-orm';
import { asUser } from '@/db';
import { orderItems, orders, paymentProofs } from '@/db/schema';
import { getMyStore } from '@/lib/session';
import { forStore } from '@/lib/tenant';
import { isUuid } from '@/lib/product-form';
import { formatDateTime, formatRupiah, statusLabel } from '@/lib/format';
import { signedProofUrl } from '@/lib/storage';
import { addressLine, methodLabel } from '@/lib/order-display';
import { Alert } from '@/components/Alert';
import { OrderTimeline } from '@/components/OrderTimeline';
import { acceptPayment, cancelOrder, markCompleted, markShipped, rejectPayment, startProcessing, updateShippingFee } from '../actions';

export const metadata: Metadata = { title: 'Detail pesanan' };

type Snapshot = { type: 'bank' | 'qris'; bankName: string | null; accountNumber: string | null; accountName: string | null };
const okText: Record<string, string> = {
  paid: 'Pembayaran diterima.', rejected: 'Pembayaran ditolak. Stok dikembalikan.', processing: 'Pesanan diproses.',
  shipped: 'Pesanan ditandai dikirim.', completed: 'Pesanan selesai.', cancelled: 'Pesanan dibatalkan. Stok dikembalikan.',
};

export default async function OrderDetail({ params, searchParams }: {
  params: Promise<{ slug: string; id: string }>; searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const { slug, id } = await params;
  const { ok, error } = await searchParams;
  if (!isUuid(id)) notFound();
  const { user, store } = await getMyStore(slug);

  const data = await asUser(user.id, async (tx) => {
    await tx.execute(sql`select app_expire_stale_orders(${store.id}::uuid)`);
    const [order] = await tx.select().from(orders).where(forStore(orders.storeId, store.id, eq(orders.id, id))).limit(1);
    if (!order) return null;
    return {
      order,
      items: await tx.select().from(orderItems).where(eq(orderItems.orderId, id)),
      proofs: await tx.select().from(paymentProofs).where(eq(paymentProofs.orderId, id)).orderBy(asc(paymentProofs.createdAt)),
    };
  });
  if (!data) notFound();
  const { order, items, proofs } = data;
  const pay = order.paymentSnapshot as Snapshot;
  // Bukti bayar bersifat privat: tautan 60 detik dibuat hanya setelah keanggotaan toko terbukti (getMyStore + RLS).
  const proofUrls = await Promise.all(proofs.map(async (p) => ({ ...p, url: await signedProofUrl(p.path).catch(() => null) })));

  const wa = (text: string) => `https://wa.me/${order.buyerWhatsapp}?text=${encodeURIComponent(text)}`;
  const waText: Record<string, string> = {
    pending_payment: `Halo ${order.buyerName}, pesanan ${order.orderNumber} (${formatRupiah(order.total)}) masih menunggu pembayaran.`,
    awaiting_verification: `Halo ${order.buyerName}, kami sedang memeriksa pembayaran pesanan ${order.orderNumber}.`,
    paid: `Halo ${order.buyerName}, pembayaran pesanan ${order.orderNumber} sudah kami terima. Terima kasih!`,
    processing: `Halo ${order.buyerName}, pesanan ${order.orderNumber} sedang kami proses.`,
    shipped: `Halo ${order.buyerName}, pesanan ${order.orderNumber} sudah kami kirim.`,
  };
  const negative = ['expired', 'rejected', 'cancelled'].includes(order.status);

  return (
    <main className="container">
      <Link href={`/dashboard/${slug}/pesanan`} className="muted small">&larr; Pesanan</Link>
      <div className="row"><h1>{order.orderNumber}</h1><span className="badge">{statusLabel[order.status]}</span></div>
      {ok && okText[ok] && <Alert kind="info">{okText[ok]}</Alert>}
      {error && <Alert kind="error">{error}</Alert>}
      {order.status === 'rejected' && <Alert kind="error">Ditolak: {order.rejectedReason}</Alert>}
      {!negative && <section className="card"><OrderTimeline status={order.status} /></section>}

      {order.status === 'awaiting_verification' && (
        <section className="card stack" aria-labelledby="verif">
          <h2 id="verif">Verifikasi pembayaran</h2>
          <p className="muted">Cocokkan nominal <strong>{formatRupiah(order.total)}</strong> (kode unik {order.uniqueCode}) dengan <strong>mutasi rekening Anda</strong>, bukan hanya tangkapan layar.</p>
          <form action={acceptPayment.bind(null, slug, id)}><button type="submit" className="btn btn-block">Terima pembayaran</button></form>
          <form action={rejectPayment.bind(null, slug, id)} className="stack">
            <div className="field"><label htmlFor="reason">Alasan penolakan</label><input id="reason" name="reason" required minLength={3} maxLength={300} placeholder="Mutasi tidak ditemukan" /></div>
            <button type="submit" className="btn btn-secondary btn-block">Tolak pembayaran</button>
          </form>
        </section>
      )}

      {(order.status === 'paid' || order.status === 'processing' || order.status === 'shipped') && (
        <section className="card stack">
          <h2>Langkah berikutnya</h2>
          {order.status === 'paid' && <form action={startProcessing.bind(null, slug, id)}><button type="submit" className="btn btn-block">Mulai proses pesanan</button></form>}
          {order.status === 'processing' && <form action={markShipped.bind(null, slug, id)}><button type="submit" className="btn btn-block">Tandai sudah dikirim</button></form>}
          {order.status === 'shipped' && <form action={markCompleted.bind(null, slug, id)}><button type="submit" className="btn btn-block">Tandai selesai</button></form>}
        </section>
      )}

      <section className="card stack" aria-labelledby="bukti">
        <h2 id="bukti">Bukti pembayaran ({proofUrls.length})</h2>
        {proofUrls.length === 0 && <p className="muted">Pembeli belum mengunggah bukti.</p>}
        {proofUrls.map((p) => (
          <div key={p.id} className="stack" style={{ gap: 6 }}>
            <span className="small"><strong>{p.senderName}</strong> &middot; {p.bankName} &middot; transfer {formatDateTime(p.transferredAt)}</span>
            {p.url ? (
              <a href={p.url} target="_blank" rel="noopener noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt={`Bukti transfer dari ${p.senderName}`} className="proof-img" />
              </a>
            ) : <span className="muted small">Gambar tidak dapat dimuat.</span>}
          </div>
        ))}
        <p className="hint">Tautan gambar berlaku 60 detik. Muat ulang halaman untuk melihat lagi.</p>
      </section>

      <section className="card stack">
        <h2>Pesanan</h2>
        {items.map((i) => <div key={i.id} className="row"><span>{i.name} x{i.qty}</span><span>{formatRupiah(i.price * i.qty)}</span></div>)}
        <hr className="sep" />
        <div className="row"><span className="muted">Subtotal</span><span>{formatRupiah(order.subtotal)}</span></div>
        <div className="row"><span className="muted">Ongkir</span><span>{formatRupiah(order.shippingFee)}</span></div>
        <div className="row"><span className="muted">Kode unik</span><span>{formatRupiah(order.uniqueCode)}</span></div>
        <div className="row"><strong>Total</strong><strong>{formatRupiah(order.total)}</strong></div>
        <p className="muted small">Dibayar lewat {pay.type === 'qris' ? 'QRIS' : `transfer ${pay.bankName} ${pay.accountNumber}`}. Dibuat {formatDateTime(order.createdAt)}.</p>
      </section>

      <section className="card stack">
        <h2>Pembeli</h2>
        <p>{order.buyerName}</p>
        <span className="badge" style={{ alignSelf: 'flex-start' }}>{methodLabel[order.shippingMethod]}{order.distanceKm ? ` · ${Number(order.distanceKm).toFixed(1)} km` : ''}</span>
        {order.shippingMethod === 'pickup' ? <p className="muted">Diambil sendiri oleh pembeli di toko.</p> : <p className="muted">{addressLine(order)}</p>}
        {order.buyerLat !== null && order.buyerLng !== null && (
          <a href={`https://www.google.com/maps?q=${order.buyerLat},${order.buyerLng}`} target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-block">Buka titik pengantaran di peta</a>
        )}
        {order.buyerEmail && <p className="muted small">{order.buyerEmail}</p>}
        <a href={wa(waText[order.status] ?? `Halo ${order.buyerName}, soal pesanan ${order.orderNumber}.`)} target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-block">Hubungi via WhatsApp</a>
      </section>

      {order.status === 'pending_payment' && (
        <form action={updateShippingFee.bind(null, slug, id)} className="card stack">
          <h2>Ubah ongkir</h2>
          <p className="muted small">Hanya bisa selama pesanan belum dibayar. Total pembeli ikut berubah, dan kode unik {order.uniqueCode} tetap dipakai.</p>
          <div className="field"><label htmlFor="fee">Ongkir baru (Rp)</label><input id="fee" name="fee" inputMode="numeric" defaultValue={order.shippingFee} required /></div>
          <button type="submit" className="btn btn-secondary btn-block">Simpan ongkir</button>
        </form>
      )}

      {(order.status === 'pending_payment' || order.status === 'awaiting_verification') && (
        <form action={cancelOrder.bind(null, slug, id)}><button type="submit" className="btn btn-ghost btn-block">Batalkan pesanan (stok dikembalikan)</button></form>
      )}
    </main>
  );
}
