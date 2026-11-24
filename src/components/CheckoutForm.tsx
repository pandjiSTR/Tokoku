'use client';
import { useEffect, useState } from 'react';
import { formatRupiah } from '@/lib/format';
import { LocationPicker, type Point } from './LocationPicker';

type Opt = { code: string; name: string };
type PayMethod = { id: string; label: string; detail: string };
type Method = 'courier' | 'local' | 'pickup';
type Quote = { available: boolean; price?: number; label?: string; distanceKm?: number; reason?: string } | null;

const LOCAL_WHY: Record<string, string> = {
  out_of_radius: 'Lokasi Anda di luar jangkauan kurir toko.', no_location: 'Toko belum mengatur lokasinya.',
  disabled: 'Kurir toko tidak tersedia.', invalid: 'Titik lokasi tidak valid. Geser pin ke lokasi Anda.',
};

async function fetchRegions(parent: string): Promise<Opt[]> {
  const res = await fetch(`/api/regions?parent=${parent}`);
  return res.ok ? res.json() : [];
}

export function CheckoutForm(props: {
  slug: string; action: (fd: FormData) => Promise<void>; provinces: Opt[]; methods: PayMethod[]; subtotal: number; waHref: string | null;
  shipping: { courier: boolean; local: boolean; maxRadiusKm: number; pickup: boolean; pickupInstructions: string | null };
}) {
  const available = (['courier', 'local', 'pickup'] as Method[]).filter((m) => props.shipping[m]);
  const [method, setMethod] = useState<Method>(available[0] ?? 'courier');
  const [province, setProvince] = useState('');
  const [cities, setCities] = useState<Opt[]>([]);
  const [city, setCity] = useState('');
  const [districts, setDistricts] = useState<Opt[]>([]);
  const [district, setDistrict] = useState('');
  const [quote, setQuote] = useState<Quote>(null);
  const [point, setPoint] = useState<Point | null>(null);
  const [geoMsg, setGeoMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pay, setPay] = useState(props.methods[0]?.id ?? '');

  function switchMethod(m: Method) { setMethod(m); setQuote(null); if (m === 'local' && point) setPoint({ ...point }); }

  async function onProvince(code: string) {
    setProvince(code); setCity(''); setDistrict(''); setCities([]); setDistricts([]); setQuote(null);
    if (code) { setBusy(true); setCities(await fetchRegions(code)); setBusy(false); }
  }
  async function onCity(code: string) {
    setCity(code); setDistrict(''); setDistricts([]); setQuote(null);
    if (!code) return;
    setBusy(true);
    const [d, s] = await Promise.all([
      fetchRegions(code),
      fetch(`/api/shipping?store=${props.slug}&method=courier&city=${code}`).then((r) => (r.ok ? r.json() : { available: false })),
    ]);
    setDistricts(d); setQuote(s); setBusy(false);
  }

  // Ongkir kurir toko dihitung server dari titik pin (koordinat toko tidak pernah dikirim ke browser).
  useEffect(() => {
    if (method !== 'local' || !point) return;
    let stale = false;
    const t = setTimeout(async () => {
      setQuote(null);
      const r = await fetch(`/api/shipping?store=${props.slug}&method=local&lat=${point.lat.toFixed(6)}&lng=${point.lng.toFixed(6)}`);
      const q = r.ok ? await r.json() : { available: false, reason: 'invalid' };
      if (!stale) setQuote(q);
    }, 350);
    return () => { stale = true; clearTimeout(t); };
  }, [method, point, props.slug]);

  function useMyLocation() {
    setGeoMsg(null);
    if (!navigator.geolocation) { setGeoMsg('Peramban tidak mendukung lokasi. Geser pin secara manual.'); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => setPoint({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => setGeoMsg('Izin lokasi ditolak. Geser pin secara manual di peta.'),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  const fee = method === 'pickup' ? 0 : quote?.available ? quote.price ?? 0 : null;
  const canSubmit = !!pay && !busy && (method === 'pickup' || (quote?.available && (method === 'local' ? !!point : !!district)));
  const label: Record<Method, string> = { courier: 'Ekspedisi', local: 'Kurir toko', pickup: 'Ambil di toko' };

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
        <h2>Metode pengiriman</h2>
        <div className="method-tabs" role="radiogroup" aria-label="Metode pengiriman">
          {available.map((m) => (
            <button key={m} type="button" role="radio" aria-checked={method === m} className={`btn btn-sm ${method === m ? '' : 'btn-secondary'}`} onClick={() => switchMethod(m)}>
              {label[m]}
            </button>
          ))}
        </div>
        <input type="hidden" name="shippingMethod" value={method} />
        {method === 'local' && point && (<><input type="hidden" name="lat" value={point.lat} /><input type="hidden" name="lng" value={point.lng} /></>)}
      </section>

      {method === 'courier' && (
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
      )}

      {method === 'local' && (
        <section className="card stack">
          <h2>Lokasi pengantaran</h2>
          <p className="muted small">Geser pin atau ketuk peta di lokasi rumah Anda. Jangkauan kurir toko maksimal {props.shipping.maxRadiusKm} km.</p>
          <button type="button" className="btn btn-secondary" onClick={useMyLocation}>Gunakan lokasi saya</button>
          {geoMsg && <p className="error small" role="alert">{geoMsg}</p>}
          <LocationPicker value={point} onChange={setPoint} height={280} />
          <div className="field">
            <label htmlFor="address">Alamat lengkap</label>
            <textarea id="address" name="address" rows={3} required minLength={8} maxLength={300} placeholder="Jalan, nomor rumah, RT/RW, patokan" />
          </div>
        </section>
      )}

      {method === 'pickup' && (
        <section className="card stack">
          <h2>Ambil di toko</h2>
          <p className="muted">{props.shipping.pickupInstructions || 'Pesanan dapat diambil di toko setelah pembayaran diverifikasi.'}</p>
        </section>
      )}

      {method !== 'pickup' && (
        <section className="card stack" aria-live="polite">
          <h2>Ongkir</h2>
          {method === 'courier' && !city && <p className="muted">Pilih kota/kabupaten untuk melihat ongkir.</p>}
          {method === 'local' && !point && <p className="muted">Tentukan lokasi pengantaran di peta.</p>}
          {((method === 'courier' && city) || (method === 'local' && point)) && quote === null && <p className="muted">Menghitung ongkir...</p>}
          {quote?.available && (
            <div className="row">
              <span>{method === 'local' ? `Kurir toko (${(quote.distanceKm ?? 0).toFixed(1)} km)` : `Ekspedisi (${quote.label})`}</span>
              <strong>{formatRupiah(quote.price ?? 0)}</strong>
            </div>
          )}
          {quote && !quote.available && (
            <div className="stack">
              <p className="error">{method === 'local' ? LOCAL_WHY[quote.reason ?? 'invalid'] : 'Toko belum melayani pengiriman ke kota ini.'}</p>
              {props.waHref && <a href={props.waHref} target="_blank" rel="noopener noreferrer" className="btn btn-secondary">Tanya pengiriman via WhatsApp</a>}
            </div>
          )}
        </section>
      )}

      <section className="card stack">
        <h2>Pembayaran</h2>
        {props.methods.map((m) => (
          <label key={m.id} className={`option ${pay === m.id ? 'selected' : ''}`}>
            <input type="radio" name="paymentMethodId" value={m.id} checked={pay === m.id} onChange={() => setPay(m.id)} />
            <span className="grow"><strong>{m.label}</strong><span className="muted small" style={{ display: 'block' }}>{m.detail}</span></span>
          </label>
        ))}
      </section>

      <section className="card stack">
        <div className="row"><span className="muted">Subtotal</span><span>{formatRupiah(props.subtotal)}</span></div>
        <div className="row"><span className="muted">Ongkir</span><span>{fee === null ? '-' : formatRupiah(fee)}</span></div>
        <p className="hint">Kode unik 3 digit ditambahkan ke total setelah pesanan dibuat, untuk memudahkan pencocokan transfer.</p>
        <button type="submit" className="btn btn-block" disabled={!canSubmit}>Buat pesanan</button>
      </section>
    </form>
  );
}
