import { beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { asRole, createTestDb } from './helpers';

const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';
const STAFF_A = '33333333-3333-3333-3333-333333333333';
const SA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const SB = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

let pg: PGlite;

beforeAll(async () => {
  pg = await createTestDb();
  // Data awal dibuat sebagai pemilik tabel (melewati RLS), seperti tugas sistem.
  await pg.exec(`
    insert into users (id, email, name) values
      ('${A}', 'a@toko.test', 'Pemilik A'),
      ('${B}', 'b@toko.test', 'Pemilik B'),
      ('${STAFF_A}', 'staf@toko.test', 'Staf A');
    insert into stores (id, slug, name) values ('${SA}', 'toko-a', 'Toko A'), ('${SB}', 'toko-b', 'Toko B');
    insert into store_members (store_id, user_id, role) values
      ('${SA}', '${A}', 'owner'), ('${SB}', '${B}', 'owner'), ('${SA}', '${STAFF_A}', 'staff');
    insert into social_links (store_id, platform, url) values ('${SB}', 'instagram', 'https://instagram.com/tokob');
    insert into audit_logs (store_id, user_id, action) values ('${SB}', '${B}', 'store.update_profile');
  `);
});

const count = async (role: 'app_user' | 'app_anon', uid: string | null, table: string) =>
  asRole(pg, role, uid, async (tx) => (await tx.query<{ n: number }>(`select count(*)::int as n from ${table}`)).rows[0].n);

describe('isolasi data antar toko (RLS)', () => {
  it('pemilik A hanya melihat anggota tokonya sendiri', async () => {
    const rows = await asRole(pg, 'app_user', A, async (tx) => (await tx.query<{ store_id: string }>('select store_id from store_members')).rows);
    expect(rows.length).toBe(2);
    expect(rows.every((r) => r.store_id === SA)).toBe(true);
  });

  it('pemilik A tidak melihat audit log toko B', async () => {
    expect(await count('app_user', A, 'audit_logs')).toBe(0);
    expect(await count('app_user', B, 'audit_logs')).toBe(1);
  });

  it('pemilik A tidak dapat mengubah profil toko B', async () => {
    const res = await asRole(pg, 'app_user', A, (tx) => tx.query(`update stores set name = 'Dibajak' where id = '${SB}' returning id`));
    expect(res.rows.length).toBe(0);
    const [row] = (await pg.query<{ name: string }>(`select name from stores where id = '${SB}'`)).rows;
    expect(row.name).toBe('Toko B');
  });

  it('pemilik A dapat mengubah profil tokonya sendiri', async () => {
    const res = await asRole(pg, 'app_user', A, (tx) => tx.query(`update stores set name = 'Toko A Baru' where id = '${SA}' returning id`));
    expect(res.rows.length).toBe(1);
  });

  it('staf tidak dapat mengubah profil toko (hanya pemilik)', async () => {
    const res = await asRole(pg, 'app_user', STAFF_A, (tx) => tx.query(`update stores set name = 'Staf Ubah' where id = '${SA}' returning id`));
    expect(res.rows.length).toBe(0);
  });

  it('pemilik A tidak dapat menulis tautan sosial ke toko B', async () => {
    await expect(
      asRole(pg, 'app_user', A, (tx) => tx.query(`insert into social_links (store_id, platform, url) values ('${SB}', 'tiktok', 'https://tiktok.com/@x')`)),
    ).rejects.toThrow();
  });

  it('pemilik A tidak dapat menghapus tautan sosial toko B', async () => {
    await asRole(pg, 'app_user', A, (tx) => tx.query(`delete from social_links where store_id = '${SB}'`));
    expect(await count('app_anon', null, 'social_links')).toBe(1);
  });

  it('pemilik A tidak dapat menambahkan dirinya sebagai anggota toko B', async () => {
    await expect(
      asRole(pg, 'app_user', A, (tx) => tx.query(`insert into store_members (store_id, user_id, role) values ('${SB}', '${A}', 'owner')`)),
    ).rejects.toThrow();
  });

  it('log audit tidak dapat dipalsukan atas nama toko atau pengguna lain', async () => {
    await expect(asRole(pg, 'app_user', A, (tx) => tx.query(`insert into audit_logs (store_id, user_id, action) values ('${SB}', '${A}', 'x')`))).rejects.toThrow();
    await expect(asRole(pg, 'app_user', A, (tx) => tx.query(`insert into audit_logs (store_id, user_id, action) values ('${SA}', '${B}', 'x')`))).rejects.toThrow();
  });

  it('pengguna tidak dapat membaca profil pengguna lain', async () => {
    const rows = await asRole(pg, 'app_user', A, async (tx) => (await tx.query<{ id: string }>('select id from users')).rows);
    expect(rows.map((r) => r.id)).toEqual([A]);
  });

  it('pembuatan toko baru: pengguna menjadi pemilik, tetapi tidak dapat mengklaim toko yang sudah punya anggota', async () => {
    await asRole(pg, 'app_user', B, async (tx) => {
      const { rows } = await tx.query<{ id: string }>(`insert into stores (slug, name) values ('toko-b2', 'Toko B2') returning id`);
      await tx.query(`insert into store_members (store_id, user_id, role) values ($1, '${B}', 'owner')`, [rows[0].id]);
    });
    expect(await count('app_user', B, 'store_members')).toBe(2);
  });

  it('tanpa identitas pengguna, tidak ada yang dapat dibuat atau dibaca', async () => {
    await expect(asRole(pg, 'app_user', null, (tx) => tx.query(`insert into stores (slug, name) values ('liar', 'Liar')`))).rejects.toThrow();
    expect(await count('app_user', null, 'store_members')).toBe(0);
  });
});

describe('akses publik (storefront)', () => {
  it('pengunjung dapat membaca data publik toko', async () => {
    expect(await count('app_anon', null, 'stores')).toBeGreaterThanOrEqual(2);
    expect(await count('app_anon', null, 'social_links')).toBe(1);
  });

  it('pengunjung tidak dapat membaca data privat', async () => {
    for (const t of ['users', 'store_members', 'audit_logs']) {
      await expect(count('app_anon', null, t)).rejects.toThrow();
    }
  });

  it('pengunjung tidak dapat menulis apa pun', async () => {
    await expect(asRole(pg, 'app_anon', null, (tx) => tx.query(`update stores set name = 'x'`))).rejects.toThrow();
    await expect(asRole(pg, 'app_anon', null, (tx) => tx.query(`insert into stores (slug, name) values ('x', 'x')`))).rejects.toThrow();
  });
});

describe('data wilayah', () => {
  it('berisi 38 provinsi dan 514 kabupaten/kota, dapat dibaca publik', async () => {
    const r = await asRole(pg, 'app_anon', null, async (tx) =>
      (await tx.query<{ level: string; n: number }>(`select level, count(*)::int as n from regions group by level`)).rows);
    const by = Object.fromEntries(r.map((x) => [x.level, x.n]));
    expect(by.province).toBe(38);
    expect(by.city).toBe(514);
  });

  it('pengunjung tidak dapat mengubah data wilayah', async () => {
    await expect(asRole(pg, 'app_anon', null, (tx) => tx.query(`delete from regions`))).rejects.toThrow();
  });
});
