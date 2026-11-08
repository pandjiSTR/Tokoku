CREATE TYPE "public"."order_status" AS ENUM('pending_payment', 'awaiting_verification', 'paid', 'processing', 'shipped', 'completed', 'expired', 'rejected', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."payment_type" AS ENUM('bank', 'qris');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "notifications_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"order_id" uuid,
	"channel" text DEFAULT 'email' NOT NULL,
	"recipient" text NOT NULL,
	"template" text NOT NULL,
	"status" text NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"product_id" uuid,
	"name" text NOT NULL,
	"price" integer NOT NULL,
	"qty" integer NOT NULL,
	"weight_gram" integer,
	CONSTRAINT "order_items_qty_pos" CHECK ("order_items"."qty" > 0)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"order_number" text NOT NULL,
	"token_hash" text NOT NULL,
	"status" "order_status" DEFAULT 'pending_payment' NOT NULL,
	"buyer_name" text NOT NULL,
	"buyer_whatsapp" text NOT NULL,
	"buyer_email" text,
	"province_code" text NOT NULL,
	"city_code" text NOT NULL,
	"district_code" text NOT NULL,
	"province_name" text NOT NULL,
	"city_name" text NOT NULL,
	"district_name" text NOT NULL,
	"address" text NOT NULL,
	"subtotal" integer NOT NULL,
	"shipping_fee" integer NOT NULL,
	"unique_code" integer NOT NULL,
	"total" integer NOT NULL,
	"shipping_snapshot" jsonb NOT NULL,
	"payment_method_id" uuid,
	"payment_snapshot" jsonb NOT NULL,
	"expires_at" timestamp with time zone DEFAULT now() + interval '24 hours' NOT NULL,
	"rejected_reason" text,
	"verified_at" timestamp with time zone,
	"verified_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "orders_unique_code_range" CHECK ("orders"."unique_code" between 1 and 999),
	CONSTRAINT "orders_total_sum" CHECK ("orders"."total" = "orders"."subtotal" + "orders"."shipping_fee" + "orders"."unique_code"),
	CONSTRAINT "orders_money_nonneg" CHECK ("orders"."subtotal" >= 0 and "orders"."shipping_fee" >= 0)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "payment_methods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"type" "payment_type" NOT NULL,
	"bank_name" text,
	"account_number" text,
	"account_name" text,
	"qris_path" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "payment_proofs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"sender_name" text NOT NULL,
	"bank_name" text NOT NULL,
	"transferred_at" timestamp with time zone NOT NULL,
	"path" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "shipping_default" (
	"store_id" uuid PRIMARY KEY NOT NULL,
	"price" integer NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "shipping_default_price_nonneg" CHECK ("shipping_default"."price" >= 0)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "shipping_group_areas" (
	"store_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	"city_code" text NOT NULL,
	CONSTRAINT "shipping_group_areas_store_id_city_code_pk" PRIMARY KEY("store_id","city_code")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "shipping_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"name" text NOT NULL,
	"price" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shipping_groups_price_nonneg" CHECK ("shipping_groups"."price" >= 0)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "shipping_rates" (
	"store_id" uuid NOT NULL,
	"city_code" text NOT NULL,
	"price" integer NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "shipping_rates_store_id_city_code_pk" PRIMARY KEY("store_id","city_code"),
	CONSTRAINT "shipping_rates_price_nonneg" CHECK ("shipping_rates"."price" >= 0)
);
--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "order_seq" integer DEFAULT 1000 NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "notifications_log" ADD CONSTRAINT "notifications_log_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "notifications_log" ADD CONSTRAINT "notifications_log_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "order_items" ADD CONSTRAINT "order_items_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "orders" ADD CONSTRAINT "orders_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "orders" ADD CONSTRAINT "orders_province_code_regions_code_fk" FOREIGN KEY ("province_code") REFERENCES "public"."regions"("code") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "orders" ADD CONSTRAINT "orders_city_code_regions_code_fk" FOREIGN KEY ("city_code") REFERENCES "public"."regions"("code") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "orders" ADD CONSTRAINT "orders_district_code_regions_code_fk" FOREIGN KEY ("district_code") REFERENCES "public"."regions"("code") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "orders" ADD CONSTRAINT "orders_payment_method_id_payment_methods_id_fk" FOREIGN KEY ("payment_method_id") REFERENCES "public"."payment_methods"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "orders" ADD CONSTRAINT "orders_verified_by_users_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payment_methods" ADD CONSTRAINT "payment_methods_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payment_proofs" ADD CONSTRAINT "payment_proofs_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payment_proofs" ADD CONSTRAINT "payment_proofs_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "shipping_default" ADD CONSTRAINT "shipping_default_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "shipping_group_areas" ADD CONSTRAINT "shipping_group_areas_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "shipping_group_areas" ADD CONSTRAINT "shipping_group_areas_group_id_shipping_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."shipping_groups"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "shipping_group_areas" ADD CONSTRAINT "shipping_group_areas_city_code_regions_code_fk" FOREIGN KEY ("city_code") REFERENCES "public"."regions"("code") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "shipping_groups" ADD CONSTRAINT "shipping_groups_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "shipping_rates" ADD CONSTRAINT "shipping_rates_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "shipping_rates" ADD CONSTRAINT "shipping_rates_city_code_regions_code_fk" FOREIGN KEY ("city_code") REFERENCES "public"."regions"("code") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "order_items_order_idx" ON "order_items" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "orders_store_number_uq" ON "orders" USING btree ("store_id","order_number");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "orders_active_total_uq" ON "orders" USING btree ("store_id","total") WHERE status in ('pending_payment', 'awaiting_verification');--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "orders_store_status_idx" ON "orders" USING btree ("store_id","status","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payment_proofs_order_idx" ON "payment_proofs" USING btree ("order_id");