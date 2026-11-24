import 'server-only';
import { cache } from 'react';
import { headers } from 'next/headers';
import { and, eq } from 'drizzle-orm';
import { asAnon, asUser } from '@/db';
import { storeMembers, storeSettings } from '@/db/schema';
import { createClient } from '@/lib/supabase/server';
import { decodePreview, parseThemeConfig, type ThemeConfig } from '@/lib/theme';

const isMember = cache(async (storeId: string) => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const rows = await asUser(user.id, (tx) =>
    tx.select({ id: storeMembers.id }).from(storeMembers).where(and(eq(storeMembers.storeId, storeId), eq(storeMembers.userId, user.id))).limit(1));
  return rows.length > 0;
});

/** Tema yang berlaku. Pratinjau (?pv=) hanya diterapkan untuk anggota toko yang sedang login. */
export const getStoreTheme = cache(async (storeId: string): Promise<{ theme: ThemeConfig; preview: boolean }> => {
  const pv = decodePreview((await headers()).get('x-theme-preview'));
  if (pv && (await isMember(storeId))) return { theme: pv, preview: true };
  const [row] = await asAnon((tx) => tx.select({ config: storeSettings.config }).from(storeSettings).where(eq(storeSettings.storeId, storeId)).limit(1));
  return { theme: parseThemeConfig(row?.config), preview: false };
});
