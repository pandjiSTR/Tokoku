import { eq, sql } from 'drizzle-orm';
import { shippingLocalOptions, shippingLocalTiers } from '@/db/schema';
import { effectiveDistanceKm, haversineKm, isValidCoord, resolveLocalFee } from '@/lib/geo';
import { rowsOf, type PgTx } from '@/lib/pg';

export type LocalQuote =
  | { available: true; price: number; distanceKm: number; tierUpToKm: number }
  | { available: false; reason: 'invalid' | 'disabled' | 'no_location' | 'out_of_radius' };

/**
 * Ongkir kurir toko. Dijalankan di server (role app_buyer). Koordinat toko dibaca lewat fungsi
 * app_store_location dan TIDAK PERNAH dikirim ke browser; browser hanya menerima harga dan jarak.
 */
export async function quoteLocal(tx: PgTx, storeId: string, lat: unknown, lng: unknown): Promise<LocalQuote> {
  if (!isValidCoord(lat, lng)) return { available: false, reason: 'invalid' };
  const [opt] = await tx.select().from(shippingLocalOptions).where(eq(shippingLocalOptions.storeId, storeId)).limit(1);
  if (!opt?.enabled) return { available: false, reason: 'disabled' };

  const loc = rowsOf<{ lat: number; lng: number }>(await tx.execute(sql`select lat, lng from app_store_location(${storeId}::uuid)`))[0];
  if (!loc) return { available: false, reason: 'no_location' };

  const tiers = (await tx.select().from(shippingLocalTiers).where(eq(shippingLocalTiers.storeId, storeId)))
    .map((t) => ({ upToKm: Number(t.upToKm), price: t.price }));
  const km = effectiveDistanceKm(haversineKm(loc.lat, loc.lng, lat, lng as number), Number(opt.correction));
  const fee = resolveLocalFee(km, tiers, Number(opt.maxRadiusKm));
  if (!fee) return { available: false, reason: 'out_of_radius' };
  return { available: true, price: fee.price, distanceKm: km, tierUpToKm: fee.tierUpToKm };
}
