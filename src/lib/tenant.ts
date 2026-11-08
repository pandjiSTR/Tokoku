import { cache } from 'react';
import { notFound } from 'next/navigation';
import { and, eq, type SQL } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';
import { asAnon } from '@/db';
import { socialLinks, stores } from '@/db/schema';

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

export function parseTenantSlug(hint: TenantHint): string | null {
  return slugFromPath(hint.pathname) ?? slugFromHost(hint.host);
}

/** Satu-satunya tempat yang tahu cara menentukan toko. MVP: path; nanti: subdomain. */
export async function resolveTenant(hint: TenantHint) {
  const slug = parseTenantSlug(hint);
  if (!slug) return null;
  const [store] = await asAnon((tx) => tx.select().from(stores).where(eq(stores.slug, slug)).limit(1));
  return store ?? null;
}

export function getPublicSocials(storeId: string) {
  return asAnon((tx) => tx.select().from(socialLinks).where(eq(socialLinks.storeId, storeId)));
}

/** Helper query tenant: selalu tambahkan filter store_id agar tidak ada query yang lupa. */
export function forStore(storeIdColumn: PgColumn, storeId: string, ...extra: (SQL | undefined)[]) {
  return and(eq(storeIdColumn, storeId), ...extra);
}

/** Toko untuk halaman storefront; 404 jika slug tidak ada. Hasil dipakai bersama oleh layout dan halaman. */
export const getStorefront = cache(async (slug: string) => {
  const store = await resolveTenant({ pathname: `/s/${slug}` });
  if (!store) notFound();
  return store;
});
