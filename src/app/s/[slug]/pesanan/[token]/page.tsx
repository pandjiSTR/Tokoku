import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { asc, eq, sql } from 'drizzle-orm';
import { asBuyer } from '@/db';
import { orderItems, orders, paymentProofs } from '@/db/schema';
import { getStorefront } from '@/lib/tenant';
import { hashToken, TOKEN_RE } from '@/lib/orders';
import { formatDateTime, formatRupiah } from '@/lib/format';
import { imageUrl } from '@/lib/image-url';
import { addressLine, methodLabel } from '@/lib/order-display';
import { Alert } from '@/components/Alert';
import { CopyButton } from '@/components/CopyButton';
import { OrderTimeline } from '@/components/OrderTimeline';
import { submitProof } from './actions';

// Tautan berisi token rahasia: jangan bocor lewat header Referer.
export const metadata: Metadata = { title: 'Status pesanan', referrer: 'no-referrer', robots: { index: false, follow: false } };

type Snapshot = { type: 'bank' | 'qris'; bankName: string | null; accountNumber: string | null; accountName: string | null; qrisPath: string | null };

export default async function OrderPage({ params, searchParams }: {
  params: Promise<{ slug: string; token: string }>; searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const { slug, token } = await params;
  const { ok, error } = await searchParams;
  if (!TOKEN_RE.test(token)) notFound();
  const store = await getStorefront(slug);
  const hash = hashToken(token);

  const data = await asBuyer(hash, async (tx) => {
    await tx.execute(sql`select app_expire_stale_orders(${store.id}::uuid)`);
    const [order] = await tx.select().from(orders).where(eq(orders.tokenHash, hash)).limit(1);
    if (!order || order.storeId !== store.id) return null;
    const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, order.id));
    const proofs = await tx.select({ id: paymentProofs.id, createdAt: paymentProofs.createdAt }).from(paymentProofs)
      .where(eq(paymentProofs.orderId, order.id)).orderBy(asc(paymentProofs.createdAt));
    return { order, items, proofs };
  });
  if (!data) notFound();
  const { order, items, proofs } = data;
  const pay = order.paymentSnapshot as Snapshot;

  const wa = (text: string) => (store.whatsapp ? `https://wa.me/${store.whatsapp}?text=${encodeURIComponent(text)}` : null);
  const confirmWa = wa(`Halo ${store.name}, saya sudah transfer untuk pesanan ${order.orderNumber} sebesar ${formatRupiah(order.total)}.`);
  const askWa = wa(`Halo ${store.name}, saya mau tanya pesanan ${order.orderNumber}.`);
  const negative = ['expired', 'rejected', 'cancelled'].includes(order.status);

  return (
    <main className="container">
      <div className="stack" style={{ gap: 4 }}>
        <span className="muted">Pesanan</span>
        <h1>{order.orderNumber}</h1>
      </div>
      {ok === 'bukti' && <Alert kind="info">Bukti pembayaran terkirim. Pemilik toko akan memeriksanya.</Alert>}
      {error && <Alert kind="error">{error}</Alert>}

      {order.status === 'expired' && <Alert kind="error">Pesanan kedaluwarsa karena belum dibayar sampai batas waktu. Stok sudah dikembalikan. Silakan buat pesanan baru.</Alert>}
      {order.status === 'cancelled' && <Alert kind="error">Pesanan ini dibatalkan.</Alert>}
      {order.status === 'rejected' && <Alert kind="error">Pembayaran belum dapat diverifikasi. Alasan: {order.rejectedReason}</Alert>}
      {!negative && <section className="card"><OrderTimeline status={order.status} /></section>}

      {order.status === 'pending_payment' && (
        <section className="card stack" aria-labelledby="bayar">
          <h2 id="bayar">Instruksi pembayaran</h2>
          <p className="muted">Bayar sebelum <strong>{formatDateTime(order.expiresAt)}</strong>. Lewat batas itu pesanan dibatalkan otomatis.</p>
          <div className="pay-total">
            <span className="muted small">Transfer tepat sebesar</span>
            <strong>{formatRupiah(order.total)}</strong>
            <span className="muted small">3 digit terakhir ({order.uniqueCode}) adalah kode unik. Jangan dibulatkan.</span>
            <CopyButton value={String(order.total)} label="Salin nominal" />
          </div>
          {pay.type === 'bank' ? (
            <div className="stack" style={{ gap: 6 }}>
              <span className="muted small">Bank {pay.bankName} a.n. {pay.accountName}</span>
              <div className="row"><strong style={{ fontSize: 20 }}>{pay.accountNumber}</strong><CopyButton value={pay.accountNumber ?? ''} /></div>
            </div>
          ) : (
            pay.qrisPath && (
              <div className="stack" style={{ alignItems: 'center' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imageUrl(pay.qrisPath)} alt="Kode QRIS toko" className="qris" />
                <span className="muted small">Scan dengan aplikasi bank atau e-wallet, lalu masukkan nominal di atas.</span>
              </div>
            )
          )}
        </section>
      )}

      {(order.status === 'pending_payment' || order.status === 'awaiting_verification') && proofs.length < 5 && (
        <section className="card stack" aria-labelledby="bukti">
          <h2 id="bukti">{order.status === 'pending_payment' ? 'Unggah bukti pembayaran' : 'Tambah bukti pembayaran'}</h2>
          {order.status === 'awaiting_verification' && <p className="muted">Bukti sudah diterima ({proofs.length}). Pemilik toko sedang memeriksa mutasi rekening.</p>}
          <form action={submitProof.bind(null, slug, token)} className="stack">
            <div className="field"><label htmlFor="senderName">Nama pengirim</label><input id="senderName" name="senderName" required maxLength={80} /></div>
            <div className="field"><label htmlFor="bankName">Bank asal</label><input id="bankName" name="bankName" required maxLength={60} placeholder="BCA, BRI, GoPay, ..." /></div>
            <div className="field"><label htmlFor="transferredAt">Waktu transfer (WIB)</label><input id="transferredAt" name="transferredAt" type="datetime-local" required /></div>
            <div className="field">
              <label htmlFor="proof">Foto bukti</label>
              <input id="proof" name="proof" type="file" accept="image/jpeg,image/png,image/webp" required />
              <p className="hint">JPG, PNG, atau WebP, maksimal 5 MB.</p>
            </div>
            <button type="submit" className="btn btn-block">Kirim bukti pembayaran</button>
          </form>
          {confirmWa && <a href={confirmWa} target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-block">Konfirmasi via WhatsApp</a>}
        </section>
      )}

      <section className="card stack" aria-labelledby="rincian">
        <h2 id="rincian">Rincian pesanan</h2>
        {items.map((i) => <div key={i.id} className="row"><span>{i.name} x{i.qty}</span><span>{formatRupiah(i.price * i.qty)}</span></div>)}
        <hr className="sep" />
        <div className="row"><span className="muted">Subtotal</span><span>{formatRupiah(order.subtotal)}</span></div>
        <div className="row"><span className="muted">Ongkir</span><span>{formatRupiah(order.shippingFee)}</span></div>
        <div className="row"><span className="muted">Kode unik</span><span>{formatRupiah(order.uniqueCode)}</span></div>
        <div className="row"><strong>Total</strong><strong>{formatRupiah(order.total)}</strong></div>
      </section>

      <section className="card stack">
        <h2>{order.shippingMethod === 'pickup' ? 'Pengambilan' : 'Pengiriman ke'}</h2>
        <p>{order.buyerName} ({order.buyerWhatsapp})</p>
        <span className="badge" style={{ alignSelf: 'flex-start' }}>{methodLabel[order.shippingMethod]}{order.distanceKm ? ` · ${Number(order.distanceKm).toFixed(1)} km` : ''}</span>
        {order.shippingMethod === 'pickup' ? (
          <p className="muted">{(order.shippingSnapshot as { instructions?: string | null }).instructions || 'Ambil pesanan di toko setelah pembayaran diverifikasi.'}{store.address ? ` Alamat toko: ${store.address}.` : ''}</p>
        ) : (
          <p className="muted">{addressLine(order)}</p>
        )}
      </section>

      <div className="stack">
        {askWa && <a href={askWa} target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-block">Tanya pesanan via WhatsApp</a>}
        <Link href={`/s/${slug}`} className="btn btn-ghost btn-block">Kembali ke toko</Link>
        <p className="muted small">Simpan tautan halaman ini. Hanya dengan tautan ini pesanan dapat dilihat.</p>
      </div>
    </main>
  );
}
