export type RateData = {
  rates: { cityCode: string; price: number; active: boolean }[];
  groups: { id: string; name: string; price: number }[];
  areas: { groupId: string; cityCode: string }[];
  def: { price: number; active: boolean } | null;
};

export type ResolvedRate = { price: number; source: 'city' | 'group' | 'default'; label: string };

/**
 * Urutan pencocokan tarif ekspedisi:
 * 1) tarif khusus kota/kabupaten, 2) tarif grup, 3) tarif default toko, 4) tidak ada (pembeli diarahkan ke WhatsApp).
 */
export function resolveShippingRate(cityCode: string, d: RateData): ResolvedRate | null {
  const city = d.rates.find((r) => r.cityCode === cityCode);
  if (city) return city.active ? { price: city.price, source: 'city', label: 'Tarif kota' } : null;
  const area = d.areas.find((a) => a.cityCode === cityCode);
  const group = area && d.groups.find((g) => g.id === area.groupId);
  if (group) return { price: group.price, source: 'group', label: group.name };
  if (d.def?.active) return { price: d.def.price, source: 'default', label: 'Tarif standar' };
  return null;
}
