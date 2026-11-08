import { parseRupiah } from '@/lib/validation';

export type ProductInput = {
  name: string; description: string | null; price: number; comparePrice: number | null;
  stock: number; weightGram: number | null; status: 'active' | 'draft' | 'archived';
  categoryId: string | null; featured: boolean;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (s: string) => UUID.test(s);

export function parseProductForm(fd: FormData): { ok: true; data: ProductInput } | { ok: false; error: string } {
  const get = (k: string) => String(fd.get(k) ?? '');
  const name = get('name').trim();
  if (name.length < 2 || name.length > 120) return { ok: false, error: 'Nama produk 2-120 karakter.' };
  const description = get('description').trim();
  if (description.length > 2000) return { ok: false, error: 'Deskripsi maksimal 2000 karakter.' };

  const price = parseRupiah(get('price'));
  if (price === undefined || price === null) return { ok: false, error: 'Harga wajib diisi dengan angka, misalnya 85000.' };
  const comparePrice = parseRupiah(get('comparePrice'));
  if (comparePrice === undefined) return { ok: false, error: 'Harga coret harus berupa angka.' };
  if (comparePrice !== null && comparePrice <= price) return { ok: false, error: 'Harga coret harus lebih besar dari harga jual.' };

  const stock = parseRupiah(get('stock'), 1_000_000);
  if (stock === undefined) return { ok: false, error: 'Stok harus berupa angka bulat.' };
  const weightGram = parseRupiah(get('weightGram'), 1_000_000);
  if (weightGram === undefined) return { ok: false, error: 'Berat harus berupa angka (gram).' };

  const status = get('status');
  if (status !== 'active' && status !== 'draft' && status !== 'archived') return { ok: false, error: 'Status tidak valid.' };
  const categoryId = get('categoryId');
  if (categoryId && !isUuid(categoryId)) return { ok: false, error: 'Kategori tidak valid.' };

  return {
    ok: true,
    data: {
      name, description: description || null, price, comparePrice, stock: stock ?? 0, weightGram,
      status, categoryId: categoryId || null, featured: get('featured') === 'on',
    },
  };
}
