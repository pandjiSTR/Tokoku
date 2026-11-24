import sharp from 'sharp';

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // batas file asli
export const MAX_IMAGES_PER_PRODUCT = 5;
const DEFAULT_SIDE = 1200;
const ALLOWED = new Set(['jpeg', 'png', 'webp']);

// VM e2-micro hanya 1 GB RAM: satu proses sharp sekaligus, tanpa cache.
sharp.concurrency(1);
sharp.cache(false);

export class ImageError extends Error {}

/**
 * Memvalidasi isi file (bukan nama atau tipe kiriman browser), memutar sesuai EXIF,
 * memperkecil ke maksimal 1200 px, dan menyandikan ulang ke WebP.
 * Penyandian ulang membuang metadata (termasuk lokasi GPS) dan muatan berbahaya.
 */
export async function compressImage(input: Buffer, maxSide = DEFAULT_SIDE): Promise<{ data: Buffer; width: number; height: number }> {
  if (input.length === 0 || input.length > MAX_UPLOAD_BYTES) {
    throw new ImageError('Ukuran gambar maksimal 5 MB.');
  }
  try {
    const img = sharp(input, { limitInputPixels: 25_000_000, failOn: 'error' });
    const meta = await img.metadata();
    if (!meta.format || !ALLOWED.has(meta.format)) {
      throw new ImageError('Format gambar harus JPG, PNG, atau WebP.');
    }
    const out = await img
      .rotate()
      .resize({ width: maxSide, height: maxSide, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer({ resolveWithObject: true });
    return { data: out.data, width: out.info.width, height: out.info.height };
  } catch (e) {
    if (e instanceof ImageError) throw e;
    throw new ImageError('File bukan gambar yang valid.');
  }
}

/** Favicon: persegi 64x64 PNG (didukung semua peramban), dari JPG/PNG/WebP. */
export async function compressFavicon(input: Buffer): Promise<Buffer> {
  if (input.length === 0 || input.length > MAX_UPLOAD_BYTES) throw new ImageError('Ukuran gambar maksimal 5 MB.');
  try {
    const img = sharp(input, { limitInputPixels: 25_000_000, failOn: 'error' });
    const meta = await img.metadata();
    if (!meta.format || !ALLOWED.has(meta.format)) throw new ImageError('Format gambar harus JPG, PNG, atau WebP.');
    return await img.rotate().resize(64, 64, { fit: 'cover' }).png({ compressionLevel: 9 }).toBuffer();
  } catch (e) {
    if (e instanceof ImageError) throw e;
    throw new ImageError('File bukan gambar yang valid.');
  }
}
