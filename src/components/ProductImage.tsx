import { imageUrl } from '@/lib/image-url';

/** Gambar produk dengan penampung kosong. <img> biasa dipakai agar VM kecil tidak menjalankan pengoptimal gambar. */
export function ProductImage({ path, alt, className }: { path: string | null; alt: string; className?: string }) {
  if (!path) {
    return <div className={`img-placeholder ${className ?? ''}`} role="img" aria-label={`Belum ada foto: ${alt}`}>{alt.slice(0, 2).toUpperCase()}</div>;
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={imageUrl(path)} alt={alt} loading="lazy" decoding="async" className={className} />;
}
