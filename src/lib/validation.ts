/** Mengubah 0812..., +62812..., 812... menjadi 62812...; null jika tidak valid. */
export function normalizeWhatsapp(input: string): string | null {
  let d = input.replace(/\D/g, '');
  if (d.startsWith('0')) d = '62' + d.slice(1);
  else if (d.startsWith('8')) d = '62' + d;
  return /^62\d{8,13}$/.test(d) ? d : null;
}

export const SOCIAL_PLATFORMS = ['instagram', 'tiktok', 'facebook', 'youtube', 'website'] as const;
export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];

const HANDLE_BASE: Partial<Record<SocialPlatform, string>> = {
  instagram: 'https://instagram.com/',
  tiktok: 'https://www.tiktok.com/@',
};

/** Menerima URL atau @username. Hanya http(s) yang diterima. Mengembalikan undefined jika tidak valid, null jika kosong. */
export function normalizeSocial(platform: SocialPlatform, raw: string): string | null | undefined {
  const v = raw.trim();
  if (!v) return null;
  const base = HANDLE_BASE[platform];
  if (base && /^@?[A-Za-z0-9._]{1,40}$/.test(v)) return base + v.replace(/^@/, '');
  try {
    const u = new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return undefined;
    if (!u.hostname.includes('.')) return undefined;
    const href = u.toString();
    return href.length <= 300 ? href : undefined;
  } catch {
    return undefined;
  }
}

export const SOCIAL_LABEL: Record<SocialPlatform, string> = {
  instagram: 'Instagram', tiktok: 'TikTok', facebook: 'Facebook', youtube: 'YouTube', website: 'Website',
};

/** "85.000" atau "85000" -> 85000. Kosong -> null. Tidak valid -> undefined. */
export function parseRupiah(raw: string, max = 1_000_000_000): number | null | undefined {
  const v = raw.trim();
  if (!v) return null;
  if (!/^\d{1,3}(\.\d{3})*$|^\d+$/.test(v)) return undefined;
  const n = Number(v.replace(/\./g, ''));
  return Number.isSafeInteger(n) && n <= max ? n : undefined;
}

/** "2,5" atau "2.5" -> 2.5 (maksimal 2 desimal). Tidak valid atau di luar rentang -> undefined. */
export function parseDecimal(raw: string, min: number, max: number): number | undefined {
  const v = raw.trim().replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(v)) return undefined;
  const n = Number(v);
  return n >= min && n <= max ? n : undefined;
}
