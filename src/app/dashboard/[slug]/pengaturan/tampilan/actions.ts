'use server';
import { randomUUID } from 'node:crypto';
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { asUser } from '@/db';
import { auditLogs, storeSettings, stores } from '@/db/schema';
import { getMyStore } from '@/lib/session';
import { compressFavicon, compressImage, ImageError, MAX_UPLOAD_BYTES } from '@/lib/image';
import { removeImages, uploadImage } from '@/lib/storage';
import { parseThemeConfig, validateTheme } from '@/lib/theme';
import { rateGuard, TOO_MANY } from '@/lib/rate-limit';

const enc = encodeURIComponent;
const BACK = (slug: string) => `/dashboard/${slug}/pengaturan/tampilan`;
const DENIED = 'Hanya pemilik toko yang dapat mengubah tampilan.';

export async function saveTheme(slug: string, fd: FormData) {
  const { user, store } = await getMyStore(slug);
  let cfg;
  try { cfg = parseThemeConfig(JSON.parse(String(fd.get('config') ?? '{}'))); } catch { redirect(`${BACK(slug)}?error=${enc('Konfigurasi tidak valid.')}`); }
  const problem = validateTheme(cfg);
  if (problem) redirect(`${BACK(slug)}?error=${enc(problem)}`);
  let ok = true;
  try {
    await asUser(user.id, async (tx) => {
      await tx.insert(storeSettings).values({ storeId: store.id, config: cfg }).onConflictDoUpdate({ target: storeSettings.storeId, set: { config: cfg, updatedAt: new Date() } });
      await tx.insert(auditLogs).values({ storeId: store.id, userId: user.id, action: 'store.update_theme', meta: {} });
    });
  } catch { ok = false; }
  redirect(ok ? `${BACK(slug)}?ok=1` : `${BACK(slug)}?error=${enc(DENIED)}`);
}

async function setBrandImage(slug: string, kind: 'logo' | 'favicon', fd: FormData) {
  const { user, store } = await getMyStore(slug);
  if (!(await rateGuard('upload', 30, 600, user.id)).ok) redirect(`${BACK(slug)}?error=${enc(TOO_MANY)}`);
  const file = fd.get('file');
  if (!(file instanceof File) || file.size === 0) redirect(`${BACK(slug)}?error=${enc('Pilih gambar terlebih dahulu.')}`);
  if (file.size > MAX_UPLOAD_BYTES) redirect(`${BACK(slug)}?error=${enc('Ukuran gambar maksimal 5 MB.')}`);

  const buf = Buffer.from(await file.arrayBuffer());
  const path = `${store.id}/brand/${kind}-${randomUUID()}.${kind === 'logo' ? 'webp' : 'png'}`;
  let error: string | null = null;
  let old: string | null = null;
  try {
    if (kind === 'logo') await uploadImage(path, (await compressImage(buf, 512)).data);
    else await uploadImage(path, await compressFavicon(buf), 'image/png');
    old = (kind === 'logo' ? store.logoPath : store.faviconPath);
    const set = kind === 'logo' ? { logoPath: path } : { faviconPath: path };
    const rows = await asUser(user.id, (tx) => tx.update(stores).set({ ...set, updatedAt: new Date() }).where(eq(stores.id, store.id)).returning({ id: stores.id }));
    if (rows.length === 0) { await removeImages([path]); error = DENIED; }
  } catch (e) {
    await removeImages([path]);
    error = e instanceof ImageError ? e.message : 'Unggah gagal. Coba lagi.';
  }
  if (error) redirect(`${BACK(slug)}?error=${enc(error)}`);
  if (old) await removeImages([old]);
  redirect(`${BACK(slug)}?ok=1`);
}

export async function uploadLogo(slug: string, fd: FormData) { await setBrandImage(slug, 'logo', fd); }
export async function uploadFavicon(slug: string, fd: FormData) { await setBrandImage(slug, 'favicon', fd); }

export async function removeBrandImage(slug: string, kind: 'logo' | 'favicon') {
  const { user, store } = await getMyStore(slug);
  const old = kind === 'logo' ? store.logoPath : store.faviconPath;
  await asUser(user.id, (tx) => tx.update(stores).set(kind === 'logo' ? { logoPath: null } : { faviconPath: null }).where(eq(stores.id, store.id)));
  if (old) await removeImages([old]);
  redirect(`${BACK(slug)}?ok=1`);
}
