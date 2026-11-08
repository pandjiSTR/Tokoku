DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_buyer') THEN CREATE ROLE app_buyer NOLOGIN; END IF;
END $$;
--> statement-breakpoint
GRANT app_buyer TO CURRENT_USER;
--> statement-breakpoint
GRANT app_anon TO app_buyer;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO app_buyer;
--> statement-breakpoint
ALTER TABLE "payment_methods" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "shipping_rates" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "shipping_groups" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "shipping_group_areas" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "shipping_default" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "orders" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "order_items" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "payment_proofs" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "notifications_log" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app_reserve_stock(p_store uuid, p_product uuid, p_qty integer) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
  IF p_qty IS NULL OR p_qty < 1 OR p_qty > 1000 THEN RETURN false; END IF;
  UPDATE products SET stock = stock - p_qty, updated_at = now()
   WHERE id = p_product AND store_id = p_store AND status = 'active' AND stock >= p_qty;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n = 1;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app_release_order_stock(p_order uuid) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE products p SET stock = p.stock + s.qty, updated_at = now()
    FROM (SELECT product_id, sum(qty)::integer AS qty FROM order_items WHERE order_id = p_order AND product_id IS NOT NULL GROUP BY product_id) s
   WHERE p.id = s.product_id $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app_next_order_number(p_store uuid) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE seq integer;
BEGIN
  UPDATE stores SET order_seq = order_seq + 1 WHERE id = p_store RETURNING order_seq INTO seq;
  IF seq IS NULL THEN RAISE EXCEPTION 'toko tidak ditemukan'; END IF;
  RETURN 'TK-' || seq::text;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app_expire_stale_orders(p_store uuid) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
  UPDATE orders SET status = 'expired' WHERE store_id = p_store AND status = 'pending_payment' AND expires_at < now();
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_reserve_stock(uuid, uuid, integer), app_release_order_stock(uuid), app_next_order_number(uuid), app_expire_stale_orders(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_reserve_stock(uuid, uuid, integer), app_next_order_number(uuid) TO app_buyer;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_expire_stale_orders(uuid) TO app_buyer, app_user;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION orders_status_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE who text := current_user;
BEGIN
  NEW.updated_at := now();
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT ((OLD.status::text, NEW.status::text) IN (
      ('pending_payment','awaiting_verification'), ('pending_payment','cancelled'), ('pending_payment','expired'),
      ('awaiting_verification','paid'), ('awaiting_verification','rejected'), ('awaiting_verification','cancelled'),
      ('paid','processing'), ('processing','shipped'), ('shipped','completed')
    )) THEN
      RAISE EXCEPTION 'transisi status % -> % tidak diizinkan', OLD.status, NEW.status USING ERRCODE = '23514';
    END IF;
    IF who = 'app_buyer' AND NOT (OLD.status = 'pending_payment' AND NEW.status = 'awaiting_verification') THEN
      RAISE EXCEPTION 'pembeli tidak boleh mengubah status ini' USING ERRCODE = '42501';
    END IF;
    IF who = 'app_user' AND NEW.status = 'expired' THEN
      RAISE EXCEPTION 'kedaluwarsa hanya diatur sistem' USING ERRCODE = '42501';
    END IF;
    IF NEW.status = 'awaiting_verification' AND OLD.expires_at < now() THEN
      RAISE EXCEPTION 'pesanan sudah kedaluwarsa' USING ERRCODE = '23514';
    END IF;
    IF NEW.status = 'rejected' AND length(trim(coalesce(NEW.rejected_reason, ''))) = 0 THEN
      RAISE EXCEPTION 'alasan penolakan wajib diisi' USING ERRCODE = '23514';
    END IF;
    IF NEW.status = 'paid' THEN NEW.verified_at := coalesce(NEW.verified_at, now()); END IF;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER orders_status_guard_trg BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION orders_status_guard();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION orders_release_stock() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status IN ('rejected','cancelled','expired') AND OLD.status IN ('pending_payment','awaiting_verification') THEN
    PERFORM app_release_order_stock(NEW.id);
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER orders_release_stock_trg AFTER UPDATE OF status ON orders FOR EACH ROW EXECUTE FUNCTION orders_release_stock();
--> statement-breakpoint
GRANT SELECT ON "shipping_rates", "shipping_groups", "shipping_group_areas", "shipping_default", "payment_methods" TO app_buyer;
--> statement-breakpoint
GRANT SELECT, INSERT ON "orders", "order_items", "payment_proofs" TO app_buyer;
--> statement-breakpoint
GRANT UPDATE ("status", "updated_at") ON "orders" TO app_buyer;
--> statement-breakpoint
GRANT SELECT ON "orders", "order_items", "payment_proofs", "notifications_log" TO app_user;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "shipping_rates", "shipping_groups", "shipping_group_areas", "shipping_default", "payment_methods" TO app_user;
--> statement-breakpoint
GRANT UPDATE ("status", "rejected_reason", "verified_at", "verified_by", "updated_at") ON "orders" TO app_user;
--> statement-breakpoint
CREATE POLICY "shipping_rates_buyer_read" ON "shipping_rates" FOR SELECT TO app_buyer USING (true);
--> statement-breakpoint
CREATE POLICY "shipping_rates_member_read" ON "shipping_rates" FOR SELECT TO app_user USING (app_is_member(store_id));
--> statement-breakpoint
CREATE POLICY "shipping_rates_owner_insert" ON "shipping_rates" FOR INSERT TO app_user WITH CHECK (app_is_owner(store_id));
--> statement-breakpoint
CREATE POLICY "shipping_rates_owner_update" ON "shipping_rates" FOR UPDATE TO app_user USING (app_is_owner(store_id)) WITH CHECK (app_is_owner(store_id));
--> statement-breakpoint
CREATE POLICY "shipping_rates_owner_delete" ON "shipping_rates" FOR DELETE TO app_user USING (app_is_owner(store_id));
--> statement-breakpoint
CREATE POLICY "shipping_groups_buyer_read" ON "shipping_groups" FOR SELECT TO app_buyer USING (true);
--> statement-breakpoint
CREATE POLICY "shipping_groups_member_read" ON "shipping_groups" FOR SELECT TO app_user USING (app_is_member(store_id));
--> statement-breakpoint
CREATE POLICY "shipping_groups_owner_insert" ON "shipping_groups" FOR INSERT TO app_user WITH CHECK (app_is_owner(store_id));
--> statement-breakpoint
CREATE POLICY "shipping_groups_owner_update" ON "shipping_groups" FOR UPDATE TO app_user USING (app_is_owner(store_id)) WITH CHECK (app_is_owner(store_id));
--> statement-breakpoint
CREATE POLICY "shipping_groups_owner_delete" ON "shipping_groups" FOR DELETE TO app_user USING (app_is_owner(store_id));
--> statement-breakpoint
CREATE POLICY "shipping_default_buyer_read" ON "shipping_default" FOR SELECT TO app_buyer USING (true);
--> statement-breakpoint
CREATE POLICY "shipping_default_member_read" ON "shipping_default" FOR SELECT TO app_user USING (app_is_member(store_id));
--> statement-breakpoint
CREATE POLICY "shipping_default_owner_insert" ON "shipping_default" FOR INSERT TO app_user WITH CHECK (app_is_owner(store_id));
--> statement-breakpoint
CREATE POLICY "shipping_default_owner_update" ON "shipping_default" FOR UPDATE TO app_user USING (app_is_owner(store_id)) WITH CHECK (app_is_owner(store_id));
--> statement-breakpoint
CREATE POLICY "shipping_default_owner_delete" ON "shipping_default" FOR DELETE TO app_user USING (app_is_owner(store_id));
--> statement-breakpoint
CREATE POLICY "shipping_group_areas_buyer_read" ON "shipping_group_areas" FOR SELECT TO app_buyer USING (true);
--> statement-breakpoint
CREATE POLICY "shipping_group_areas_member_read" ON "shipping_group_areas" FOR SELECT TO app_user USING (app_is_member(store_id));
--> statement-breakpoint
CREATE POLICY "shipping_group_areas_owner_insert" ON "shipping_group_areas" FOR INSERT TO app_user WITH CHECK (app_is_owner(store_id) AND EXISTS (SELECT 1 FROM shipping_groups g WHERE g.id = shipping_group_areas.group_id AND g.store_id = shipping_group_areas.store_id));
--> statement-breakpoint
CREATE POLICY "shipping_group_areas_owner_update" ON "shipping_group_areas" FOR UPDATE TO app_user USING (app_is_owner(store_id)) WITH CHECK (app_is_owner(store_id) AND EXISTS (SELECT 1 FROM shipping_groups g WHERE g.id = shipping_group_areas.group_id AND g.store_id = shipping_group_areas.store_id));
--> statement-breakpoint
CREATE POLICY "shipping_group_areas_owner_delete" ON "shipping_group_areas" FOR DELETE TO app_user USING (app_is_owner(store_id));
--> statement-breakpoint
CREATE POLICY "payment_methods_buyer_read" ON "payment_methods" FOR SELECT TO app_buyer USING (active);
--> statement-breakpoint
CREATE POLICY "payment_methods_member_read" ON "payment_methods" FOR SELECT TO app_user USING (app_is_member(store_id));
--> statement-breakpoint
CREATE POLICY "payment_methods_owner_insert" ON "payment_methods" FOR INSERT TO app_user WITH CHECK (app_is_owner(store_id));
--> statement-breakpoint
CREATE POLICY "payment_methods_owner_update" ON "payment_methods" FOR UPDATE TO app_user USING (app_is_owner(store_id)) WITH CHECK (app_is_owner(store_id));
--> statement-breakpoint
CREATE POLICY "payment_methods_owner_delete" ON "payment_methods" FOR DELETE TO app_user USING (app_is_owner(store_id));
--> statement-breakpoint
CREATE POLICY "orders_buyer_read" ON "orders" FOR SELECT TO app_buyer USING (token_hash = current_setting('app.order_token_hash', true));
--> statement-breakpoint
CREATE POLICY "orders_buyer_insert" ON "orders" FOR INSERT TO app_buyer WITH CHECK (status = 'pending_payment' AND token_hash = current_setting('app.order_token_hash', true));
--> statement-breakpoint
CREATE POLICY "orders_buyer_update" ON "orders" FOR UPDATE TO app_buyer USING (token_hash = current_setting('app.order_token_hash', true)) WITH CHECK (token_hash = current_setting('app.order_token_hash', true));
--> statement-breakpoint
CREATE POLICY "orders_member_read" ON "orders" FOR SELECT TO app_user USING (app_is_member(store_id));
--> statement-breakpoint
CREATE POLICY "orders_member_update" ON "orders" FOR UPDATE TO app_user USING (app_is_member(store_id)) WITH CHECK (app_is_member(store_id));
--> statement-breakpoint
CREATE POLICY "order_items_buyer_read" ON "order_items" FOR SELECT TO app_buyer USING (EXISTS (SELECT 1 FROM orders o WHERE o.id = order_items.order_id AND o.store_id = order_items.store_id AND o.token_hash = current_setting('app.order_token_hash', true)));
--> statement-breakpoint
CREATE POLICY "order_items_buyer_insert" ON "order_items" FOR INSERT TO app_buyer WITH CHECK (EXISTS (SELECT 1 FROM orders o WHERE o.id = order_items.order_id AND o.store_id = order_items.store_id AND o.token_hash = current_setting('app.order_token_hash', true)));
--> statement-breakpoint
CREATE POLICY "order_items_member_read" ON "order_items" FOR SELECT TO app_user USING (app_is_member(store_id));
--> statement-breakpoint
CREATE POLICY "payment_proofs_buyer_read" ON "payment_proofs" FOR SELECT TO app_buyer USING (EXISTS (SELECT 1 FROM orders o WHERE o.id = payment_proofs.order_id AND o.store_id = payment_proofs.store_id AND o.token_hash = current_setting('app.order_token_hash', true)));
--> statement-breakpoint
CREATE POLICY "payment_proofs_buyer_insert" ON "payment_proofs" FOR INSERT TO app_buyer WITH CHECK (EXISTS (SELECT 1 FROM orders o WHERE o.id = payment_proofs.order_id AND o.store_id = payment_proofs.store_id AND o.token_hash = current_setting('app.order_token_hash', true)));
--> statement-breakpoint
CREATE POLICY "payment_proofs_member_read" ON "payment_proofs" FOR SELECT TO app_user USING (app_is_member(store_id));
--> statement-breakpoint
CREATE POLICY "notifications_member_read" ON "notifications_log" FOR SELECT TO app_user USING (app_is_member(store_id));
