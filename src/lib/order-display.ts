export const methodLabel: Record<string, string> = { courier: 'Ekspedisi', local: 'Kurir toko', pickup: 'Ambil di toko' };

export function addressLine(o: { address: string | null; districtName: string | null; cityName: string | null; provinceName: string | null }) {
  return [o.address, o.districtName, o.cityName, o.provinceName].filter(Boolean).join(', ');
}
