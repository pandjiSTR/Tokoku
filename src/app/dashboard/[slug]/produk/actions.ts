'use server';
import { randomUUID, randomBytes } from 'node:crypto';
import { redirect, notFound } from 'next/navigation';
import { and, asc, eq } from 'drizzle-orm';
import { asUser, type Tx } from '@/db';
import { auditLogs, productImages, products } from '@/db/schema';
import { getMyStore } from '@/lib/session';
import { forStore } from '@/lib/tenant';
import { toSlug } from '@/lib/slug';
import { parseProductForm, isUuid } from '@/lib/product-form';
import { compressImage, ImageError, MAX_IMAGES_PER_PRODUCT, MAX_UPLOAD_BYTES } from '@/lib/image';
import { removeImages, uploadImage } from '@/lib/storage';

const enc = encodeURIComponent;

async function uniqueSlug(tx: Tx, storeId: string, name: string) {
  const base = toSlug(name, 60) || 'produk';
  for (let i = 1; i <= 30; i++) {
    const candidate = i === 1 ? base : `${base}-${i}`;
    const hit = await tx.select({ id: products.id }).from(products).where(forStore(products.storeId, storeId, eq(products.slug, candidate))).limit(1);
    if (hit.length === 0) return candidate;
  }
  return `${base}-${randomBytes(3).toString('hex')}`;
}

export async function createProduct(slug: string, formData: FormData) {
  const { user, store } = await getMyStore(slug);
  const parsed = parseProductForm(formData);
  if (!parsed.ok) redirect(`/dashboard/${slug}/produk/baru?error=${enc(parsed.error)}`);

  let id: string | null = null;
  try {
    id = await asUser(user.id, async (tx) => {
      const [row] = await tx.insert(products).values({
        ...parsed.data, storeId: store.id, slug: await uniqueSlug(tx, store.id, parsed.data.name),
      }).returning({ id: products.id });
      await tx.insert(auditLogs).values({ storeId: store.id, userId: user.id, action: 'product.create', meta: { id: row.id } });
      return row.id;
    });
  } catch {
    id = null;
  }
  if (!id) redirect(`/dashboard/${slug}/produk/baru?error=${enc('Produk gagal disimpan. Periksa kategori dan isian Anda.')}`);
  redirect(`/dashboard/${slug}/produk/${id}?ok=dibuat`);
}

export async function updateProduct(slug: string, productId: string, formData: FormData) {
  const { user, store } = await getMyStore(slug);
  if (!isUuid(productId)) notFound();
  const back = `/dashboard/${slug}/produk/${productId}`;
  const parsed = parseProductForm(formData);
  if (!parsed.ok) redirect(`${back}?error=${enc(parsed.error)}`);

  let ok = false;
  try {
    ok = await asUser(user.id, async (tx) => {
      const rows = await tx.update(products).set({ ...parsed.data, updatedAt: new Date() })
        .where(forStore(products.storeId, store.id, eq(products.id, productId))).returning({ id: products.id });
      if (rows.length === 0) return false;
      await tx.insert(auditLogs).values({ storeId: store.id, userId: user.id, action: 'product.update', meta: { id: productId } });
      return true;
    });
  } catch {
    ok = false;
  }
  if (!ok) redirect(`${back}?error=${enc('Perubahan gagal disimpan.')}`);
  redirect(`${back}?ok=disimpan`);
}

export async function deleteProduct(slug: string, productId: string) {
  const { user, store } = await getMyStore(slug);
  if (!isUuid(productId)) notFound();
  const paths = await asUser(user.id, async (tx) => {
    const imgs = await tx.select({ path: productImages.path }).from(productImages)
      .where(forStore(productImages.storeId, store.id, eq(productImages.productId, productId)));
    const gone = await tx.delete(products).where(forStore(products.storeId, store.id, eq(products.id, productId))).returning({ id: products.id });
    if (gone.length === 0) return null;
    await tx.insert(auditLogs).values({ storeId: store.id, userId: user.id, action: 'product.delete', meta: { id: productId } });
    return imgs.map((i) => i.path);
  });
  if (paths === null) notFound();
  await removeImages(paths);
  redirect(`/dashboard/${slug}/produk?ok=dihapus`);
}

export async function uploadImages(slug: string, productId: string, formData: FormData) {
  const { user, store } = await getMyStore(slug);
  if (!isUuid(productId)) notFound();
  const back = `/dashboard/${slug}/produk/${productId}`;

  const files = formData.getAll('images').filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) redirect(`${back}?error=${enc('Pilih gambar terlebih dahulu.')}`);
  if (files.length > 3) redirect(`${back}?error=${enc('Maksimal 3 gambar sekali unggah.')}`);
  if (files.some((f) => f.size > MAX_UPLOAD_BYTES)) redirect(`${back}?error=${enc('Ukuran gambar maksimal 5 MB.')}`);

  const state = await asUser(user.id, async (tx) => {
    const [prod] = await tx.select({ id: products.id }).from(products)
      .where(forStore(products.storeId, store.id, eq(products.id, productId))).limit(1);
    if (!prod) return null;
    const imgs = await tx.select({ position: productImages.position }).from(productImages)
      .where(forStore(productImages.storeId, store.id, eq(productImages.productId, productId)));
    return { count: imgs.length, next: imgs.reduce((m, i) => Math.max(m, i.position), -1) + 1 };
  });
  if (!state) notFound();
  if (state.count + files.length > MAX_IMAGES_PER_PRODUCT) {
    redirect(`${back}?error=${enc(`Maksimal ${MAX_IMAGES_PER_PRODUCT} gambar per produk.`)}`);
  }

  let error: string | null = null;
  let next = state.next;
  for (const f of files) {
    try {
      const { data } = await compressImage(Buffer.from(await f.arrayBuffer()));
      const path = `${store.id}/${productId}/${randomUUID()}.webp`;
      await uploadImage(path, data);
      try {
        const position = next++;
        await asUser(user.id, (tx) => tx.insert(productImages).values({ storeId: store.id, productId, path, position }));
      } catch (e) {
        await removeImages([path]);
        throw e;
      }
    } catch (e) {
      error = e instanceof ImageError ? e.message : 'Unggah gagal. Coba lagi.';
      break;
    }
  }
  if (error) redirect(`${back}?error=${enc(error)}`);
  redirect(`${back}?ok=gambar`);
}

export async function deleteImage(slug: string, productId: string, imageId: string) {
  const { user, store } = await getMyStore(slug);
  if (!isUuid(productId) || !isUuid(imageId)) notFound();
  const rows = await asUser(user.id, (tx) =>
    tx.delete(productImages).where(forStore(productImages.storeId, store.id, eq(productImages.id, imageId), eq(productImages.productId, productId)))
      .returning({ path: productImages.path }));
  await removeImages(rows.map((r) => r.path));
  redirect(`/dashboard/${slug}/produk/${productId}?ok=hapus_gambar`);
}

export async function makeMainImage(slug: string, productId: string, imageId: string) {
  const { user, store } = await getMyStore(slug);
  if (!isUuid(productId) || !isUuid(imageId)) notFound();
  await asUser(user.id, async (tx) => {
    const imgs = await tx.select({ id: productImages.id }).from(productImages)
      .where(forStore(productImages.storeId, store.id, eq(productImages.productId, productId)))
      .orderBy(asc(productImages.position), asc(productImages.createdAt));
    if (!imgs.some((i) => i.id === imageId)) return;
    const order = [imageId, ...imgs.map((i) => i.id).filter((id) => id !== imageId)];
    for (let i = 0; i < order.length; i++) {
      await tx.update(productImages).set({ position: i }).where(and(eq(productImages.id, order[i]), eq(productImages.storeId, store.id)));
    }
  });
  redirect(`/dashboard/${slug}/produk/${productId}?ok=utama`);
}
