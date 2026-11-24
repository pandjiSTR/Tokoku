import 'server-only';
import { headers } from 'next/headers';
import { checkLimit } from '@/lib/rate-limit-core';

/**
 * Kunci klien. Header X-Forwarded-For hanya dipercaya jika TRUST_PROXY=true, yaitu saat aplikasi berada di
 * belakang Caddy yang menimpa header itu. Tanpa proxy, header dapat dipalsukan klien, sehingga semua
 * permintaan dihitung dalam satu keranjang bersama (batas global tetap melindungi layanan).
 */
export async function clientKey(): Promise<string> {
  if (process.env.TRUST_PROXY !== 'true') return 'direct';
  const xff = (await headers()).get('x-forwarded-for');
  return xff?.split(',')[0]?.trim().slice(0, 64) || 'direct';
}

export type Guard = { ok: true } | { ok: false; retryAfter: number };

/** Batasi per klien: `scope` + IP. Contoh: rateGuard('login', 10, 600) = 10 percobaan per 10 menit. */
export async function rateGuard(scope: string, limit: number, windowSec: number, subject?: string): Promise<Guard> {
  const key = `${scope}:${subject ?? (await clientKey())}`;
  return checkLimit(key, limit, windowSec);
}

export const TOO_MANY = 'Terlalu banyak percobaan. Coba lagi dalam beberapa menit.';
