'use client';
import { useState } from 'react';
import { LocationPicker, type Point } from './LocationPicker';

export function StoreLocationForm({ initial, action }: { initial: Point | null; action: (fd: FormData) => Promise<void> }) {
  const [point, setPoint] = useState<Point | null>(initial);
  const [msg, setMsg] = useState<string | null>(null);

  function gps() {
    setMsg(null);
    if (!navigator.geolocation) { setMsg('Peramban tidak mendukung lokasi. Geser pin secara manual.'); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => setPoint({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => setMsg('Izin lokasi ditolak. Geser pin secara manual di peta.'),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  return (
    <form action={action} className="card stack">
      <h2>Lokasi toko</h2>
      <p className="muted small">Koordinat ini privat: hanya dipakai server untuk menghitung jarak, dan tidak pernah ditampilkan ke pembeli.</p>
      <button type="button" className="btn btn-secondary" onClick={gps}>Gunakan lokasi saat ini</button>
      {msg && <p className="error small" role="alert">{msg}</p>}
      <LocationPicker value={point} onChange={setPoint} height={300} />
      {point && <><input type="hidden" name="lat" value={point.lat} /><input type="hidden" name="lng" value={point.lng} /></>}
      <p className="hint">{point ? `Titik terpilih: ${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}` : 'Ketuk peta atau geser pin ke lokasi toko Anda.'}</p>
      <button type="submit" className="btn btn-block" disabled={!point}>Simpan lokasi</button>
    </form>
  );
}
