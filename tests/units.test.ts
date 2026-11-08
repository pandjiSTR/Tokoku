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
