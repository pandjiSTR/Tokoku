'use client';
import { useState } from 'react';
import { formatRupiah } from '@/lib/format';

type Opt = { code: string; name: string };
type Method = { id: string; label: string; detail: string };
type Ship = { available: boolean; price?: number; label?: string } | null;

async function fetchRegions(parent: string): Promise<Opt[]> {
  const res = await fetch(`/api/regions?parent=${parent}`);
  return res.ok ? res.json() : [];
}

export function CheckoutForm(props: {
  slug: string; action: (fd: FormData) => Promise<void>; provinces: Opt[]; methods: Method[]; subtotal: number; waHref: string | null;
}) {
  const [province, setProvince] = useState('');
  const [cities, setCities] = useState<Opt[]>([]);
  const [city, setCity] = useState('');
  const [districts, setDistricts] = useState<Opt[]>([]);
  const [district, setDistrict] = useState('');
  const [ship, setShip] = useState<Ship>(null);
  const [busy, setBusy] = useState(false);
  const [method, setMethod] = useState(props.methods[0]?.id ?? '');

  async function onProvince(code: string) {
    setProvince(code); setCity(''); setDistrict(''); setCities([]); setDistricts([]); setShip(null);
    if (code) { setBusy(true); setCities(await fetchRegions(code)); setBusy(false); }
  }
  async function onCity(code: string) {
    setCity(code); setDistrict(''); setDistricts([]); setShip(null);
    if (!code) return;
    setBusy(true);
    const [d, s] = await Promise.all([
      fetchRegions(code),
      fetch(`/api/shipping?store=${props.slug}&city=${code}`).then((r) => (r.ok ? r.json() : { available: false })),
    ]);
    setDistricts(d); setShip(s); setBusy(false);
  }

  const canSubmit = !!district && !!ship?.available && !!method && !busy;
  const fee = ship?.available ? ship.price ?? 0 : 0;

  return (
    <form action={props.action} className="stack">
      <section className="card stack">
        <h2>Data pembeli</h2>
        <div className="field"><label htmlFor="name">Nama</label><input id="name" name="name" autoComplete="name" required maxLength={80} /></div>
        <div className="field">
          <label htmlFor="whatsapp">Nomor WhatsApp</label>
          <input id="whatsapp" name="whatsapp" inputMode="tel" autoComplete="tel" placeholder="081234567890" required />
        </div>
        <div className="field"><label htmlFor="email">Email (opsional)</label><input id="email" name="email" type="email" autoComplete="email" /></div>
      </section>

      <section className="card stack">
        <h2>Alamat pengiriman</h2>
        <div className="field">
          <label htmlFor="provinceCode">Provinsi</label>
          <select id="provinceCode" name="provinceCode" value={province} onChange={(e) => onProvince(e.target.value)} required>
            <option value="">Pilih provinsi</option>
            {props.provinces.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="cityCode">Kota/kabupaten</label>
          <select id="cityCode" name="cityCode" value={city} onChange={(e) => onCity(e.target.value)} disabled={!province} required>
            <option value="">Pilih kota/kabupaten</option>
            {cities.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="districtCode">Kecamatan</label>
          <select id="districtCode" name="districtCode" value={district} onChange={(e) => setDistrict(e.target.value)} disabled={!city} required>
            <option value="">Pilih kecamatan</option>
            {districts.map((d) => <option key={d.code} value={d.code}>{d.name}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="address">Alamat lengkap</label>
          <textarea id="address" name="address" rows={3} required minLength={8} maxLength={300} placeholder="Jalan, nomor rumah, RT/RW, patokan" />
        </div>
      </section>

      <section className="card stack" aria-live="polite">
        <h2>Pengiriman</h2>
        {!city && <p className="muted">Pilih kota/kabupaten untuk melihat ongkir.</p>}
        {city && ship === null && <p className="muted">Memuat ongkir...</p>}
        {ship?.available && <div className="row"><span>Ekspedisi ({ship.label})</span><strong>{formatRupiah(ship.price ?? 0)}</strong></div>}
        {ship && !ship.available && (
          <div className="stack">
            <p className="error">Toko belum melayani pengiriman ke kota ini.</p>
            {props.waHref && <a href={props.waHref} target="_blank" rel="noopener noreferrer" className="btn btn-secondary">Tanya pengiriman via WhatsApp</a>}
          </div>
        )}
      </section>

      <section className="card stack">
        <h2>Pembayaran</h2>
        {props.methods.map((m) => (
          <label key={m.id} className={`option ${method === m.id ? 'selected' : ''}`}>
            <input type="radio" name="paymentMethodId" value={m.id} checked={method === m.id} onChange={() => setMethod(m.id)} />
            <span className="grow"><strong>{m.label}</strong><span className="muted small" style={{ display: 'block' }}>{m.detail}</span></span>
          </label>
        ))}
      </section>

      <section className="card stack">
        <div className="row"><span className="muted">Subtotal</span><span>{formatRupiah(props.subtotal)}</span></div>
        <div className="row"><span className="muted">Ongkir</span><span>{ship?.available ? formatRupiah(fee) : '-'}</span></div>
        <p className="hint">Kode unik 3 digit ditambahkan ke total setelah pesanan dibuat, untuk memudahkan pencocokan transfer.</p>
        <button type="submit" className="btn btn-block" disabled={!canSubmit}>Buat pesanan</button>
      </section>
    </form>
  );
}
