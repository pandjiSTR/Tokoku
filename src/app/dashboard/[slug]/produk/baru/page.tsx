import type { Metadata } from 'next';
import Link from 'next/link';
import { asc, eq } from 'drizzle-orm';
import { asUser } from '@/db';
import { categories } from '@/db/schema';
import { getMyStore } from '@/lib/session';
import { Alert } from '@/components/Alert';
import { ProductForm } from '@/components/ProductForm';
import { createProduct } from '../actions';

export const metadata: Metadata = { title: 'Tambah produk' };

export default async function BaruPage({ params, searchParams }: {
  params: Promise<{ slug: string }>; searchParams: Promise<{ error?: string }>;
}) {
  const { slug } = await params;
  const { error } = await searchParams;
  const { user, store } = await getMyStore(slug);
  const cats = await asUser(user.id, (tx) =>
    tx.select({ id: categories.id, name: categories.name }).from(categories).where(eq(categories.storeId, store.id)).orderBy(asc(categories.name)));
  return (
    <main className="container">
      <Link href={`/dashboard/${slug}/produk`} className="muted small">&larr; Produk</Link>
      <h1>Tambah produk</h1>
      {error && <Alert kind="error">{error}</Alert>}
      <ProductForm action={createProduct.bind(null, slug)} categories={cats} submitLabel="Simpan dan lanjut ke foto" cancelHref={`/dashboard/${slug}/produk`} />
    </main>
  );
}
