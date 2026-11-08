import type { Metadata } from 'next';
import Link from 'next/link';
import { and, asc, count, eq, gte, inArray, sql } from 'drizzle-orm';
import { asUser } from '@/db';
import { orders, paymentMethods, products, shippingDefault, shippingRates, socialLinks } from '@/db/schema';
import { getMyStore } from '@/lib/session';
import { formatRupiah, startOfTodayWib } from '@/lib/format';

export const metadata: Metadata = { title: 'Ringkasan' };

export default async function Ringkasan({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { user, store } = await getMyStore(slug);
  const today = startOfTodayWib();

  const d = await asUser(user.id, async (tx) => {
    await tx.execute(sql`select app_expire_stale_orders(${store.id}::uuid)`);
    const sid = store.id;
    const n = async (q: Promise<{ n: number }[]>) => (await q)[0].n;
    return {
      socials: await n(tx.select({ n: count() }).from(socialLinks).where(eq(socialLinks.storeId, sid))),
      activeProducts: await n(tx.select({ n: count() }).from(products).where(and(eq(products.storeId, sid), eq(products.status, 'active')))),
      methods: await n(tx.select({ n: count() }).from(paymentMethods).where(and(eq(paymentMethods.storeId, sid), eq(paymentMethods.active, true)))),
      rates: (await n(tx.select({ n: count() }).from(shippingRates).where(eq(shippingRates.storeId, sid)))) + (await n(tx.select({ n: count() }).from(shippingDefault).where(eq(shippingDefault.storeId, sid)))),
      newToday: await n(tx.select({ n: count() }).from(orders).where(and(eq(orders.storeId, sid), gte(orders.createdAt, today)))),
      toVerify: await n(tx.select({ n: count() }).from(orders).where(and(eq(orders.storeId, sid), eq(orders.status, 'awaiting_verification')))),
      salesToday: (await tx.select({ s: sql<number>`coalesce(sum(${orders.total} - ${orders.uniqueCode}), 0)::int` }).from(orders)
        .where(and(eq(orders.storeId, sid), inArray(orders.status, ['paid', 'processing', 'shipped', 'completed']), gte(orders.verifiedAt, today))))[0].s,
      queue: await tx.select({ id: orders.id, number: orders.orderNumber, name: orders.buyerName, total: orders.total }).from(orders)
        .where(and(eq(orders.storeId, sid), eq(orders.status, 'awaiting_verification'))).orderBy(asc(orders.updatedAt)).limit(3),
    };
  });

  const base = `/dashboard/${slug}/pengaturan`;
  const items = [
    { label: 'Profil toko (deskripsi, alamat, kota)', done: !!(store.description && store.address && store.cityCode), href: `${base}/profil` },
    { label: 'Kontak dan WhatsApp', done: !!store.whatsapp, href: `${base}/kontak` },
    { label: 'Media sosial', done: d.socials > 0, href: `${base}/sosial` },
    { label: 'Metode pembayaran', done: d.methods > 0, href: `${base}/pembayaran` },
    { label: 'Tarif pengiriman', done: d.rates > 0, href: `${base}/pengiriman` },
    { label: 'Produk aktif pertama', done: d.activeProducts > 0, href: `/dashboard/${slug}/produk` },
  ];
  const doneCount = items.filter((i) => i.done).length;

  return (
    <main className="container">
      <div className="stack" style={{ gap: 4 }}>
        <span className="muted">Halo, pemilik toko</span>
        <h1>Ringkasan</h1>
      </div>

      <section className="grid-2" aria-label="Statistik">
        <div className="card"><div className="muted small">Pesanan baru hari ini</div><div className="stat">{d.newToday}</div></div>
        <div className={`card ${d.toVerify > 0 ? 'highlight' : ''}`}><div className="muted small">Perlu verifikasi</div><div className="stat">{d.toVerify}</div></div>
        <div className="card" style={{ gridColumn: 'span 2' }}>
          <div className="muted small">Penjualan hari ini (belum termasuk kode unik)</div><div className="stat">{formatRupiah(d.salesToday)}</div>
        </div>
      </section>

      {d.queue.length > 0 && (
        <section className="stack" aria-labelledby="antrean">
          <h2 id="antrean">Antrean verifikasi</h2>
          {d.queue.map((q) => (
            <div key={q.id} className="card row">
              <div className="stack" style={{ gap: 2 }}><strong>{q.number}</strong><span className="muted small">{q.name} &middot; {formatRupiah(q.total)}</span></div>
              <Link href={`/dashboard/${slug}/pesanan/${q.id}`} className="btn btn-sm">Periksa</Link>
            </div>
          ))}
        </section>
      )}

      <section className="card stack" aria-labelledby="checklist">
        <div className="row"><h2 id="checklist">Kelengkapan toko</h2><span className="badge">{doneCount}/{items.length}</span></div>
        <ul className="checklist">
          {items.map((i) => (
            <li key={i.label}>
              <span className={`check ${i.done ? 'done' : ''}`} aria-hidden="true">{i.done ? '✓' : ''}</span>
              <span className="grow">{i.label}<span className="sr-only">{i.done ? ' (selesai)' : ' (belum)'}</span></span>
              {!i.done && <Link href={i.href} className="btn btn-secondary btn-sm">Lengkapi</Link>}
            </li>
          ))}
        </ul>
      </section>

      <p className="muted small">Link toko: <Link href={`/s/${slug}`}>/s/{slug}</Link></p>
    </main>
  );
}
