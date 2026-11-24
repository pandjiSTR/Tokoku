import { describe, expect, it } from 'vitest';
import { isValidSlug, toSlug } from '@/lib/slug';
import { normalizeSocial, normalizeWhatsapp, parseRupiah } from '@/lib/validation';
import { formatRupiah } from '@/lib/format';
import { parseTenantSlug } from '@/lib/tenant';

describe('slug', () => {
  it('menolak slug yang dicadangkan dan format salah', () => {
    for (const s of ['admin', 'api', 'www', 'dashboard', 'ab', '-abc', 'Abc', 'a_b']) expect(isValidSlug(s)).toBe(false);
  });
  it('menerima slug yang benar', () => {
    expect(isValidSlug('kopi-senja')).toBe(true);
    expect(toSlug('  Kopi Senja!! ')).toBe('kopi-senja');
  });
});

describe('resolveTenant: pembacaan slug', () => {
  it('dari path /s/slug', () => {
    expect(parseTenantSlug({ pathname: '/s/kopi-senja/produk' })).toBe('kopi-senja');
  });
  it('dari subdomain localhost', () => {
    expect(parseTenantSlug({ host: 'kopi-senja.localhost:3000' })).toBe('kopi-senja');
  });
  it('null untuk jalur lain', () => {
    expect(parseTenantSlug({ pathname: '/dashboard' })).toBeNull();
    expect(parseTenantSlug({ host: 'localhost:3000' })).toBeNull();
  });
});

describe('normalizeWhatsapp', () => {
  it('mengubah ke format internasional', () => {
    expect(normalizeWhatsapp('0812-3456-7890')).toBe('6281234567890');
    expect(normalizeWhatsapp('+62 812 3456 7890')).toBe('6281234567890');
    expect(normalizeWhatsapp('81234567890')).toBe('6281234567890');
  });
  it('menolak nomor tidak valid', () => {
    expect(normalizeWhatsapp('123')).toBeNull();
    expect(normalizeWhatsapp('abc')).toBeNull();
  });
});

describe('normalizeSocial', () => {
  it('menerima @username dan URL', () => {
    expect(normalizeSocial('instagram', '@kopisenja')).toBe('https://instagram.com/kopisenja');
    expect(normalizeSocial('website', 'kopisenja.id')).toBe('https://kopisenja.id/');
  });
  it('kosong menjadi null', () => {
    expect(normalizeSocial('tiktok', '  ')).toBeNull();
  });
  it('menolak skema berbahaya', () => {
    expect(normalizeSocial('website', 'javascript:alert(1)')).toBeUndefined();
    expect(normalizeSocial('website', 'ftp://x.com')).toBeUndefined();
  });
});

describe('format dan parse rupiah', () => {
  it('memformat rupiah', () => {
    expect(formatRupiah(85000)).toBe('Rp85.000');
    expect(formatRupiah(0)).toBe('Rp0');
    expect(formatRupiah(1250000)).toBe('Rp1.250.000');
  });
  it('mem-parse input rupiah', () => {
    expect(parseRupiah('85000')).toBe(85000);
    expect(parseRupiah('85.000')).toBe(85000);
    expect(parseRupiah('')).toBeNull();
    expect(parseRupiah('12,5')).toBeUndefined();
    expect(parseRupiah('-5')).toBeUndefined();
    expect(parseRupiah('9999999999')).toBeUndefined();
  });
  it('slug produk memakai batas panjang sendiri', () => {
    expect(toSlug('Arabika Gayo 250 g', 60)).toBe('arabika-gayo-250-g');
    expect(toSlug('a'.repeat(100), 60).length).toBe(60);
  });
});

import { parseProductForm } from '@/lib/product-form';

const form = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };
const base = { name: 'Arabika Gayo', price: '85.000', stock: '10', status: 'active' };

describe('parseProductForm', () => {
  it('menerima isian yang benar', () => {
    const r = parseProductForm(form({ ...base, comparePrice: '105000', weightGram: '250', featured: 'on' }));
    expect(r.ok && r.data).toMatchObject({ price: 85000, comparePrice: 105000, stock: 10, weightGram: 250, featured: true, status: 'active' });
  });
  it('menolak harga kosong, harga coret lebih kecil, dan status asing', () => {
    expect(parseProductForm(form({ ...base, price: '' })).ok).toBe(false);
    expect(parseProductForm(form({ ...base, comparePrice: '50000' })).ok).toBe(false);
    expect(parseProductForm(form({ ...base, status: 'hacked' })).ok).toBe(false);
  });
  it('stok kosong dianggap 0 dan kategori harus UUID', () => {
    const r = parseProductForm(form({ ...base, stock: '' }));
    expect(r.ok && r.data.stock).toBe(0);
    expect(parseProductForm(form({ ...base, categoryId: 'bukan-uuid' })).ok).toBe(false);
  });
});

import { resolveShippingRate, type RateData } from '@/lib/shipping';
import { addItem, parseCart } from '@/lib/cart';
import { hashToken, newOrderToken, TOKEN_RE } from '@/lib/orders';

describe('resolveShippingRate: urutan pencocokan tarif', () => {
  const d: RateData = {
    rates: [{ cityCode: '32.73', price: 18000, active: true }, { cityCode: '32.04', price: 99000, active: false }],
    groups: [{ id: 'g1', name: 'Jawa Barat', price: 25000 }],
    areas: [{ groupId: 'g1', cityCode: '32.01' }, { groupId: 'g1', cityCode: '32.73' }, { groupId: 'g1', cityCode: '32.04' }],
    def: { price: 40000, active: true },
  };
  it('tarif kota mengalahkan grup dan default', () => expect(resolveShippingRate('32.73', d)).toMatchObject({ price: 18000, source: 'city' }));
  it('tarif grup mengalahkan default', () => expect(resolveShippingRate('32.01', d)).toMatchObject({ price: 25000, source: 'group' }));
  it('default dipakai jika tidak ada tarif khusus', () => expect(resolveShippingRate('11.01', d)).toMatchObject({ price: 40000, source: 'default' }));
  it('kota yang dinonaktifkan tidak dilayani (tidak jatuh ke grup/default)', () => expect(resolveShippingRate('32.04', d)).toBeNull());
  it('tanpa default aktif, kota lain tidak dilayani', () => expect(resolveShippingRate('11.01', { ...d, def: { price: 1, active: false } })).toBeNull());
});

describe('keranjang', () => {
  const id = 'd0000000-0000-0000-0000-0000000000a1';
  it('mengabaikan data cookie yang rusak atau berbahaya', () => {
    expect(parseCart('bukan json')).toEqual([]);
    expect(parseCart(JSON.stringify([{ p: 'x', q: 1 }, { p: id, q: -3 }, { p: id, q: 1.5 }, null, 7]))).toEqual([]);
  });
  it('menggabungkan produk sama dan membatasi jumlah', () => {
    expect(parseCart(JSON.stringify([{ p: id, q: 2 }, { p: id, q: 500 }]))).toEqual([{ p: id, q: 99 }]);
    expect(addItem([{ p: id, q: 2 }], id, 3)).toEqual([{ p: id, q: 5 }]);
  });
});

describe('token pesanan', () => {
  it('acak, 43 karakter, dan hanya hash yang disimpan', () => {
    const a = newOrderToken(); const b = newOrderToken();
    expect(TOKEN_RE.test(a.token)).toBe(true);
    expect(a.token).not.toBe(b.token);
    expect(a.hash).toBe(hashToken(a.token));
    expect(a.hash).not.toContain(a.token);
  });
});

import { buyerOrderCreated, buyerStatus, ownerNewOrder } from '@/lib/messages';

describe('pesan notifikasi', () => {
  const o = { orderNumber: 'TK-1001', total: 188287, buyerName: 'Rina' };
  it('email pemilik memuat nomor pesanan dan nominal', () => {
    const m = ownerNewOrder('Kopi Senja', o, 'http://x/dashboard/s/pesanan');
    expect(m.subject).toContain('TK-1001');
    expect(m.text).toContain('Rp188.287');
  });
  it('email penolakan memuat alasan dan tidak membuat tautan token', () => {
    const m = buyerStatus('Kopi Senja', 'rejected', o, null, 'Mutasi tidak ditemukan');
    expect(m?.text).toContain('Mutasi tidak ditemukan');
    expect(m?.text).not.toContain('http');
  });
  it('status tanpa pesan (mis. menunggu verifikasi) tidak mengirim email', () => {
    expect(buyerStatus('K', 'awaiting_verification', o, null)).toBeNull();
  });
  it('email pesanan dibuat menyertakan tautan status bila tersedia', () => {
    expect(buyerOrderCreated('K', o, 'http://x/s/k/pesanan/abc').text).toContain('http://x/s/k/pesanan/abc');
  });
});

import { effectiveDistanceKm, haversineKm, isValidCoord, resolveLocalFee } from '@/lib/geo';
import { contrastRatio, DEFAULT_THEME, decodePreview, encodePreview, mix, parseThemeConfig, readableOn, themeVars } from '@/lib/theme';

describe('geo: Haversine dan tarif berjenjang', () => {
  it('jarak Monas - Gedung Sate sekitar 119 km, simetris, dan nol untuk titik sama', () => {
    const d = haversineKm(-6.1754, 106.8272, -6.9025, 107.6186);
    expect(d).toBeGreaterThan(115);
    expect(d).toBeLessThan(123);
    expect(haversineKm(-6.9025, 107.6186, -6.1754, 106.8272)).toBeCloseTo(d, 6);
    expect(haversineKm(-6.2, 106.8, -6.2, 106.8)).toBe(0);
  });
  it('faktor koreksi 1,3 dan pembulatan', () => {
    expect(effectiveDistanceKm(2, 1.3)).toBe(2.6);
    expect(effectiveDistanceKm(7.6923, 1.3)).toBe(10);
  });
  const tiers = [{ upToKm: 10, price: 18000 }, { upToKm: 3, price: 8000 }, { upToKm: 6, price: 12000 }];
  it('memilih tier pertama yang cukup (tier tidak harus berurutan)', () => {
    expect(resolveLocalFee(0, tiers, 10)?.price).toBe(8000);
    expect(resolveLocalFee(3, tiers, 10)?.price).toBe(8000);
    expect(resolveLocalFee(3.01, tiers, 10)?.price).toBe(12000);
    expect(resolveLocalFee(10, tiers, 10)?.price).toBe(18000);
  });
  it('menolak di luar radius maksimal, di luar tier terakhir, atau nilai tidak valid', () => {
    expect(resolveLocalFee(10.01, tiers, 10)).toBeNull();
    expect(resolveLocalFee(9, tiers, 8)).toBeNull();
    expect(resolveLocalFee(8, [{ upToKm: 5, price: 1 }], 10)).toBeNull();
    expect(resolveLocalFee(Number.NaN, tiers, 10)).toBeNull();
  });
  it('validasi koordinat: hanya wilayah Indonesia dan angka yang sah', () => {
    expect(isValidCoord(-6.2, 106.8)).toBe(true);
    expect(isValidCoord(0, 0)).toBe(false);
    expect(isValidCoord('a', 1)).toBe(false);
    expect(isValidCoord(Number.NaN, 106)).toBe(false);
    expect(isValidCoord(48.8, 2.3)).toBe(false);
  });
});

describe('tema toko', () => {
  it('nilai rusak diganti bawaan dan bagian beranda selalu lengkap tanpa duplikat', () => {
    const t = parseThemeConfig({ brand: 'merah', accent: '#ABCDEF', font: 'comic', sections: [{ id: 'about', visible: false }, { id: 'about' }, { id: 'hack' }] });
    expect(t.brand).toBe(DEFAULT_THEME.brand);
    expect(t.accent).toBe('#abcdef');
    expect(t.font).toBe('jakarta');
    expect(t.sections.map((s) => s.id)).toEqual(['about', 'banner', 'categories', 'featured_products', 'contact']);
    expect(t.sections[0].visible).toBe(false);
    expect(parseThemeConfig(null)).toEqual(DEFAULT_THEME);
  });
  it('teks dipilih otomatis agar terbaca', () => {
    expect(readableOn('#ffffff')).toBe('#1f1b16');
    expect(readableOn('#000000')).toBe('#ffffff');
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 0);
    expect(contrastRatio(DEFAULT_THEME.brand, readableOn(DEFAULT_THEME.brand))).toBeGreaterThan(4.5);
    expect(mix('#000000', '#ffffff', 0.5)).toBe('#808080');
  });
  it('variabel CSS lengkap dan pratinjau dapat dienkode-dekode', () => {
    const v = themeVars(DEFAULT_THEME);
    for (const k of ['--brand', '--brand-hover', '--brand-soft', '--brand-contrast', '--brand-ink', '--accent', '--accent-ink', '--font']) expect(v[k]).toBeTruthy();
    expect(decodePreview(encodePreview(DEFAULT_THEME))).toEqual(DEFAULT_THEME);
    expect(decodePreview('bukan-base64-json')).toBeNull();
    expect(decodePreview('a'.repeat(2000))).toBeNull();
  });
});

import { parseWibInput, toWibInput } from '@/lib/format';
describe('input waktu WIB', () => {
  it('mengubah datetime-local WIB ke UTC dan sebaliknya', () => {
    const d = parseWibInput('2026-11-08T14:30');
    expect(d?.toISOString()).toBe('2026-11-08T07:30:00.000Z');
    expect(toWibInput(d)).toBe('2026-11-08T14:30');
  });
  it('kosong menjadi null, format salah menjadi undefined', () => {
    expect(parseWibInput('')).toBeNull();
    expect(parseWibInput('besok')).toBeUndefined();
    expect(toWibInput(null)).toBe('');
  });
});

import { parseDecimal } from '@/lib/validation';
describe('parseDecimal', () => {
  it('menerima koma dan titik, menolak di luar rentang atau format salah', () => {
    expect(parseDecimal('2,5', 0.5, 50)).toBe(2.5);
    expect(parseDecimal('10', 0.5, 50)).toBe(10);
    expect(parseDecimal('0,1', 0.5, 50)).toBeUndefined();
    expect(parseDecimal('51', 0.5, 50)).toBeUndefined();
    expect(parseDecimal('1.234', 0.5, 50)).toBeUndefined();
    expect(parseDecimal('abc', 0.5, 50)).toBeUndefined();
  });
});

describe('tema bawaan konsisten dengan pembaca konfigurasi', () => {
  it('konfigurasi kosong atau bawaan yang disimpan dibaca kembali identik (tidak dianggap "sudah disesuaikan")', () => {
    expect(parseThemeConfig({})).toEqual(DEFAULT_THEME);
    expect(parseThemeConfig(DEFAULT_THEME)).toEqual(DEFAULT_THEME);
    expect(parseThemeConfig({ brand: '#1F5C46' }).brand).toBe(DEFAULT_THEME.brand);
  });
});

import { ensureInk, THEMES, validateTheme } from '@/lib/theme';
describe('validasi kontras warna', () => {
  it('warna bawaan lolos', () => expect(validateTheme(DEFAULT_THEME)).toBeNull());
  it('warna utama terlalu terang ditolak (kuning pucat di atas putih)', () => {
    expect(validateTheme({ brand: '#ffeb3b', accent: '#000000' })).toMatch(/terlalu terang/);
    expect(validateTheme({ brand: '#ffffff', accent: '#000000' })).toMatch(/terlalu terang/);
  });
  it('aksen yang terlalu mirip warna utama ditolak', () => {
    expect(validateTheme({ brand: '#1f5c46', accent: '#206048' })).toMatch(/mirip/);
  });
  it('warna gelap dan kontras lolos', () => expect(validateTheme({ brand: '#7a1f2b', accent: '#ffd166' })).toBeNull());
  it('warna teks turunan selalu terbaca di atas putih (4,5:1)', () => {
    for (const c of ['#1f5c46', '#ffeb3b', '#ff9800', '#9e9e9e', '#00bcd4', '#f6d58e', '#ffffff']) {
      expect(contrastRatio(ensureInk(c), '#ffffff')).toBeGreaterThanOrEqual(4.5);
    }
    expect(ensureInk('#1f5c46')).toBe('#1f5c46');
  });
  it('tema dibaca dari konfigurasi dan jatuh ke bawaan jika asing', () => {
    expect(THEMES).toContain('bold');
    expect(parseThemeConfig({ theme: 'bold' }).theme).toBe('bold');
    expect(parseThemeConfig({ theme: 'neon' }).theme).toBe('minimal');
  });
});
