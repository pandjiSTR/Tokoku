'use server';
import { redirect, notFound } from 'next/navigation';
import { count, eq } from 'drizzle-orm';
import { asUser, type Tx } from '@/db';
import { shippingLocalOptions, shippingLocalTiers, storeLocations } from '@/db/schema';
import { getMyStore } from '@/lib/session';
import { forStore } from '@/lib/tenant';
import { isUuid } from '@/lib/product-form';
import { isValidCoord } from '@/lib/geo';
import { parseDecimal, parseRupiah } from '@/lib/validation';

const enc = encodeURIComponent;
const BACK = (slug: string) => `/dashboard/${slug}/pengaturan/kurir-toko`;
const DENIED = 'Hanya pemilik toko yang dapat mengubah pengaturan ini.';

async function run(userId: string, back: string, fn: (tx: Tx) => Promise<string | void>) {
  let err: string | void;
  try { err = await asUser(userId, fn); } catch { err = DENIED; }
  redirect(err ? `${back}?error=${enc(err)}` : `${back}?ok=1`);
}

export async function saveLocation(slug: string, fd: FormData) {
  const { user, store } = await getMyStore(slug);
  const lat = Number(fd.get('lat'));
  const lng = Number(fd.get('lng'));
  if (!isValidCoord(lat, lng)) redirect(`${BACK(slug)}?error=${enc('Titik lokasi harus berada di wilayah Indonesia.')}`);
  await run(user.id, BACK(slug), async (tx) => {
    await tx.insert(storeLocations).values({ storeId: store.id, lat, lng })
      .onConflictDoUpdate({ target: storeLocations.storeId, set: { lat, lng, updatedAt: new Date() } });
  });
}

export async function saveLocalOptions(slug: string, fd: FormData) {
  const { user, store } = await getMyStore(slug);
  const radius = parseDecimal(String(fd.get('radius') ?? ''), 0.5, 50);
  const correction = parseDecimal(String(fd.get('correction') ?? ''), 1, 3);
  if (radius === undefined) redirect(`${BACK(slug)}?error=${enc('Radius maksimal harus 0,5 sampai 50 km.')}`);
  if (correction === undefined) redirect(`${BACK(slug)}?error=${enc('Faktor koreksi harus 1 sampai 3.')}`);
  const enabled = fd.get('enabled') === 'on';
  await run(user.id, BACK(slug), async (tx) => {
    if (enabled) {
      const [loc] = await tx.select({ id: storeLocations.storeId }).from(storeLocations).where(eq(storeLocations.storeId, store.id)).limit(1);
      if (!loc) return 'Atur lokasi toko terlebih dahulu sebelum mengaktifkan kurir toko.';
      const [{ n }] = await tx.select({ n: count() }).from(shippingLocalTiers).where(eq(shippingLocalTiers.storeId, store.id));
      if (n === 0) return 'Tambahkan minimal satu tarif jarak sebelum mengaktifkan kurir toko.';
    }
    await tx.insert(shippingLocalOptions).values({ storeId: store.id, enabled, maxRadiusKm: String(radius), correction: String(correction) })
      .onConflictDoUpdate({ target: shippingLocalOptions.storeId, set: { enabled, maxRadiusKm: String(radius), correction: String(correction) } });
  });
}

export async function seedTiers(slug: string) {
  const { user, store } = await getMyStore(slug);
  await run(user.id, BACK(slug), async (tx) => {
    await tx.insert(shippingLocalTiers).values([
      { storeId: store.id, upToKm: '3', price: 8000 }, { storeId: store.id, upToKm: '6', price: 12000 }, { storeId: store.id, upToKm: '10', price: 18000 },
    ]).onConflictDoNothing();
  });
}

function tierInput(fd: FormData) {
  const km = parseDecimal(String(fd.get('upToKm') ?? ''), 0.1, 50);
  const price = parseRupiah(String(fd.get('price') ?? ''), 10_000_000);
  return km === undefined || price === undefined || price === null ? null : { km, price };
}

export async function addTier(slug: string, fd: FormData) {
  const { user, store } = await getMyStore(slug);
  const t = tierInput(fd);
  if (!t) redirect(`${BACK(slug)}?error=${enc('Isi batas jarak (km) dan tarif (Rp) dengan angka.')}`);
  await run(user.id, BACK(slug), async (tx) => {
    const dup = await tx.select({ id: shippingLocalTiers.id }).from(shippingLocalTiers).where(forStore(shippingLocalTiers.storeId, store.id, eq(shippingLocalTiers.upToKm, String(t.km)))).limit(1);
    if (dup.length) return 'Sudah ada tarif dengan batas jarak yang sama.';
    await tx.insert(shippingLocalTiers).values({ storeId: store.id, upToKm: String(t.km), price: t.price });
  });
}

export async function updateTier(slug: string, id: string, fd: FormData) {
  const { user, store } = await getMyStore(slug);
  if (!isUuid(id)) notFound();
  const t = tierInput(fd);
  if (!t) redirect(`${BACK(slug)}?error=${enc('Isi batas jarak (km) dan tarif (Rp) dengan angka.')}`);
  await run(user.id, BACK(slug), async (tx) => {
    await tx.update(shippingLocalTiers).set({ upToKm: String(t.km), price: t.price }).where(forStore(shippingLocalTiers.storeId, store.id, eq(shippingLocalTiers.id, id)));
  });
}

export async function deleteTier(slug: string, id: string) {
  const { user, store } = await getMyStore(slug);
  if (!isUuid(id)) notFound();
  await run(user.id, BACK(slug), async (tx) => {
    await tx.delete(shippingLocalTiers).where(forStore(shippingLocalTiers.storeId, store.id, eq(shippingLocalTiers.id, id)));
  });
}
