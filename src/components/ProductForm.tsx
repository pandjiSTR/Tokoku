import Link from 'next/link';
import type { ProductInput } from '@/lib/product-form';

type Cat = { id: string; name: string };

export function ProductForm({ action, categories, defaults, submitLabel, cancelHref }: {
  action: (fd: FormData) => Promise<void>;
  categories: Cat[];
  defaults?: Partial<ProductInput>;
  submitLabel: string;
  cancelHref: string;
}) {
  const d = defaults ?? {};
  return (
    <form action={action} className="card stack">
      <div className="field">
        <label htmlFor="name">Nama produk</label>
        <input id="name" name="name" defaultValue={d.name ?? ''} required maxLength={120} />
      </div>
      <div className="field">
        <label htmlFor="categoryId">Kategori</label>
        <select id="categoryId" name="categoryId" defaultValue={d.categoryId ?? ''}>
          <option value="">Tanpa kategori</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      <div className="field">
        <label htmlFor="description">Deskripsi</label>
        <textarea id="description" name="description" rows={4} maxLength={2000} defaultValue={d.description ?? ''} />
      </div>
      <div className="grid-2">
        <div className="field">
          <label htmlFor="price">Harga (Rp)</label>
          <input id="price" name="price" inputMode="numeric" placeholder="85000" defaultValue={d.price ?? ''} required />
        </div>
        <div className="field">
          <label htmlFor="comparePrice">Harga coret (opsional)</label>
          <input id="comparePrice" name="comparePrice" inputMode="numeric" placeholder="105000" defaultValue={d.comparePrice ?? ''} />
        </div>
        <div className="field">
          <label htmlFor="stock">Stok</label>
          <input id="stock" name="stock" inputMode="numeric" defaultValue={d.stock ?? 0} required />
        </div>
        <div className="field">
          <label htmlFor="weightGram">Berat (gram)</label>
          <input id="weightGram" name="weightGram" inputMode="numeric" placeholder="250" defaultValue={d.weightGram ?? ''} />
        </div>
      </div>
      <div className="field">
        <label htmlFor="status">Status</label>
        <select id="status" name="status" defaultValue={d.status ?? 'draft'}>
          <option value="draft">Draf (belum tampil di toko)</option>
          <option value="active">Aktif (tampil di toko)</option>
          <option value="archived">Arsip (disembunyikan)</option>
        </select>
      </div>
      <label className="check-row">
        <input type="checkbox" name="featured" defaultChecked={d.featured ?? false} />
        <span>Tampilkan sebagai produk unggulan di beranda</span>
      </label>
      <button type="submit" className="btn btn-block">{submitLabel}</button>
      <Link href={cancelHref} className="btn btn-ghost btn-block">Batal</Link>
    </form>
  );
}
