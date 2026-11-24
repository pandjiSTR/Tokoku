type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();
let lastSweep = 0;

/** Jendela tetap: maksimal `limit` kejadian per `windowSec` untuk setiap kunci. Tersimpan di memori satu proses. */
export function checkLimit(key: string, limit: number, windowSec: number, now = Date.now()): { ok: true } | { ok: false; retryAfter: number } {
  if (now - lastSweep > 60_000) {
    lastSweep = now;
    for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
    if (buckets.size > 50_000) buckets.clear(); // pengaman memori (VM hanya 1 GB)
  }
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowSec * 1000 });
    return { ok: true };
  }
  if (b.count >= limit) return { ok: false, retryAfter: Math.ceil((b.resetAt - now) / 1000) };
  b.count += 1;
  return { ok: true };
}

export const _resetRateLimits = () => buckets.clear();
