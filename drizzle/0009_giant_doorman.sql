CREATE TYPE "public"."shipping_method" AS ENUM('courier', 'local', 'pickup');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "banners" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"image_path" text NOT NULL,
	"title" text,
	"link_url" text,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"active" boolean DEFAULT true NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pickup_settings" (
	"store_id" uuid PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"instructions" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "shipping_local_options" (
	"store_id" uuid PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"max_radius_km" numeric(5, 2) DEFAULT '10' NOT NULL,
	"correction" numeric(4, 2) DEFAULT '1.30' NOT NULL,
	CONSTRAINT "local_options_range" CHECK ("shipping_local_options"."max_radius_km" between 0.5 and 50 and "shipping_local_options"."correction" between 1 and 3)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "shipping_local_tiers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"up_to_km" numeric(5, 2) NOT NULL,
	"price" integer NOT NULL,
	CONSTRAINT "local_tiers_valid" CHECK ("shipping_local_tiers"."up_to_km" > 0 and "shipping_local_tiers"."price" >= 0)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "store_locations" (
	"store_id" uuid PRIMARY KEY NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "store_locations_range" CHECK ("store_locations"."lat" between -90 and 90 and "store_locations"."lng" between -180 and 180)
);
--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "province_code" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "city_code" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "district_code" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "province_name" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "city_name" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "district_name" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "address" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "shipping_method" "shipping_method" DEFAULT 'courier' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "buyer_lat" double precision;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "buyer_lng" double precision;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "distance_km" numeric(6, 2);--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "logo_path" text;--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "favicon_path" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "banners" ADD CONSTRAINT "banners_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pickup_settings" ADD CONSTRAINT "pickup_settings_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "shipping_local_options" ADD CONSTRAINT "shipping_local_options_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "shipping_local_tiers" ADD CONSTRAINT "shipping_local_tiers_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "store_locations" ADD CONSTRAINT "store_locations_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "banners_store_idx" ON "banners" USING btree ("store_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "local_tiers_store_km_uq" ON "shipping_local_tiers" USING btree ("store_id","up_to_km");--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_method_fields" CHECK (("orders"."shipping_method" = 'pickup') or ("orders"."shipping_method" = 'local' and "orders"."address" is not null and "orders"."buyer_lat" is not null and "orders"."buyer_lng" is not null) or ("orders"."shipping_method" = 'courier' and "orders"."address" is not null and "orders"."province_code" is not null and "orders"."city_code" is not null and "orders"."district_code" is not null));