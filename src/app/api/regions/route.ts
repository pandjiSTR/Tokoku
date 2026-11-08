import { NextResponse } from 'next/server';
import { asc, eq } from 'drizzle-orm';
import { asAnon } from '@/db';
import { regions } from '@/db/schema';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const parent = new URL(req.url).searchParams.get('parent') ?? '';
  if (!/^\d{2}$|^\d{2}\.\d{2}$/.test(parent)) return NextResponse.json({ error: 'parent tidak valid' }, { status: 400 });
  const rows = await asAnon((tx) =>
    tx.select({ code: regions.code, name: regions.name }).from(regions)
      .where(eq(regions.parentCode, parent)).orderBy(asc(regions.name)),
  );
  return NextResponse.json(rows);
}
