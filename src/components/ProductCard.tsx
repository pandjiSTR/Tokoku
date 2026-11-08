import Link from 'next/link';
import type { CardProduct } from '@/lib/catalog';
import { formatRupiah } from '@/lib/format';
import { ProductImage } from './ProductImage';

export function ProductCard({ storeSlug, p }: { storeSlug: string; p: CardProduct }) {
  return (
    <Link href={`/s/${storeSlug}/produk/${p.slug}`} className="product-card">
      <div className="product-media">
        <ProductImage path={p.cover} alt={p.name} className="product-img" />
        {p.stock === 0 && <span className="soldout">Habis</span>}
      </div>
      <div className="product-info">
        <span className="product-name">{p.name}</span>
        <span className="price">{formatRupiah(p.price)}</span>
        {p.comparePrice && <span className="price-old">{formatRupiah(p.comparePrice)}</span>}
      </div>
    </Link>
  );
}
