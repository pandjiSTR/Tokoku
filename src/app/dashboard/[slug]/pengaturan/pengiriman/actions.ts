'use server';
import { redirect, notFound } from 'next/navigation';
import { and, eq } from 'drizzle-orm';
import { asUser, type Tx } from '@/db';
import { regions, shippingDefault, shippingGroupAreas, shippingGroups, shippingRates } from '@/db/schema';
import { getMyStore } from '@/lib/session';
import { forStore } from '@/lib/tenant';
import { isUuid } from '@/lib/product-form';
import { parseRupiah } from '@/lib/validation';

const enc = encodeURIComponent;
const DENIED = 'Hanya pemilik toko yang dapat mengubah pengiriman.';

function price(fd: FormData, back: string) {
  const p = parseRupiah(String(fd.get('price') ?? ''), 10_000_000);
  if (p === undefined || p === null) redirect(`${back}?error=${enc('Tarif harus berupa angka rupiah, misalnya 18000.')}`);
  return p;
}
async function isCity(tx: Tx, code: string) {
  const [r] = await tx.select({ code: regions.code }).from(regions).where(and(eq(regions.code, code), eq(regions.level, 'city'))).limit(1);
  return !!r;
}
async function run(userId: string, back: string, fn: (tx: Tx) => Promise<string | void>) {
  let err: string | void;
  try { err = await asUser(userId, fn); } catch { err = DENIED; }
  redirect(err ? `${back}?error=${enc(err)}` : `${back}?ok=1`);
}

export async function setDefaultRate(slug: string, fd: FormData) {
  const { user, store } = await getMyStore(slug);
  const back = `/dashboard/${slug}/pengaturan/pengiriman`;
  const p = price(fd, back);
  const active = fd.get('active') === 'on';
  await run(user.id, back, async (tx) => {
    await tx.insert(shippingDefault).values({ storeId: store.id, price: p, active })
      .onConflictDoUpdate({ target: shippingDefault.storeId, set: { price: p, active } });
  });
}

export async function upsertRate(slug: string, fd: FormData) {
  const { user, store } = await getMyStore(slug);
  const back = `/dashboard/${slug}/pengaturan/pengiriman`;
  const p = price(fd, back);
  const cityCode = String(fd.get('cityCode') ?? '');
  if (!/^\d{2}\.\d{2}$/.test(cityCode)) redirect(`${back}?error=${enc('Pilih provinsi dan kota/kabupaten.')}`);
  const active = fd.has('active') ? fd.get('active') === 'on' : true;
  await run(user.id, back, async (tx) => {
    if (!(await isCity(tx, cityCode))) return 'Kota tidak valid.';
    await tx.insert(shippingRates).values({ storeId: store.id, cityCode, price: p, active })
      .onConflictDoUpdate({ target: [shippingRates.storeId, shippingRates.cityCode], set: { price: p, active } });
  });
}

export async function deleteRate(slug: string, cityCode: string) {
  const { user, store } = await getMyStore(slug);
  if (!/^\d{2}\.\d{2}$/.test(cityCode)) notFound();
  await run(user.id, `/dashboard/${slug}/pengaturan/pengiriman`, async (tx) => {
    await tx.delete(shippingRates).where(forStore(shippingRates.storeId, store.id, eq(shippingRates.cityCode, cityCode)));
  });
}

export async function createGroup(slug: string, fd: FormData) {
  const { user, store } = await getMyStore(slug);
  const back = `/dashboard/${slug}/pengaturan/pengiriman`;
  const name = String(fd.get('name') ?? '').trim();
  if (name.length < 2 || name.length > 60) redirect(`${back}?error=${enc('Nama grup 2-60 karakter.')}`);
  const p = price(fd, back);
  await run(user.id, back, async (tx) => { await tx.insert(shippingGroups).values({ storeId: store.id, name, price: p }); });
}

export async function updateGroup(slug: string, id: string, fd: FormData) {
  const { user, store } = await getMyStore(slug);
  if (!isUuid(id)) notFound();
  const back = `/dashboard/${slug}/pengaturan/pengiriman`;
  const name = String(fd.get('name') ?? '').trim();
  if (name.length < 2 || name.length > 60) redirect(`${back}?error=${enc('Nama grup 2-60 karakter.')}`);
  const p = price(fd, back);
  await run(user.id, back, async (tx) => {
    await tx.update(shippingGroups).set({ name, price: p }).where(forStore(shippingGroups.storeId, store.id, eq(shippingGroups.id, id)));
  });
}

export async function deleteGroup(slug: string, id: string) {
  const { user, store } = await getMyStore(slug);
  if (!isUuid(id)) notFound();
  await run(user.id, `/dashboard/${slug}/pengaturan/pengiriman`, async (tx) => {
    await tx.delete(shippingGroups).where(forStore(shippingGroups.storeId, store.id, eq(shippingGroups.id, id)));
  });
}

export async function addGroupArea(slug: string, groupId: string, fd: FormData) {
  const { user, store } = await getMyStore(slug);
  if (!isUuid(groupId)) notFound();
  const back = `/dashboard/${slug}/pengaturan/pengiriman`;
  const cityCode = String(fd.get('cityCode') ?? '');
  if (!/^\d{2}\.\d{2}$/.test(cityCode)) redirect(`${back}?error=${enc('Pilih provinsi dan kota/kabupaten.')}`);
  await run(user.id, back, async (tx) => {
    if (!(await isCity(tx, cityCode))) return 'Kota tidak valid.';
    const [dup] = await tx.select().from(shippingGroupAreas).where(forStore(shippingGroupAreas.storeId, store.id, eq(shippingGroupAreas.cityCode, cityCode))).limit(1);
    if (dup) return 'Kota ini sudah masuk grup tarif lain.';
    await tx.insert(shippingGroupAreas).values({ storeId: store.id, groupId, cityCode });
  });
}

export async function removeGroupArea(slug: string, cityCode: string) {
  const { user, store } = await getMyStore(slug);
  if (!/^\d{2}\.\d{2}$/.test(cityCode)) notFound();
  await run(user.id, `/dashboard/${slug}/pengaturan/pengiriman`, async (tx) => {
    await tx.delete(shippingGroupAreas).where(forStore(shippingGroupAreas.storeId, store.id, eq(shippingGroupAreas.cityCode, cityCode)));
  });
}
