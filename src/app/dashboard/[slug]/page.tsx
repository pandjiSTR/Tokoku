import type { Metadata } from 'next';
import Link from 'next/link';
import { and, asc, count, eq, gte, inArray, sql } from 'drizzle-orm';
import { asUser } from '@/db';
import { orders } from '@/db/schema';
import { loadSetupProgress } from '@/lib/setup-progress';
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
      steps: await loadSetupProgress(tx, store, slug),
      newToday: await n(tx.select({ n: count() }).from(orders).where(and(eq(orders.storeId, sid), gte(orders.createdAt, today)))),
      toVerify: await n(tx.select({ n: count() }).from(orders).where(and(eq(orders.storeId, sid), eq(orders.status, 'awaiting_verification')))),
      salesToday: (await tx.select({ s: sql<number>`coalesce(sum(${orders.total} - ${orders.uniqueCode}), 0)::int` }).from(orders)
        .where(and(eq(orders.storeId, sid), inArray(orders.status, ['paid', 'processing', 'shipped', 'completed']), gte(orders.verifiedAt, today))))[0].s,
      queue: await tx.select({ id: orders.id, number: orders.orderNumber, name: orders.buyerName, total: orders.total }).from(orders)
        .where(and(eq(orders.storeId, sid), eq(orders.status, 'awaiting_verification'))).orderBy(asc(orders.updatedAt)).limit(3),
    };
  });

  const items = d.steps;
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
            <li key={i.key}>
              <span className={`check ${i.done ? 'done' : ''}`} aria-hidden="true">{i.done ? '✓' : ''}</span>
              <span className="grow">{i.title}<span className="sr-only">{i.done ? ' (selesai)' : ' (belum)'}</span></span>
              {!i.done && <Link href={i.href} className="btn btn-secondary btn-sm">Lengkapi</Link>}
            </li>
          ))}
        </ul>
      </section>

      <Link href={`/dashboard/${slug}/mulai`} className="btn btn-secondary btn-block">Buka panduan setup</Link>
      <p className="muted small">Link toko: <Link href={`/s/${slug}`}>/s/{slug}</Link></p>
    </main>
  );
}
