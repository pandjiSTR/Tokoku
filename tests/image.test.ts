import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { compressImage, ImageError, MAX_UPLOAD_BYTES } from '@/lib/image';

const make = (w: number, h: number, format: 'png' | 'jpeg' | 'gif' | 'webp' = 'png') =>
  sharp({ create: { width: w, height: h, channels: 3, background: '#cc5500' } })[format]().toBuffer();

describe('kompresi gambar', () => {
  it('memperkecil gambar besar ke maksimal 1200 px dan menyandikan ulang ke WebP', async () => {
    const out = await compressImage(await make(3000, 1500));
    const meta = await sharp(out.data).metadata();
    expect(meta.format).toBe('webp');
    expect(meta.width).toBe(1200);
    expect(meta.height).toBe(600);
  });
  it('tidak memperbesar gambar kecil', async () => {
    const out = await compressImage(await make(300, 200, 'jpeg'));
    expect(out.width).toBe(300);
  });
  it('menerima JPG, PNG, dan WebP', async () => {
    for (const f of ['jpeg', 'png', 'webp'] as const) await expect(compressImage(await make(50, 50, f))).resolves.toBeTruthy();
  });
  it('menolak GIF, SVG, dan file yang bukan gambar', async () => {
    await expect(compressImage(await make(20, 20, 'gif'))).rejects.toBeInstanceOf(ImageError);
    await expect(compressImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'))).rejects.toBeInstanceOf(ImageError);
    await expect(compressImage(Buffer.from('MZ\x90\x00 bukan gambar'))).rejects.toBeInstanceOf(ImageError);
  });
  it('menolak file kosong dan file melebihi 5 MB', async () => {
    await expect(compressImage(Buffer.alloc(0))).rejects.toBeInstanceOf(ImageError);
    await expect(compressImage(Buffer.alloc(MAX_UPLOAD_BYTES + 1))).rejects.toBeInstanceOf(ImageError);
  });
  it('membuang metadata EXIF dari hasil', async () => {
    const withExif = await sharp({ create: { width: 40, height: 40, channels: 3, background: '#fff' } })
      .jpeg().withExif({ IFD0: { Copyright: 'rahasia' } }).toBuffer();
    const out = await compressImage(withExif);
    expect((await sharp(out.data).metadata()).exif).toBeUndefined();
  });
});
