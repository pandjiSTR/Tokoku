'use client';
import { useState } from 'react';

type Opt = { code: string; name: string };

export function RegionPicker(props: {
  provinces: Opt[];
  initialProvince: string;
  initialCity: string;
  initialCities: Opt[];
  idPrefix?: string;
}) {
  const pre = props.idPrefix ?? '';
  const [province, setProvince] = useState(props.initialProvince);
  const [cities, setCities] = useState<Opt[]>(props.initialCities);
  const [city, setCity] = useState(props.initialCity);
  const [loading, setLoading] = useState(false);

  async function onProvince(code: string) {
    setProvince(code);
    setCity('');
    setCities([]);
    if (!code) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/regions?parent=${code}`);
      if (res.ok) setCities(await res.json());
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="field">
        <label htmlFor={`${pre}provinceCode`}>Provinsi</label>
        <select id={`${pre}provinceCode`} name="provinceCode" value={province} onChange={(e) => onProvince(e.target.value)}>
          <option value="">Pilih provinsi</option>
          {props.provinces.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}
        </select>
      </div>
      <div className="field">
        <label htmlFor={`${pre}cityCode`}>Kota/kabupaten</label>
        <select id={`${pre}cityCode`} name="cityCode" value={city} onChange={(e) => setCity(e.target.value)} disabled={!province || loading}>
          <option value="">{loading ? 'Memuat...' : 'Pilih kota/kabupaten'}</option>
          {cities.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
        </select>
      </div>
    </>
  );
}
