'use server';
import { randomUUID } from 'node:crypto';
import { redirect, notFound } from 'next/navigation';
import { asc, count, eq } from 'drizzle-orm';
import { asUser } from '@/db';
import { banners } from '@/db/schema';
import { getMyStore } from '@/lib/session';
import { forStore } from '@/lib/tenant';
import { isUuid } from '@/lib/product-form';
import { parseWibInput } from '@/lib/format';
import { compressImage, ImageError, MAX_UPLOAD_BYTES } from '@/lib/image';
import { removeImages, uploadImage } from '@/lib/storage';
import { normalizeSocial } from '@/lib/validation';
import { rateGuard, TOO_MANY } from '@/lib/rate-limit';

const enc = encodeURIComponent;
const BACK = (slug: string) => `/dashboard/${slug}/pengaturan/banner`;
const MAX_BANNERS = 8;
const DENIED = 'Hanya pemilik toko yang dapat mengubah banner.';

function parseMeta(slug: string, fd: FormData) {
  const title = String(fd.get('title') ?? '').trim().slice(0, 80);
  const link = normalizeSocial('website', String(fd.get('link') ?? ''));
  const startsAt = parseWibInput(String(fd.get('startsAt') ?? ''));
  const endsAt = parseWibInput(String(fd.get('endsAt') ?? ''));
  if (link === undefined) redirect(`${BACK(slug)}?error=${enc('Tautan banner tidak valid.')}`);
  if (startsAt === undefined || endsAt === undefined) redirect(`${BACK(slug)}?error=${enc('Format tanggal tidak valid.')}`);
  if (startsAt && endsAt && endsAt <= startsAt) redirect(`${BACK(slug)}?error=${enc('Waktu selesai harus setelah waktu mulai.')}`);
  return { title: title || null, linkUrl: link, startsAt, endsAt, active: fd.get('active') === 'on' };
}

export async function addBanner(slug: string, fd: FormData) {
  const { user, store } = await getMyStore(slug);
  if (!(await rateGuard('upload', 30, 600, user.id)).ok) redirect(`${BACK(slug)}?error=${enc(TOO_MANY)}`);
  const file = fd.get('file');
  if (!(file instanceof File) || file.size === 0) redirect(`${BACK(slug)}?error=${enc('Pilih gambar banner.')}`);
  if (file.size > MAX_UPLOAD_BYTES) redirect(`${BACK(slug)}?error=${enc('Ukuran gambar maksimal 5 MB.')}`);
  const meta = parseMeta(slug, fd);

  const path = `${store.id}/banners/${randomUUID()}.webp`;
  let error: string | null = null;
  try {
    await uploadImage(path, (await compressImage(Buffer.from(await file.arrayBuffer()), 1600)).data);
    const r = await asUser(user.id, async (tx) => {
      const [{ n }] = await tx.select({ n: count() }).from(banners).where(eq(banners.storeId, store.id));
      if (n >= MAX_BANNERS) return 'limit' as const;
      const last = await tx.select({ p: banners.position }).from(banners).where(eq(banners.storeId, store.id)).orderBy(asc(banners.position));
      await tx.insert(banners).values({ ...meta, storeId: store.id, imagePath: path, position: (last.at(-1)?.p ?? -1) + 1 });
      return 'ok' as const;
    });
    if (r === 'limit') { await removeImages([path]); error = `Maksimal ${MAX_BANNERS} banner.`; }
  } catch (e) {
    await removeImages([path]);
    error = e instanceof ImageError ? e.message : DENIED;
  }
  redirect(error ? `${BACK(slug)}?error=${enc(error)}` : `${BACK(slug)}?ok=1`);
}

export async function updateBanner(slug: string, id: string, fd: FormData) {
  const { user, store } = await getMyStore(slug);
  if (!isUuid(id)) notFound();
  const meta = parseMeta(slug, fd);
  let ok = true;
  try { await asUser(user.id, (tx) => tx.update(banners).set(meta).where(forStore(banners.storeId, store.id, eq(banners.id, id)))); } catch { ok = false; }
  redirect(ok ? `${BACK(slug)}?ok=1` : `${BACK(slug)}?error=${enc(DENIED)}`);
}

export async function moveBanner(slug: string, id: string, dir: 'up' | 'down') {
  const { user, store } = await getMyStore(slug);
  if (!isUuid(id)) notFound();
  await asUser(user.id, async (tx) => {
    const rows = await tx.select({ id: banners.id }).from(banners).where(eq(banners.storeId, store.id)).orderBy(asc(banners.position), asc(banners.createdAt));
    const i = rows.findIndex((r) => r.id === id);
    const j = dir === 'up' ? i - 1 : i + 1;
    if (i < 0 || j < 0 || j >= rows.length) return;
    const order = rows.map((r) => r.id);
    [order[i], order[j]] = [order[j], order[i]];
    for (let k = 0; k < order.length; k++) await tx.update(banners).set({ position: k }).where(forStore(banners.storeId, store.id, eq(banners.id, order[k])));
  }).catch(() => undefined);
  redirect(`${BACK(slug)}?ok=1`);
}

export async function deleteBanner(slug: string, id: string) {
  const { user, store } = await getMyStore(slug);
  if (!isUuid(id)) notFound();
  const rows = await asUser(user.id, (tx) => tx.delete(banners).where(forStore(banners.storeId, store.id, eq(banners.id, id))).returning({ path: banners.imagePath })).catch(() => []);
  await removeImages(rows.map((r) => r.path));
  redirect(`${BACK(slug)}?ok=1`);
}
