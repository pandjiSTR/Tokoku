const R = 6371; // radius bumi (km)
const toRad = (d: number) => (d * Math.PI) / 180;

/** Jarak garis lurus (km) antara dua titik koordinat. */
export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Kotak batas wilayah Indonesia (kasar): menolak koordinat sembarang dari klien.
export function isValidCoord(lat: unknown, lng: unknown): lat is number {
  return typeof lat === 'number' && typeof lng === 'number' && Number.isFinite(lat) && Number.isFinite(lng)
    && lat >= -11.5 && lat <= 6.5 && lng >= 94 && lng <= 141.5;
}

/** Jarak efektif = jarak Haversine x faktor koreksi (selisih jarak lurus dan jarak jalan), dibulatkan 2 desimal. */
export function effectiveDistanceKm(haversine: number, correction: number): number {
  return Math.round(haversine * correction * 100) / 100;
}

export type Tier = { upToKm: number; price: number };

/** Tarif berjenjang: tier pertama yang batasnya >= jarak. Di luar radius maksimal atau tier terakhir: tidak dilayani. */
export function resolveLocalFee(effKm: number, tiers: Tier[], maxRadiusKm: number): { price: number; tierUpToKm: number } | null {
  if (!(effKm <= maxRadiusKm)) return null;
  const hit = [...tiers].sort((a, b) => a.upToKm - b.upToKm).find((t) => effKm <= t.upToKm);
  return hit ? { price: hit.price, tierUpToKm: hit.upToKm } : null;
}
