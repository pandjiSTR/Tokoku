import { PGlite, type Transaction } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Database PostgreSQL asli (WASM) dengan seluruh migrasi proyek diterapkan. */
export async function createTestDb() {
  const pg = new PGlite();
  const dir = join(process.cwd(), 'drizzle');
  const journal = JSON.parse(readFileSync(join(dir, 'meta/_journal.json'), 'utf8')) as { entries: { tag: string }[] };
  for (const { tag } of journal.entries) {
    const sql = readFileSync(join(dir, `${tag}.sql`), 'utf8');
    for (const stmt of sql.split('--> statement-breakpoint')) {
      if (stmt.trim()) await pg.exec(stmt);
    }
  }
  return pg;
}

/** Meniru asUser()/asAnon() di src/db/index.ts: satu transaksi dengan role dan identitas. */
export function asRole<T>(pg: PGlite, role: 'app_user' | 'app_anon', userId: string | null, fn: (tx: Transaction) => Promise<T>) {
  return pg.transaction(async (tx) => {
    if (userId) await tx.query(`select set_config('app.user_id', $1, true)`, [userId]);
    await tx.exec(`set local role ${role}`);
    return fn(tx);
  });
}

/** Pembeli tanpa akun: role app_buyer dengan token pesanan (hash) sebagai identitas. */
export function asBuyer<T>(pg: PGlite, tokenHash: string | null, fn: (tx: Transaction) => Promise<T>) {
  return pg.transaction(async (tx) => {
    if (tokenHash) await tx.query(`select set_config('app.order_token_hash', $1, true)`, [tokenHash]);
    await tx.exec('set local role app_buyer');
    return fn(tx);
  });
}
