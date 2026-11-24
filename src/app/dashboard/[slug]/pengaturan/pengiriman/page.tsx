import type { Metadata } from 'next';
import Link from 'next/link';
import { asc, eq } from 'drizzle-orm';
import { asUser } from '@/db';
import { pickupSettings, regions, shippingDefault, shippingGroupAreas, shippingGroups, shippingRates } from '@/db/schema';
import { getMyStore } from '@/lib/session';
import { Alert } from '@/components/Alert';
import { RegionPicker } from '@/components/RegionPicker';
import {
  addGroupArea, createGroup, deleteGroup, deleteRate, removeGroupArea, savePickup, setDefaultRate, updateGroup, upsertRate,
} from './actions';

export const metadata: Metadata = { title: 'Pengiriman' };

export default async function PengirimanPage({ params, searchParams }: {
  params: Promise<{ slug: string }>; searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const { slug } = await params;
  const { ok, error } = await searchParams;
  const { user, store } = await getMyStore(slug);

  const d = await asUser(user.id, async (tx) => ({
    pickup: (await tx.select().from(pickupSettings).where(eq(pickupSettings.storeId, store.id)))[0] ?? null,
    def: (await tx.select().from(shippingDefault).where(eq(shippingDefault.storeId, store.id)))[0] ?? null,
    rates: await tx.select({ cityCode: shippingRates.cityCode, price: shippingRates.price, active: shippingRates.active, name: regions.name })
      .from(shippingRates).innerJoin(regions, eq(regions.code, shippingRates.cityCode))
      .where(eq(shippingRates.storeId, store.id)).orderBy(asc(regions.name)),
    groups: await tx.select().from(shippingGroups).where(eq(shippingGroups.storeId, store.id)).orderBy(asc(shippingGroups.createdAt)),
    areas: await tx.select({ groupId: shippingGroupAreas.groupId, cityCode: shippingGroupAreas.cityCode, name: regions.name })
      .from(shippingGroupAreas).innerJoin(regions, eq(regions.code, shippingGroupAreas.cityCode))
      .where(eq(shippingGroupAreas.storeId, store.id)).orderBy(asc(regions.name)),
    provinces: await tx.select({ code: regions.code, name: regions.name }).from(regions).where(eq(regions.level, 'province')).orderBy(asc(regions.name)),
  }));
  const picker = (prefix: string) => (
    <RegionPicker provinces={d.provinces} initialProvince="" initialCity="" initialCities={[]} idPrefix={prefix} />
  );

  return (
    <main className="container">
      <Link href={`/dashboard/${slug}/pengaturan`} className="muted small">&larr; Pengaturan</Link>
      <h1>Pengiriman</h1>
      <p className="muted">Tarif ekspedisi ditentukan per kota/kabupaten. Urutan pencocokan: tarif kota, lalu tarif grup, lalu tarif standar. Jika tidak ada yang cocok, pembeli diarahkan menghubungi toko.</p>
      {ok && <Alert kind="info">Perubahan tersimpan.</Alert>}
      {error && <Alert kind="error">{error}</Alert>}

      <form action={setDefaultRate.bind(null, slug)} className="card stack">
        <h2>Tarif standar</h2>
        <div className="field"><label htmlFor="d-price">Tarif (Rp)</label><input id="d-price" name="price" inputMode="numeric" defaultValue={d.def?.price ?? ''} placeholder="25000" required /></div>
        <label className="check-row"><input type="checkbox" name="active" defaultChecked={d.def?.active ?? true} /><span>Berlaku untuk kota lain yang tidak punya tarif khusus</span></label>
        <button type="submit" className="btn btn-block">Simpan tarif standar</button>
      </form>

      <section className="stack" aria-labelledby="per-kota">
        <h2 id="per-kota">Tarif per kota/kabupaten</h2>
        {d.rates.map((r) => (
          <div key={r.cityCode} className="card stack">
            <strong>{r.name}</strong>
            <form action={upsertRate.bind(null, slug)} className="rate-form">
              <input type="hidden" name="cityCode" value={r.cityCode} />
              <label htmlFor={`p-${r.cityCode}`} className="sr-only">Tarif {r.name}</label>
              <input id={`p-${r.cityCode}`} name="price" inputMode="numeric" defaultValue={r.price} required />
              <label className="check-row"><input type="checkbox" name="active" defaultChecked={r.active} /><span>Aktif</span></label>
              <button type="submit" className="btn btn-secondary btn-sm">Simpan</button>
            </form>
            <form action={deleteRate.bind(null, slug, r.cityCode)}><button type="submit" className="btn btn-ghost btn-sm">Hapus</button></form>
          </div>
        ))}
        <form action={upsertRate.bind(null, slug)} className="card stack">
          <h3>Tambah tarif kota</h3>
          {picker('rate-')}
          <div className="field"><label htmlFor="rate-price">Tarif (Rp)</label><input id="rate-price" name="price" inputMode="numeric" required /></div>
          <button type="submit" className="btn btn-block">Tambah tarif kota</button>
        </form>
      </section>

      <form action={savePickup.bind(null, slug)} className="card stack">
        <h2>Ambil di toko (pickup)</h2>
        <p className="muted small">Pembeli mengambil pesanan sendiri. Ongkir Rp0 dan alamat pembeli tidak diminta.</p>
        <div className="field"><label htmlFor="instructions">Instruksi pengambilan</label><input id="instructions" name="instructions" maxLength={300} defaultValue={d.pickup?.instructions ?? ''} placeholder="Ambil di Jl. Contoh 1, jam 09.00-17.00" /></div>
        <label className="check-row"><input type="checkbox" name="enabled" defaultChecked={d.pickup?.enabled ?? false} /><span>Pickup aktif di checkout</span></label>
        <button type="submit" className="btn btn-block">Simpan pickup</button>
        <Link href={`/dashboard/${slug}/pengaturan/kurir-toko`} className="btn btn-ghost btn-block">Atur kurir toko (antar sendiri)</Link>
      </form>

      <section className="stack" aria-labelledby="grup">
        <h2 id="grup">Grup tarif</h2>
        <p className="muted small">Kelompokkan beberapa kota dengan tarif yang sama, misalnya semua kota di Jabodetabek.</p>
        {d.groups.map((g) => (
          <div key={g.id} className="card stack">
            <form action={updateGroup.bind(null, slug, g.id)} className="stack">
              <div className="field"><label htmlFor={`gn-${g.id}`}>Nama grup</label><input id={`gn-${g.id}`} name="name" defaultValue={g.name} required /></div>
              <div className="field"><label htmlFor={`gp-${g.id}`}>Tarif (Rp)</label><input id={`gp-${g.id}`} name="price" inputMode="numeric" defaultValue={g.price} required /></div>
              <button type="submit" className="btn btn-secondary btn-sm">Simpan grup</button>
            </form>
            <ul className="chips">
              {d.areas.filter((a) => a.groupId === g.id).map((a) => (
                <li key={a.cityCode}>
                  <form action={removeGroupArea.bind(null, slug, a.cityCode)}>
                    <button type="submit" className="btn btn-secondary btn-sm" aria-label={`Keluarkan ${a.name} dari grup`}>{a.name} &times;</button>
                  </form>
                </li>
              ))}
            </ul>
            <form action={addGroupArea.bind(null, slug, g.id)} className="stack">
              {picker(`g-${g.id}-`)}
              <button type="submit" className="btn btn-secondary btn-sm">Tambah kota ke grup</button>
            </form>
            <form action={deleteGroup.bind(null, slug, g.id)}><button type="submit" className="btn btn-ghost btn-sm">Hapus grup</button></form>
          </div>
        ))}
        <form action={createGroup.bind(null, slug)} className="card stack">
          <h3>Buat grup baru</h3>
          <div className="field"><label htmlFor="ng-name">Nama grup</label><input id="ng-name" name="name" placeholder="Jabodetabek" required /></div>
          <div className="field"><label htmlFor="ng-price">Tarif (Rp)</label><input id="ng-price" name="price" inputMode="numeric" required /></div>
          <button type="submit" className="btn btn-block">Buat grup</button>
        </form>
      </section>
    </main>
  );
}
