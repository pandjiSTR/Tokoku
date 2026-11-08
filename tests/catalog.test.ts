import { beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { asRole, createTestDb } from './helpers';

const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';
const STAFF_A = '33333333-3333-3333-3333-333333333333';
const SA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const SB = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const CAT_A = 'c0000000-0000-0000-0000-00000000000a';
const CAT_B = 'c0000000-0000-0000-0000-00000000000b';
const P_A_ACTIVE = 'd0000000-0000-0000-0000-0000000000a1';
const P_A_DRAFT = 'd0000000-0000-0000-0000-0000000000a2';
const P_B_ACTIVE = 'd0000000-0000-0000-0000-0000000000b1';
const P_B_DRAFT = 'd0000000-0000-0000-0000-0000000000b2';

let pg: PGlite;

beforeAll(async () => {
  pg = await createTestDb();
  await pg.exec(`
    insert into users (id, email, name) values ('${A}','a@t','A'),('${B}','b@t','B'),('${STAFF_A}','s@t','S');
    insert into stores (id, slug, name) values ('${SA}','toko-a','Toko A'),('${SB}','toko-b','Toko B');
    insert into store_members (store_id, user_id, role) values ('${SA}','${A}','owner'),('${SB}','${B}','owner'),('${SA}','${STAFF_A}','staff');
    insert into categories (id, store_id, name, slug) values ('${CAT_A}','${SA}','Kopi','kopi'),('${CAT_B}','${SB}','Kopi','kopi');
    insert into products (id, store_id, category_id, name, slug, price, status) values
      ('${P_A_ACTIVE}','${SA}','${CAT_A}','A Aktif','a-aktif',10000,'active'),
      ('${P_A_DRAFT}','${SA}',null,'A Draf','a-draf',10000,'draft'),
      ('${P_B_ACTIVE}','${SB}','${CAT_B}','B Aktif','b-aktif',20000,'active'),
      ('${P_B_DRAFT}','${SB}',null,'B Draf','b-draf',20000,'draft');
    insert into product_images (store_id, product_id, path, position) values
      ('${SA}','${P_A_ACTIVE}','a/a1.webp',0),('${SA}','${P_A_DRAFT}','a/a2.webp',0),('${SB}','${P_B_DRAFT}','b/b2.webp',0);
  `);
});

const rows = <T,>(role: 'app_user' | 'app_anon', uid: string | null, q: string) =>
  asRole(pg, role, uid, async (tx) => (await tx.query<T>(q)).rows);

describe('katalog: akses publik', () => {
  it('pengunjung hanya melihat produk aktif', async () => {
    const r = await rows<{ slug: string }>('app_anon', null, 'select slug from products order by slug');
    expect(r.map((x) => x.slug)).toEqual(['a-aktif', 'b-aktif']);
  });
  it('pengunjung tidak melihat gambar produk draf', async () => {
    const r = await rows<{ path: string }>('app_anon', null, 'select path from product_images');
    expect(r.map((x) => x.path)).toEqual(['a/a1.webp']);
  });
  it('pengunjung dapat membaca kategori tetapi tidak menulis', async () => {
    expect((await rows('app_anon', null, 'select 1 from categories')).length).toBe(2);
    await expect(asRole(pg, 'app_anon', null, (tx) => tx.query(`insert into categories (store_id,name,slug) values ('${SA}','x','x')`))).rejects.toThrow();
    await expect(asRole(pg, 'app_anon', null, (tx) => tx.query(`update products set price = 1`))).rejects.toThrow();
  });
});

describe('katalog: isolasi antar toko', () => {
  it('pemilik A melihat draf tokonya sendiri, tetapi tidak draf toko B', async () => {
    const r = await rows<{ slug: string }>('app_user', A, 'select slug from products order by slug');
    expect(r.map((x) => x.slug)).toEqual(['a-aktif', 'a-draf', 'b-aktif']);
  });
  it('pemilik A tidak melihat gambar draf toko B', async () => {
    const r = await rows<{ path: string }>('app_user', A, 'select path from product_images order by path');
    expect(r.map((x) => x.path)).toEqual(['a/a1.webp', 'a/a2.webp']);
  });
  it('pemilik A tidak dapat menambah produk ke toko B', async () => {
    await expect(asRole(pg, 'app_user', A, (tx) => tx.query(
      `insert into products (store_id, name, slug, price) values ('${SB}','Liar','liar',1)`))).rejects.toThrow();
  });
  it('pemilik A tidak dapat mengubah atau menghapus produk toko B', async () => {
    const u = await asRole(pg, 'app_user', A, (tx) => tx.query(`update products set price = 1 where id = '${P_B_ACTIVE}' returning id`));
    expect(u.rows.length).toBe(0);
    const d = await asRole(pg, 'app_user', A, (tx) => tx.query(`delete from products where id = '${P_B_DRAFT}' returning id`));
    expect(d.rows.length).toBe(0);
    expect((await pg.query(`select 1 from products where id in ('${P_B_ACTIVE}','${P_B_DRAFT}')`)).rows.length).toBe(2);
  });
  it('produk toko A tidak dapat memakai kategori milik toko B', async () => {
    await expect(asRole(pg, 'app_user', A, (tx) => tx.query(
      `update products set category_id = '${CAT_B}' where id = '${P_A_ACTIVE}'`))).rejects.toThrow();
    await expect(asRole(pg, 'app_user', A, (tx) => tx.query(
      `insert into products (store_id, category_id, name, slug, price) values ('${SA}','${CAT_B}','Silang','silang',1)`))).rejects.toThrow();
  });
  it('gambar tidak dapat dipasang ke produk toko lain', async () => {
    await expect(asRole(pg, 'app_user', A, (tx) => tx.query(
      `insert into product_images (store_id, product_id, path) values ('${SA}','${P_B_ACTIVE}','x.webp')`))).rejects.toThrow();
    await expect(asRole(pg, 'app_user', A, (tx) => tx.query(
      `insert into product_images (store_id, product_id, path) values ('${SB}','${P_B_ACTIVE}','x.webp')`))).rejects.toThrow();
  });
  it('pemilik A tidak dapat membuat atau mengubah kategori toko B', async () => {
    await expect(asRole(pg, 'app_user', A, (tx) => tx.query(`insert into categories (store_id,name,slug) values ('${SB}','Liar','liar')`))).rejects.toThrow();
    const u = await asRole(pg, 'app_user', A, (tx) => tx.query(`update categories set name = 'Dibajak' where id = '${CAT_B}' returning id`));
    expect(u.rows.length).toBe(0);
  });
});

describe('katalog: peran dan aturan data', () => {
  it('staf toko A boleh mengelola produk tokonya', async () => {
    const r = await asRole(pg, 'app_user', STAFF_A, (tx) => tx.query(
      `insert into products (store_id, name, slug, price, status) values ('${SA}','Dari Staf','dari-staf',5000,'draft') returning id`));
    expect(r.rows.length).toBe(1);
  });
  it('slug produk boleh sama di toko berbeda, tetapi unik dalam satu toko', async () => {
    await pg.exec(`insert into products (store_id, name, slug, price) values ('${SB}','Sama','sama-slug',1)`);
    await pg.exec(`insert into products (store_id, name, slug, price) values ('${SA}','Sama','sama-slug',1)`);
    await expect(pg.exec(`insert into products (store_id, name, slug, price) values ('${SA}','Sama 2','sama-slug',1)`)).rejects.toThrow();
  });
  it('harga dan stok tidak boleh negatif', async () => {
    await expect(pg.exec(`insert into products (store_id, name, slug, price) values ('${SA}','Neg','neg',-1)`)).rejects.toThrow();
    await expect(pg.exec(`insert into products (store_id, name, slug, price, stock) values ('${SA}','Neg2','neg2',1,-1)`)).rejects.toThrow();
  });
  it('menghapus kategori mengosongkan kategori produk, bukan menghapus produk', async () => {
    await asRole(pg, 'app_user', A, (tx) => tx.query(`delete from categories where id = '${CAT_A}'`));
    const r = await pg.query<{ category_id: string | null }>(`select category_id from products where id = '${P_A_ACTIVE}'`);
    expect(r.rows[0].category_id).toBeNull();
  });
});
