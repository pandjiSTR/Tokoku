import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

// prepare:false wajib untuk Supabase transaction pooler.
// max kecil karena Cloud Run dapat menjalankan banyak instance.
const client = postgres(process.env.DATABASE_URL!, { prepare: false, max: 3 });

export const db = drizzle(client, { schema });
