export const SECTION_IDS = ['banner', 'categories', 'featured_products', 'about', 'contact'] as const;
export type SectionId = (typeof SECTION_IDS)[number];
export const SECTION_LABEL: Record<SectionId, string> = {
  banner: 'Banner promosi', categories: 'Kategori', featured_products: 'Produk unggulan', about: 'Tentang toko', contact: 'Kontak',
};

export const THEMES = ['minimal', 'bold'] as const;
export type ThemeId = (typeof THEMES)[number];
export const THEME_LABEL: Record<ThemeId, string> = { minimal: 'Minimal: sederhana dan bersih', bold: 'Bold: mencolok, menonjolkan promosi' };

export const FONTS = ['jakarta', 'serif', 'system'] as const;
export type FontId = (typeof FONTS)[number];
export const FONT_LABEL: Record<FontId, string> = { jakarta: 'Modern (Plus Jakarta Sans)', serif: 'Klasik (serif)', system: 'Sistem' };
const FONT_STACK: Record<FontId, string> = {
  jakarta: "'Plus Jakarta Sans Variable', system-ui, -apple-system, 'Segoe UI', sans-serif",
  serif: "Georgia, 'Times New Roman', serif",
  system: "system-ui, -apple-system, 'Segoe UI', sans-serif",
};

export type ThemeConfig = { theme: ThemeId; brand: string; accent: string; font: FontId; sections: { id: SectionId; visible: boolean }[] };

export const DEFAULT_THEME: ThemeConfig = {
  theme: 'minimal', brand: '#1f5c46', accent: '#f6d58e', font: 'jakarta',
  sections: SECTION_IDS.map((id) => ({ id, visible: true })),
};

const HEX = /^#[0-9a-fA-F]{6}$/;

/** Membaca konfigurasi dari JSON mana pun dengan aman: nilai tidak valid diganti bawaan, bagian beranda selalu lengkap. */
export function parseThemeConfig(raw: unknown): ThemeConfig {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const theme = (THEMES as readonly unknown[]).includes(r.theme) ? (r.theme as ThemeId) : DEFAULT_THEME.theme;
  const brand = typeof r.brand === 'string' && HEX.test(r.brand) ? r.brand.toLowerCase() : DEFAULT_THEME.brand;
  const accent = typeof r.accent === 'string' && HEX.test(r.accent) ? r.accent.toLowerCase() : DEFAULT_THEME.accent;
  const font = (FONTS as readonly unknown[]).includes(r.font) ? (r.font as FontId) : DEFAULT_THEME.font;
  const seen = new Set<SectionId>();
  const sections: ThemeConfig['sections'] = [];
  if (Array.isArray(r.sections)) {
    for (const s of r.sections) {
      const id = (s as { id?: unknown })?.id;
      if (!(SECTION_IDS as readonly unknown[]).includes(id) || seen.has(id as SectionId)) continue;
      seen.add(id as SectionId);
      sections.push({ id: id as SectionId, visible: (s as { visible?: unknown }).visible !== false });
    }
  }
  for (const id of SECTION_IDS) if (!seen.has(id)) sections.push({ id, visible: true });
  return { theme, brand, accent, font, sections };
}

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const lin = (c: number) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
export function luminance(hex: string): number {
  const [r, g, b] = rgb(hex);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
/** Rasio kontras WCAG antara dua warna (1 sampai 21). */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
/** Warna teks (putih atau gelap) yang paling terbaca di atas warna latar. */
export function readableOn(bg: string): '#ffffff' | '#1f1b16' {
  return contrastRatio(bg, '#ffffff') >= contrastRatio(bg, '#1f1b16') ? '#ffffff' : '#1f1b16';
}
export function mix(hex: string, withHex: string, ratio: number): string {
  const a = rgb(hex); const b = rgb(withHex);
  return '#' + a.map((v, i) => Math.round(v * (1 - ratio) + b[i] * ratio).toString(16).padStart(2, '0')).join('');
}

/** Warna utama yang digelapkan secukupnya agar terbaca sebagai TEKS di atas putih (kontras minimal 4,5:1). */
export function ensureInk(hex: string): string {
  let c = hex;
  for (let i = 0; i < 20 && contrastRatio(c, '#ffffff') < 4.5; i++) c = mix(c, '#000000', 0.1);
  return c;
}

export const MIN_BRAND_CONTRAST = 3;

/**
 * Validasi kontras warna (WCAG 1.4.11): warna utama dipakai sebagai garis tombol dan latar, jadi harus
 * kontras minimal 3:1 terhadap latar putih; warna aksen harus kontras minimal 3:1 terhadap warna utama
 * (tombol aksen di atas banner utama). Mengembalikan pesan galat atau null jika lolos.
 */
export function validateTheme(cfg: Pick<ThemeConfig, 'brand' | 'accent'>): string | null {
  if (contrastRatio(cfg.brand, '#ffffff') < MIN_BRAND_CONTRAST) return 'Warna utama terlalu terang dan kurang kontras dengan latar putih. Pilih warna yang lebih gelap.';
  if (contrastRatio(cfg.brand, cfg.accent) < MIN_BRAND_CONTRAST) return 'Warna aksen terlalu mirip dengan warna utama. Pilih aksen yang lebih kontras.';
  return null;
}

/** Variabel CSS untuk membungkus storefront. Warna teks dipilih otomatis agar tetap terbaca. */
export function themeVars(cfg: ThemeConfig): Record<string, string> {
  return {
    '--brand': cfg.brand, '--brand-hover': mix(cfg.brand, '#000000', 0.15), '--brand-soft': mix(cfg.brand, '#ffffff', 0.85),
    '--brand-contrast': readableOn(cfg.brand), '--brand-ink': ensureInk(cfg.brand), '--accent': cfg.accent, '--accent-ink': readableOn(cfg.accent),
    '--font': FONT_STACK[cfg.font],
  };
}

// Pratinjau langsung: konfigurasi dikirim lewat parameter ?pv= (base64url JSON) dan hanya berlaku untuk anggota toko.
export const encodePreview = (cfg: ThemeConfig) => Buffer.from(JSON.stringify(cfg), 'utf8').toString('base64url');
export function decodePreview(pv: string | null | undefined): ThemeConfig | null {
  if (!pv || pv.length > 1500) return null;
  try { return parseThemeConfig(JSON.parse(Buffer.from(pv, 'base64url').toString('utf8'))); } catch { return null; }
}
