import 'server-only';
import { createClient } from '@supabase/supabase-js';

export const IMAGE_BUCKET = 'product-images';

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_SERVICE_ROLE_KEY belum diatur');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/**
 * Kunci service role melewati semua kebijakan Supabase, jadi dipakai HANYA di server dan
 * HANYA setelah keanggotaan toko diperiksa. Path selalu dibuat server: {store_id}/{product_id}/{uuid}.webp
 */
export async function uploadImage(path: string, data: Buffer) {
  const { error } = await admin().storage.from(IMAGE_BUCKET).upload(path, data, {
    contentType: 'image/webp', cacheControl: '31536000', upsert: false,
  });
  if (error) throw new Error(`Upload gagal: ${error.message}`);
}

export async function removeImages(paths: string[]) {
  if (paths.length === 0) return;
  await admin().storage.from(IMAGE_BUCKET).remove(paths).catch(() => undefined);
}

// Bukti pembayaran berisi data pribadi: bucket PRIVAT, hanya dibuka lewat tautan bertanda tangan berumur pendek.
export const PROOF_BUCKET = 'payment-proofs';

export async function uploadProof(path: string, data: Buffer) {
  const { error } = await admin().storage.from(PROOF_BUCKET).upload(path, data, { contentType: 'image/webp', upsert: false });
  if (error) throw new Error(`Upload bukti gagal: ${error.message}`);
}

export async function removeProofs(paths: string[]) {
  if (paths.length === 0) return;
  await admin().storage.from(PROOF_BUCKET).remove(paths).catch(() => undefined);
}

/** Tautan 60 detik. Hanya dipanggil setelah keanggotaan toko diperiksa. */
export async function signedProofUrl(path: string): Promise<string | null> {
  const { data } = await admin().storage.from(PROOF_BUCKET).createSignedUrl(path, 60);
  return data?.signedUrl ?? null;
}
