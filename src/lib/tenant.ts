import { and, eq, type SQL } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';
import { db } from '@/db';
import { stores } from '@/db/schema';

export type TenantHint = { pathname?: string; host?: string };

function slugFromPath(pathname?: string): string | null {
  const m = pathname?.match(/^\/s\/([a-z0-9-]+)/);
  return m ? m[1] : null;
}

// Untuk dev lokal: namatoko.localhost:3000. Kelak dapat dipakai untuk subdomain produksi.
function slugFromHost(host?: string): string | null {
  const m = host?.match(/^([a-z0-9-]+)\.localhost(:\d+)?$/);
  return m ? m[1] : null;
}

/** Satu-satunya tempat yang tahu cara menentukan toko. MVP: path; nanti: subdomain. */
export async function resolveTenant(hint: TenantHint) {
  const slug = slugFromPath(hint.pathname) ?? slugFromHost(hint.host);
  if (!slug) return null;
  const [store] = await db.select().from(stores).where(eq(stores.slug, slug)).limit(1);
  return store ?? null;
}

/** Helper query tenant: selalu tambahkan filter store_id agar tidak ada query yang lupa. */
export function forStore(storeIdColumn: PgColumn, storeId: string, ...extra: (SQL | undefined)[]) {
  return and(eq(storeIdColumn, storeId), ...extra);
}
