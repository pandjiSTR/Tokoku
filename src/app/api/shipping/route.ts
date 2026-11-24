import { NextResponse } from 'next/server';
import { rateGuard } from '@/lib/rate-limit';
import { eq } from 'drizzle-orm';
import { asBuyer } from '@/db';
import { shippingDefault, shippingGroupAreas, shippingGroups, shippingRates, stores } from '@/db/schema';
import { quoteLocal } from '@/lib/local-delivery';
import { resolveShippingRate } from '@/lib/shipping';

export const dynamic = 'force-dynamic';

/**
 * Pratinjau ongkir untuk formulir checkout. Total tetap dihitung ulang di server saat pesanan dibuat.
 * Untuk kurir toko, browser hanya menerima harga dan jarak: koordinat toko tidak pernah keluar dari server.
 */
export async function GET(req: Request) {
  if (!(await rateGuard('api-shipping', 120, 60)).ok) return NextResponse.json({ error: 'terlalu banyak permintaan' }, { status: 429 });
  const u = new URL(req.url);
  const slug = u.searchParams.get('store') ?? '';
  const method = u.searchParams.get('method') ?? 'courier';
  if (!/^[a-z0-9-]{1,40}$/.test(slug)) return NextResponse.json({ error: 'parameter tidak valid' }, { status: 400 });

  if (method === 'local') {
    const lat = Number(u.searchParams.get('lat'));
    const lng = Number(u.searchParams.get('lng'));
    const q = await asBuyer(null, async (tx) => {
      const [store] = await tx.select({ id: stores.id }).from(stores).where(eq(stores.slug, slug)).limit(1);
      return store ? quoteLocal(tx, store.id, lat, lng) : ({ available: false, reason: 'disabled' } as const);
    });
    return NextResponse.json(q.available ? { available: true, price: q.price, distanceKm: q.distanceKm } : { available: false, reason: q.reason });
  }

  const city = u.searchParams.get('city') ?? '';
  if (!/^\d{2}\.\d{2}$/.test(city)) return NextResponse.json({ error: 'parameter tidak valid' }, { status: 400 });
  const rate = await asBuyer(null, async (tx) => {
    const [store] = await tx.select({ id: stores.id }).from(stores).where(eq(stores.slug, slug)).limit(1);
    if (!store) return null;
    const [rates, groups, areas, [def]] = [
      await tx.select().from(shippingRates).where(eq(shippingRates.storeId, store.id)),
      await tx.select().from(shippingGroups).where(eq(shippingGroups.storeId, store.id)),
      await tx.select().from(shippingGroupAreas).where(eq(shippingGroupAreas.storeId, store.id)),
      await tx.select().from(shippingDefault).where(eq(shippingDefault.storeId, store.id)),
    ];
    return resolveShippingRate(city, { rates, groups, areas, def: def ?? null });
  });
  return NextResponse.json(rate ? { available: true, price: rate.price, label: rate.label } : { available: false });
}
