import type { Metadata } from 'next';
import Link from 'next/link';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { asUser } from '@/db';
import { orders } from '@/db/schema';
import { getMyStore } from '@/lib/session';
import { formatDateTime, formatRupiah, statusLabel } from '@/lib/format';

export const metadata: Metadata = { title: 'Pesanan' };

const FILTERS = {
  perlu: { label: 'Perlu verifikasi', statuses: ['awaiting_verification'] },
  bayar: { label: 'Menunggu bayar', statuses: ['pending_payment'] },
  proses: { label: 'Diproses', statuses: ['paid', 'processing', 'shipped'] },
  selesai: { label: 'Selesai', statuses: ['completed'] },
  lain: { label: 'Batal/tolak', statuses: ['expired', 'rejected', 'cancelled'] },
  semua: { label: 'Semua', statuses: null },
} as const;
type FilterKey = keyof typeof FILTERS;


export default async function PesananPage({ params, searchParams }: {
  params: Promise<{ slug: string }>; searchParams: Promise<{ s?: string }>;
}) {
  const { slug } = await params;
  const { s } = await searchParams;
  const { user, store } = await getMyStore(slug);
  const key: FilterKey = s && s in FILTERS ? (s as FilterKey) : 'perlu';
  const statuses = FILTERS[key].statuses;

  const rows = await asUser(user.id, async (tx) => {
    await tx.execute(sql`select app_expire_stale_orders(${store.id}::uuid)`);
    return tx.select().from(orders)
      .where(and(eq(orders.storeId, store.id), statuses ? inArray(orders.status, [...statuses]) : undefined))
      .orderBy(desc(orders.createdAt)).limit(100);
  });

  return (
    <main className="container">
      <h1>Pesanan</h1>
      <ul className="chips scroll-x" aria-label="Filter pesanan">
        {(Object.keys(FILTERS) as FilterKey[]).map((k) => (
          <li key={k}>
            <Link href={`/dashboard/${slug}/pesanan?s=${k}`} aria-current={k === key ? 'true' : undefined} className={`btn btn-sm ${k === key ? '' : 'btn-secondary'}`}>{FILTERS[k].label}</Link>
          </li>
        ))}
      </ul>

      {rows.length === 0 ? (
        <section className="card empty"><h2>Tidak ada pesanan</h2><p className="muted">Pesanan dengan status &ldquo;{FILTERS[key].label}&rdquo; akan muncul di sini.</p></section>
      ) : (
        <section className="stack" aria-label="Daftar pesanan">
          {rows.map((o) => (
            <Link key={o.id} href={`/dashboard/${slug}/pesanan/${o.id}`} className="card stack link-card" style={{ gap: 6 }}>
              <div className="row"><strong>{o.orderNumber}</strong><span className={`badge ${o.status === 'awaiting_verification' ? 'badge-demo' : ['expired', 'rejected', 'cancelled'].includes(o.status) ? 'badge-muted' : ''}`}>{statusLabel[o.status]}</span></div>
              <span className="muted small">{o.buyerName} &middot; {formatDateTime(o.createdAt)}</span>
              <strong>{formatRupiah(o.total)}</strong>
            </Link>
          ))}
        </section>
      )}
    </main>
  );
}
