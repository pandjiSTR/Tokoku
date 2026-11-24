import { sql } from 'drizzle-orm';
import {
  pgTable, pgEnum, uuid, text, timestamp, uniqueIndex, index, jsonb, primaryKey, integer, boolean, check, doublePrecision, numeric,
} from 'drizzle-orm/pg-core';

export const memberRole = pgEnum('member_role', ['owner', 'staff']);

// id sama dengan id pengguna di Supabase Auth (auth.users.id)
export const users = pgTable('users', {
  id: uuid('id').primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// Referensi wilayah (kode resmi Kemendagri). level 1 = provinsi, 2 = kabupaten/kota.
export const regions = pgTable(
  'regions',
  {
    code: text('code').primaryKey(),
    name: text('name').notNull(),
    level: text('level', { enum: ['province', 'city', 'district'] }).notNull(),
    parentCode: text('parent_code'),
  },
  (t) => [index('regions_parent_idx').on(t.parentCode)],
);

export const stores = pgTable('stores', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  description: text('description'),
  address: text('address'),
  provinceCode: text('province_code').references(() => regions.code),
  cityCode: text('city_code').references(() => regions.code),
  whatsapp: text('whatsapp'), // format internasional tanpa +, mis. 6281234567890
  email: text('email'),
  waGreeting: text('wa_greeting'),
  orderSeq: integer('order_seq').notNull().default(1000),
  logoPath: text('logo_path'),
  faviconPath: text('favicon_path'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const storeMembers = pgTable(
  'store_members',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    storeId: uuid('store_id').notNull().references(() => stores.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    role: memberRole('role').notNull().default('owner'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('store_members_store_user_uq').on(t.storeId, t.userId)],
);

export const socialLinks = pgTable(
  'social_links',
  {
    storeId: uuid('store_id').notNull().references(() => stores.id, { onDelete: 'cascade' }),
    platform: text('platform', { enum: ['instagram', 'tiktok', 'facebook', 'youtube', 'website'] }).notNull(),
    url: text('url').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.storeId, t.platform] })],
);

export const storeSettings = pgTable('store_settings', {
  storeId: uuid('store_id').primaryKey().references(() => stores.id, { onDelete: 'cascade' }),
  theme: text('theme').notNull().default('minimal'),
  config: jsonb('config').notNull().default({}),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    storeId: uuid('store_id').notNull().references(() => stores.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull().references(() => users.id),
    action: text('action').notNull(),
    meta: jsonb('meta').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('audit_logs_store_idx').on(t.storeId, t.createdAt)],
);

export const productStatus = pgEnum('product_status', ['active', 'draft', 'archived']);

export const categories = pgTable(
  'categories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    storeId: uuid('store_id').notNull().references(() => stores.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('categories_store_slug_uq').on(t.storeId, t.slug)],
);

// Nominal uang disimpan sebagai integer rupiah.
export const products = pgTable(
  'products',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    storeId: uuid('store_id').notNull().references(() => stores.id, { onDelete: 'cascade' }),
    categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'set null' }),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    description: text('description'),
    price: integer('price').notNull(),
    comparePrice: integer('compare_price'),
    stock: integer('stock').notNull().default(0),
    weightGram: integer('weight_gram'),
    status: productStatus('status').notNull().default('draft'),
    featured: boolean('featured').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('products_store_slug_uq').on(t.storeId, t.slug),
    index('products_store_status_idx').on(t.storeId, t.status),
    check('products_price_nonneg', sql`${t.price} >= 0`),
    check('products_stock_nonneg', sql`${t.stock} >= 0`),
  ],
);

export const productImages = pgTable(
  'product_images',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    storeId: uuid('store_id').notNull().references(() => stores.id, { onDelete: 'cascade' }),
    productId: uuid('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
    path: text('path').notNull(),
    position: integer('position').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('product_images_product_idx').on(t.productId, t.position)],
);

export type Store = typeof stores.$inferSelect;
export type Product = typeof products.$inferSelect;

// ---------- M3: pembayaran, pengiriman, pesanan ----------
export const orderStatus = pgEnum('order_status', [
  'pending_payment', 'awaiting_verification', 'paid', 'processing', 'shipped', 'completed', 'expired', 'rejected', 'cancelled',
]);
export const paymentType = pgEnum('payment_type', ['bank', 'qris']);
export const shippingMethod = pgEnum('shipping_method', ['courier', 'local', 'pickup']);

export const paymentMethods = pgTable('payment_methods', {
  id: uuid('id').primaryKey().defaultRandom(),
  storeId: uuid('store_id').notNull().references(() => stores.id, { onDelete: 'cascade' }),
  type: paymentType('type').notNull(),
  bankName: text('bank_name'),
  accountNumber: text('account_number'),
  accountName: text('account_name'),
  qrisPath: text('qris_path'),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const shippingRates = pgTable(
  'shipping_rates',
  {
    storeId: uuid('store_id').notNull().references(() => stores.id, { onDelete: 'cascade' }),
    cityCode: text('city_code').notNull().references(() => regions.code),
    price: integer('price').notNull(),
    active: boolean('active').notNull().default(true),
  },
  (t) => [primaryKey({ columns: [t.storeId, t.cityCode] }), check('shipping_rates_price_nonneg', sql`${t.price} >= 0`)],
);

export const shippingGroups = pgTable(
  'shipping_groups',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    storeId: uuid('store_id').notNull().references(() => stores.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    price: integer('price').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check('shipping_groups_price_nonneg', sql`${t.price} >= 0`)],
);

export const shippingGroupAreas = pgTable(
  'shipping_group_areas',
  {
    storeId: uuid('store_id').notNull().references(() => stores.id, { onDelete: 'cascade' }),
    groupId: uuid('group_id').notNull().references(() => shippingGroups.id, { onDelete: 'cascade' }),
    cityCode: text('city_code').notNull().references(() => regions.code),
  },
  (t) => [primaryKey({ columns: [t.storeId, t.cityCode] })],
);

export const shippingDefault = pgTable(
  'shipping_default',
  {
    storeId: uuid('store_id').primaryKey().references(() => stores.id, { onDelete: 'cascade' }),
    price: integer('price').notNull(),
    active: boolean('active').notNull().default(true),
  },
  (t) => [check('shipping_default_price_nonneg', sql`${t.price} >= 0`)],
);

export const orders = pgTable(
  'orders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    storeId: uuid('store_id').notNull().references(() => stores.id, { onDelete: 'cascade' }),
    orderNumber: text('order_number').notNull(),
    tokenHash: text('token_hash').notNull().unique(),
    status: orderStatus('status').notNull().default('pending_payment'),
    buyerName: text('buyer_name').notNull(),
    buyerWhatsapp: text('buyer_whatsapp').notNull(),
    buyerEmail: text('buyer_email'),
    provinceCode: text('province_code').references(() => regions.code),
    cityCode: text('city_code').references(() => regions.code),
    districtCode: text('district_code').references(() => regions.code),
    provinceName: text('province_name'),
    cityName: text('city_name'),
    districtName: text('district_name'),
    address: text('address'),
    shippingMethod: shippingMethod('shipping_method').notNull().default('courier'),
    buyerLat: doublePrecision('buyer_lat'),
    buyerLng: doublePrecision('buyer_lng'),
    distanceKm: numeric('distance_km', { precision: 6, scale: 2 }),
    subtotal: integer('subtotal').notNull(),
    shippingFee: integer('shipping_fee').notNull(),
    uniqueCode: integer('unique_code').notNull(),
    total: integer('total').notNull(),
    shippingSnapshot: jsonb('shipping_snapshot').notNull(),
    paymentMethodId: uuid('payment_method_id').references(() => paymentMethods.id, { onDelete: 'set null' }),
    paymentSnapshot: jsonb('payment_snapshot').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull().default(sql`now() + interval '24 hours'`),
    rejectedReason: text('rejected_reason'),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    verifiedBy: uuid('verified_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('orders_store_number_uq').on(t.storeId, t.orderNumber),
    // Nominal (termasuk kode unik) harus unik untuk pesanan aktif dalam satu toko.
    uniqueIndex('orders_active_total_uq').on(t.storeId, t.total).where(sql`status in ('pending_payment', 'awaiting_verification')`),
    index('orders_store_status_idx').on(t.storeId, t.status, t.createdAt),
    check('orders_unique_code_range', sql`${t.uniqueCode} between 1 and 999`),
    check('orders_total_sum', sql`${t.total} = ${t.subtotal} + ${t.shippingFee} + ${t.uniqueCode}`),
    check('orders_money_nonneg', sql`${t.subtotal} >= 0 and ${t.shippingFee} >= 0`),
    check('orders_method_fields', sql`(${t.shippingMethod} = 'pickup') or (${t.shippingMethod} = 'local' and ${t.address} is not null and ${t.buyerLat} is not null and ${t.buyerLng} is not null) or (${t.shippingMethod} = 'courier' and ${t.address} is not null and ${t.provinceCode} is not null and ${t.cityCode} is not null and ${t.districtCode} is not null)`),
  ],
);

export const orderItems = pgTable(
  'order_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    storeId: uuid('store_id').notNull().references(() => stores.id, { onDelete: 'cascade' }),
    orderId: uuid('order_id').notNull().references(() => orders.id, { onDelete: 'cascade' }),
    productId: uuid('product_id').references(() => products.id, { onDelete: 'set null' }),
    name: text('name').notNull(),
    price: integer('price').notNull(),
    qty: integer('qty').notNull(),
    weightGram: integer('weight_gram'),
  },
  (t) => [index('order_items_order_idx').on(t.orderId), check('order_items_qty_pos', sql`${t.qty} > 0`)],
);

export const paymentProofs = pgTable(
  'payment_proofs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    storeId: uuid('store_id').notNull().references(() => stores.id, { onDelete: 'cascade' }),
    orderId: uuid('order_id').notNull().references(() => orders.id, { onDelete: 'cascade' }),
    senderName: text('sender_name').notNull(),
    bankName: text('bank_name').notNull(),
    transferredAt: timestamp('transferred_at', { withTimezone: true }).notNull(),
    path: text('path').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('payment_proofs_order_idx').on(t.orderId)],
);

export const notificationsLog = pgTable('notifications_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  storeId: uuid('store_id').notNull().references(() => stores.id, { onDelete: 'cascade' }),
  orderId: uuid('order_id').references(() => orders.id, { onDelete: 'set null' }),
  channel: text('channel').notNull().default('email'),
  recipient: text('recipient').notNull(),
  template: text('template').notNull(),
  status: text('status').notNull(),
  error: text('error'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ---------- M4: pengiriman mandiri, pickup, banner ----------
// Koordinat toko PRIVAT: tabel ini tidak dapat dibaca pengunjung atau pembeli (hanya anggota toko dan fungsi app_store_location di server).
export const storeLocations = pgTable(
  'store_locations',
  {
    storeId: uuid('store_id').primaryKey().references(() => stores.id, { onDelete: 'cascade' }),
    lat: doublePrecision('lat').notNull(),
    lng: doublePrecision('lng').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check('store_locations_range', sql`${t.lat} between -90 and 90 and ${t.lng} between -180 and 180`)],
);

export const shippingLocalOptions = pgTable(
  'shipping_local_options',
  {
    storeId: uuid('store_id').primaryKey().references(() => stores.id, { onDelete: 'cascade' }),
    enabled: boolean('enabled').notNull().default(false),
    maxRadiusKm: numeric('max_radius_km', { precision: 5, scale: 2 }).notNull().default('10'),
    correction: numeric('correction', { precision: 4, scale: 2 }).notNull().default('1.30'),
  },
  (t) => [check('local_options_range', sql`${t.maxRadiusKm} between 0.5 and 50 and ${t.correction} between 1 and 3`)],
);

export const shippingLocalTiers = pgTable(
  'shipping_local_tiers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    storeId: uuid('store_id').notNull().references(() => stores.id, { onDelete: 'cascade' }),
    upToKm: numeric('up_to_km', { precision: 5, scale: 2 }).notNull(),
    price: integer('price').notNull(),
  },
  (t) => [
    uniqueIndex('local_tiers_store_km_uq').on(t.storeId, t.upToKm),
    check('local_tiers_valid', sql`${t.upToKm} > 0 and ${t.price} >= 0`),
  ],
);

export const pickupSettings = pgTable('pickup_settings', {
  storeId: uuid('store_id').primaryKey().references(() => stores.id, { onDelete: 'cascade' }),
  enabled: boolean('enabled').notNull().default(false),
  instructions: text('instructions'),
});

export const banners = pgTable(
  'banners',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    storeId: uuid('store_id').notNull().references(() => stores.id, { onDelete: 'cascade' }),
    imagePath: text('image_path').notNull(),
    title: text('title'),
    linkUrl: text('link_url'),
    startsAt: timestamp('starts_at', { withTimezone: true }),
    endsAt: timestamp('ends_at', { withTimezone: true }),
    active: boolean('active').notNull().default(true),
    position: integer('position').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('banners_store_idx').on(t.storeId, t.position)],
);
