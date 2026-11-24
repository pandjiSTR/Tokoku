ALTER TABLE "store_locations" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "shipping_local_options" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "shipping_local_tiers" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "pickup_settings" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "banners" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app_store_location(p_store uuid) RETURNS TABLE(lat double precision, lng double precision)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT l.lat, l.lng FROM store_locations l WHERE l.store_id = p_store $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_store_location(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_store_location(uuid) TO app_buyer;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION orders_fee_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.shipping_fee IS DISTINCT FROM OLD.shipping_fee OR NEW.total IS DISTINCT FROM OLD.total THEN
    IF current_user = 'app_buyer' THEN
      RAISE EXCEPTION 'pembeli tidak boleh mengubah nominal' USING ERRCODE = '42501';
    END IF;
    IF OLD.status <> 'pending_payment' OR NEW.status <> OLD.status THEN
      RAISE EXCEPTION 'ongkir hanya dapat diubah pada pesanan yang belum dibayar' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER orders_fee_guard_trg BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION orders_fee_guard();
--> statement-breakpoint
GRANT UPDATE ("shipping_fee", "total") ON "orders" TO app_user;
--> statement-breakpoint
GRANT SELECT ON "banners" TO app_anon;
--> statement-breakpoint
GRANT SELECT ON "shipping_local_options", "shipping_local_tiers", "pickup_settings" TO app_buyer;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "store_locations", "shipping_local_options", "shipping_local_tiers", "pickup_settings", "banners" TO app_user;
--> statement-breakpoint
CREATE POLICY "store_locations_member_read" ON "store_locations" FOR SELECT TO app_user USING (app_is_member(store_id));
--> statement-breakpoint
CREATE POLICY "store_locations_owner_insert" ON "store_locations" FOR INSERT TO app_user WITH CHECK (app_is_owner(store_id));
--> statement-breakpoint
CREATE POLICY "store_locations_owner_update" ON "store_locations" FOR UPDATE TO app_user USING (app_is_owner(store_id)) WITH CHECK (app_is_owner(store_id));
--> statement-breakpoint
CREATE POLICY "store_locations_owner_delete" ON "store_locations" FOR DELETE TO app_user USING (app_is_owner(store_id));
--> statement-breakpoint
CREATE POLICY "shipping_local_options_buyer_read" ON "shipping_local_options" FOR SELECT TO app_buyer USING (true);
--> statement-breakpoint
CREATE POLICY "shipping_local_options_member_read" ON "shipping_local_options" FOR SELECT TO app_user USING (app_is_member(store_id));
--> statement-breakpoint
CREATE POLICY "shipping_local_options_owner_insert" ON "shipping_local_options" FOR INSERT TO app_user WITH CHECK (app_is_owner(store_id));
--> statement-breakpoint
CREATE POLICY "shipping_local_options_owner_update" ON "shipping_local_options" FOR UPDATE TO app_user USING (app_is_owner(store_id)) WITH CHECK (app_is_owner(store_id));
--> statement-breakpoint
CREATE POLICY "shipping_local_options_owner_delete" ON "shipping_local_options" FOR DELETE TO app_user USING (app_is_owner(store_id));
--> statement-breakpoint
CREATE POLICY "shipping_local_tiers_buyer_read" ON "shipping_local_tiers" FOR SELECT TO app_buyer USING (true);
--> statement-breakpoint
CREATE POLICY "shipping_local_tiers_member_read" ON "shipping_local_tiers" FOR SELECT TO app_user USING (app_is_member(store_id));
--> statement-breakpoint
CREATE POLICY "shipping_local_tiers_owner_insert" ON "shipping_local_tiers" FOR INSERT TO app_user WITH CHECK (app_is_owner(store_id));
--> statement-breakpoint
CREATE POLICY "shipping_local_tiers_owner_update" ON "shipping_local_tiers" FOR UPDATE TO app_user USING (app_is_owner(store_id)) WITH CHECK (app_is_owner(store_id));
--> statement-breakpoint
CREATE POLICY "shipping_local_tiers_owner_delete" ON "shipping_local_tiers" FOR DELETE TO app_user USING (app_is_owner(store_id));
--> statement-breakpoint
CREATE POLICY "pickup_settings_buyer_read" ON "pickup_settings" FOR SELECT TO app_buyer USING (true);
--> statement-breakpoint
CREATE POLICY "pickup_settings_member_read" ON "pickup_settings" FOR SELECT TO app_user USING (app_is_member(store_id));
--> statement-breakpoint
CREATE POLICY "pickup_settings_owner_insert" ON "pickup_settings" FOR INSERT TO app_user WITH CHECK (app_is_owner(store_id));
--> statement-breakpoint
CREATE POLICY "pickup_settings_owner_update" ON "pickup_settings" FOR UPDATE TO app_user USING (app_is_owner(store_id)) WITH CHECK (app_is_owner(store_id));
--> statement-breakpoint
CREATE POLICY "pickup_settings_owner_delete" ON "pickup_settings" FOR DELETE TO app_user USING (app_is_owner(store_id));
--> statement-breakpoint
CREATE POLICY "banners_public_read" ON "banners" FOR SELECT TO app_anon USING (active AND (starts_at IS NULL OR starts_at <= now()) AND (ends_at IS NULL OR ends_at >= now()));
--> statement-breakpoint
CREATE POLICY "banners_member_read" ON "banners" FOR SELECT TO app_user USING (app_is_member(store_id) OR (active AND (starts_at IS NULL OR starts_at <= now()) AND (ends_at IS NULL OR ends_at >= now())));
--> statement-breakpoint
CREATE POLICY "banners_owner_insert" ON "banners" FOR INSERT TO app_user WITH CHECK (app_is_owner(store_id));
--> statement-breakpoint
CREATE POLICY "banners_owner_update" ON "banners" FOR UPDATE TO app_user USING (app_is_owner(store_id)) WITH CHECK (app_is_owner(store_id));
--> statement-breakpoint
CREATE POLICY "banners_owner_delete" ON "banners" FOR DELETE TO app_user USING (app_is_owner(store_id));
