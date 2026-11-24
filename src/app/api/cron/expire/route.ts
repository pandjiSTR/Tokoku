import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/db';
import { rowsOf } from '@/lib/pg';

export const dynamic = 'force-dynamic';

/**
 * Pekerjaan terjadwal (timer di VM, tiap 5 menit): mengubah pesanan yang lewat batas bayar menjadi kedaluwarsa
 * dan mengembalikan stoknya. Dilindungi rahasia CRON_SECRET; tanpa rahasia terpasang, endpoint ini tidak ada.
 */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return new NextResponse(null, { status: 404 });
  const got = Buffer.from(req.headers.get('x-cron-secret') ?? '');
  const want = Buffer.from(secret);
  if (got.length !== want.length || !timingSafeEqual(got, want)) return new NextResponse(null, { status: 401 });

  const n = rowsOf<{ n: number }>(await db.execute(sql`select app_expire_all_stale_orders() as n`))[0]?.n ?? 0;
  return NextResponse.json({ expired: n });
}
