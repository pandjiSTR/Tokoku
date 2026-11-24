import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { asc, eq, sql } from 'drizzle-orm';
import { asAnon, asBuyer } from '@/db';
import { paymentMethods, pickupSettings, regions, shippingLocalOptions } from '@/db/schema';
import { rowsOf } from '@/lib/pg';
import { getStorefront } from '@/lib/tenant';
import { loadCart } from '@/lib/cart-lines';
import { Alert } from '@/components/Alert';
import { CheckoutForm } from '@/components/CheckoutForm';
import { placeOrder } from './actions';

export const metadata: Metadata = { title: 'Checkout' };

export default async function CheckoutPage({ params, searchParams }: {
  params: Promise<{ slug: string }>; searchParams: Promise<{ error?: string }>;
}) {
  const { slug } = await params;
  const { error } = await searchParams;
  const store = await getStorefront(slug);
  const cart = await loadCart(store.id, slug);
  if (!cart.valid) redirect(`/s/${slug}/keranjang`);

  const [provinces, methods, ship] = await Promise.all([
    asAnon((tx) => tx.select({ code: regions.code, name: regions.name }).from(regions).where(eq(regions.level, 'province')).orderBy(asc(regions.name))),
    asBuyer(null, (tx) => tx.select().from(paymentMethods).where(eq(paymentMethods.storeId, store.id)).orderBy(asc(paymentMethods.createdAt))),
    asBuyer(null, async (tx) => {
      const [local] = await tx.select().from(shippingLocalOptions).where(eq(shippingLocalOptions.storeId, store.id)).limit(1);
      const hasLoc = rowsOf<{ lat: number }>(await tx.execute(sql`select lat from app_store_location(${store.id}::uuid)`)).length > 0;
      const [pickup] = await tx.select().from(pickupSettings).where(eq(pickupSettings.storeId, store.id)).limit(1);
      return { local: !!local?.enabled && hasLoc, maxRadiusKm: Number(local?.maxRadiusKm ?? 10), pickup: !!pickup?.enabled, pickupInstructions: pickup?.instructions ?? null };
    }),
  ]);
  const waHref = store.whatsapp ? `https://wa.me/${store.whatsapp}?text=${encodeURIComponent(`Halo ${store.name}, saya mau tanya pengiriman.`)}` : null;

  return (
    <main className="container">
      <h1>Checkout</h1>
      {error && <Alert kind="error">{error}</Alert>}
      {methods.length === 0 ? (
        <div className="card empty">
          <h2>Pembayaran belum tersedia</h2>
          <p className="muted">Toko ini belum mengaktifkan metode pembayaran. Silakan hubungi toko.</p>
          {waHref && <a href={waHref} target="_blank" rel="noopener noreferrer" className="btn">Hubungi via WhatsApp</a>}
        </div>
      ) : (
        <CheckoutForm
          slug={slug}
          action={placeOrder.bind(null, slug)}
          provinces={provinces}
          subtotal={cart.subtotal}
          waHref={waHref}
          shipping={{ courier: true, ...ship }}
          methods={methods.map((m) => ({
            id: m.id,
            label: m.type === 'qris' ? 'QRIS' : `Transfer ${m.bankName}`,
            detail: m.type === 'qris' ? 'Scan kode QRIS toko' : `a.n. ${m.accountName}`,
          }))}
        />
      )}
    </main>
  );
}
