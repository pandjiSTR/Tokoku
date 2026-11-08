import type { Metadata } from 'next';
import Link from 'next/link';
import { asc, eq } from 'drizzle-orm';
import { asAnon } from '@/db';
import { regions } from '@/db/schema';
import { getMyStore } from '@/lib/session';
import { Alert } from '@/components/Alert';
import { RegionPicker } from '@/components/RegionPicker';
import { updateProfile } from './actions';

export const metadata: Metadata = { title: 'Profil toko' };

export default async function ProfilPage({ params, searchParams }: {
  params: Promise<{ slug: string }>; searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const { slug } = await params;
  const { ok, error } = await searchParams;
  const { store } = await getMyStore(slug);

  const { provinces, cities } = await asAnon(async (tx) => ({
    provinces: await tx.select({ code: regions.code, name: regions.name }).from(regions)
      .where(eq(regions.level, 'province')).orderBy(asc(regions.name)),
    cities: store.provinceCode
      ? await tx.select({ code: regions.code, name: regions.name }).from(regions)
          .where(eq(regions.parentCode, store.provinceCode)).orderBy(asc(regions.name))
      : [],
  }));

  return (
    <main className="container">
      <Link href={`/dashboard/${slug}/pengaturan`} className="muted small">&larr; Pengaturan</Link>
      <h1>Profil toko</h1>
      {ok && <Alert kind="info">Perubahan tersimpan.</Alert>}
      {error && <Alert kind="error">{error}</Alert>}
      <form action={updateProfile.bind(null, slug)} className="card stack">
        <div className="field">
          <label htmlFor="name">Nama toko</label>
          <input id="name" name="name" defaultValue={store.name} required />
        </div>
        <div className="field">
          <label htmlFor="description">Deskripsi singkat</label>
          <textarea id="description" name="description" rows={3} maxLength={500} defaultValue={store.description ?? ''} />
        </div>
        <div className="field">
          <label htmlFor="address">Alamat lengkap</label>
          <textarea id="address" name="address" rows={2} maxLength={250} defaultValue={store.address ?? ''} />
        </div>
        <RegionPicker
          provinces={provinces}
          initialProvince={store.provinceCode ?? ''}
          initialCity={store.cityCode ?? ''}
          initialCities={cities}
        />
        <button type="submit" className="btn btn-block">Simpan</button>
      </form>
    </main>
  );
}
