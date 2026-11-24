'use client';
import 'leaflet/dist/leaflet.css';
import { useEffect, useRef } from 'react';
import type { Map as LMap, Marker } from 'leaflet';

export type Point = { lat: number; lng: number };

/** Peta OpenStreetMap dengan pin yang dapat digeser, atau diketuk di peta. */
export function LocationPicker({ value, onChange, height = 260 }: { value: Point | null; onChange: (p: Point) => void; height?: number }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<LMap | null>(null);
  const marker = useRef<Marker | null>(null);
  const place = useRef<((p: Point, fly?: boolean) => void) | null>(null);
  const onChangeRef = useRef(onChange);
  const initial = useRef(value);

  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import('leaflet')).default;
      if (cancelled || !el.current || map.current) return;
      const start = initial.current;
      const m = L.map(el.current).setView(start ? [start.lat, start.lng] : [-2.5, 118], start ? 15 : 5);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(m);
      const icon = L.divIcon({ className: 'pin', html: '<span></span>', iconSize: [24, 24], iconAnchor: [12, 24] });

      place.current = (p, fly) => {
        if (marker.current) marker.current.setLatLng([p.lat, p.lng]);
        else {
          marker.current = L.marker([p.lat, p.lng], { icon, draggable: true }).addTo(m);
          marker.current.on('dragend', () => {
            const q = marker.current!.getLatLng();
            onChangeRef.current({ lat: q.lat, lng: q.lng });
          });
        }
        if (fly) m.setView([p.lat, p.lng], Math.max(m.getZoom(), 15));
      };
      if (start) place.current(start);
      m.on('click', (e) => {
        place.current?.({ lat: e.latlng.lat, lng: e.latlng.lng });
        onChangeRef.current({ lat: e.latlng.lat, lng: e.latlng.lng });
      });
      map.current = m;
    })();
    return () => { cancelled = true; map.current?.remove(); map.current = null; marker.current = null; place.current = null; };
  }, []);

  // Posisi diubah dari luar (mis. tombol "Gunakan lokasi saya"): pindahkan pin dan peta.
  useEffect(() => {
    if (value) place.current?.(value, true);
  }, [value]);

  return <div ref={el} className="map-box" style={{ height }} role="application" aria-label="Peta: geser pin ke lokasi" />;
}
