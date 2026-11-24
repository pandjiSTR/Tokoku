import type { PgTransaction } from 'drizzle-orm/pg-core';
import type * as schema from '@/db/schema';

// Dipakai bersama oleh postgres-js (aplikasi) dan PGlite (tes).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type PgTx = PgTransaction<any, typeof schema, any>;

// postgres-js mengembalikan array, PGlite mengembalikan { rows }.
export function rowsOf<T>(res: unknown): T[] {
  return (Array.isArray(res) ? res : (res as { rows: T[] }).rows) as T[];
}

export function errCode(e: unknown): string | undefined {
  const x = e as { code?: string; cause?: { code?: string } };
  return x?.code ?? x?.cause?.code;
}
