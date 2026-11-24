import type { Metadata } from 'next';
import Link from 'next/link';
import { asc, eq } from 'drizzle-orm';
import { asUser } from '@/db';
import { shippingLocalOptions, shippingLocalTiers, storeLocations } from '@/db/schema';
import { getMyStore } from '@/lib/session';
import { Alert } from '@/components/Alert';
import { StoreLocationForm } from '@/components/StoreLocationForm';
import { addTier, deleteTier, saveLocalOptions, saveLocation, seedTiers, updateTier } from './actions';

export const metadata: Metadata = { title: 'Kurir toko' };

export default async function KurirTokoPage({ params, searchParams }: {
  params: Promise<{ slug: string }>; searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const { slug } = await params;
  const { ok, error } = await searchParams;
  const { user, store } = await getMyStore(slug);
  const d = await asUser(user.id, async (tx) => ({
    loc: (await tx.select().from(storeLocations).where(eq(storeLocations.storeId, store.id)))[0] ?? null,
    opt: (await tx.select().from(shippingLocalOptions).where(eq(shippingLocalOptions.storeId, store.id)))[0] ?? null,
    tiers: await tx.select().from(shippingLocalTiers).where(eq(shippingLocalTiers.storeId, store.id)).orderBy(asc(shippingLocalTiers.upToKm)),
  }));

  return (
    <main className="container">
      <Link href={`/dashboard/${slug}/pengaturan`} className="muted small">&larr; Pengaturan</Link>
      <h1>Kurir toko</h1>
      <p className="muted">Antar sendiri ke pembeli di sekitar toko. Jarak dihitung dari lokasi toko ke pin pembeli (garis lurus x faktor koreksi), lalu dicocokkan dengan tarif berjenjang.</p>
      {ok && <Alert kind="info">Perubahan tersimpan.</Alert>}
      {error && <Alert kind="error">{error}</Alert>}

      <StoreLocationForm initial={d.loc ? { lat: d.loc.lat, lng: d.loc.lng } : null} action={saveLocation.bind(null, slug)} />

      <section className="card stack" aria-labelledby="tarif">
        <h2 id="tarif">Tarif berdasarkan jarak</h2>
        {d.tiers.length === 0 ? (
          <div className="stack">
            <p className="muted">Belum ada tarif. Isi contoh (0-3 km Rp8.000, 3-6 km Rp12.000, 6-10 km Rp18.000), lalu sesuaikan.</p>
            <form action={seedTiers.bind(null, slug)}><button type="submit" className="btn btn-secondary btn-block">Isi tarif contoh</button></form>
          </div>
        ) : d.tiers.map((t) => (
          <div key={t.id} className="stack">
            <form action={updateTier.bind(null, slug, t.id)} className="rate-form">
              <label htmlFor={`k-${t.id}`} className="sr-only">Sampai jarak (km)</label>
              <span className="muted small">Sampai</span>
              <input id={`k-${t.id}`} name="upToKm" inputMode="decimal" defaultValue={Number(t.upToKm)} required style={{ width: 70 }} />
              <span className="muted small">km: Rp</span>
              <label htmlFor={`p-${t.id}`} className="sr-only">Tarif</label>
              <input id={`p-${t.id}`} name="price" inputMode="numeric" defaultValue={t.price} required />
              <button type="submit" className="btn btn-secondary btn-sm">Simpan</button>
            </form>
            <form action={deleteTier.bind(null, slug, t.id)}><button type="submit" className="btn btn-ghost btn-sm">Hapus tarif ini</button></form>
          </div>
        ))}
        <form action={addTier.bind(null, slug)} className="stack">
          <h3>Tambah tarif</h3>
          <div className="grid-2">
            <div className="field"><label htmlFor="n-km">Sampai (km)</label><input id="n-km" name="upToKm" inputMode="decimal" placeholder="3" required /></div>
            <div className="field"><label htmlFor="n-price">Tarif (Rp)</label><input id="n-price" name="price" inputMode="numeric" placeholder="8000" required /></div>
          </div>
          <button type="submit" className="btn btn-secondary btn-block">Tambah tarif</button>
        </form>
      </section>

      <form action={saveLocalOptions.bind(null, slug)} className="card stack">
        <h2>Aktifkan kurir toko</h2>
        <div className="grid-2">
          <div className="field"><label htmlFor="radius">Radius maksimal (km)</label><input id="radius" name="radius" inputMode="decimal" defaultValue={Number(d.opt?.maxRadiusKm ?? 10)} required /></div>
          <div className="field"><label htmlFor="correction">Faktor koreksi</label><input id="correction" name="correction" inputMode="decimal" defaultValue={Number(d.opt?.correction ?? 1.3)} required /></div>
        </div>
        <p className="hint">Faktor koreksi 1,3 menyesuaikan selisih jarak lurus dan jarak jalan. Di luar radius, opsi kurir toko tidak ditampilkan ke pembeli.</p>
        <label className="check-row"><input type="checkbox" name="enabled" defaultChecked={d.opt?.enabled ?? false} /><span>Kurir toko aktif di checkout</span></label>
        <button type="submit" className="btn btn-block">Simpan pengaturan</button>
      </form>
    </main>
  );
}
