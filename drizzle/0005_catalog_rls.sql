ALTER TABLE "categories" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "products" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "product_images" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT ON "categories", "products", "product_images" TO app_anon;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "categories", "products", "product_images" TO app_user;
--> statement-breakpoint
CREATE POLICY "categories_public_read" ON "categories" FOR SELECT TO app_anon, app_user USING (true);
--> statement-breakpoint
CREATE POLICY "categories_member_insert" ON "categories" FOR INSERT TO app_user WITH CHECK (app_is_member(store_id));
--> statement-breakpoint
CREATE POLICY "categories_member_update" ON "categories" FOR UPDATE TO app_user USING (app_is_member(store_id)) WITH CHECK (app_is_member(store_id));
--> statement-breakpoint
CREATE POLICY "categories_member_delete" ON "categories" FOR DELETE TO app_user USING (app_is_member(store_id));
--> statement-breakpoint
CREATE POLICY "products_public_read" ON "products" FOR SELECT TO app_anon USING (status = 'active');
--> statement-breakpoint
CREATE POLICY "products_member_read" ON "products" FOR SELECT TO app_user USING (status = 'active' OR app_is_member(store_id));
--> statement-breakpoint
CREATE POLICY "products_member_insert" ON "products" FOR INSERT TO app_user WITH CHECK (app_is_member(store_id) AND (category_id IS NULL OR EXISTS (SELECT 1 FROM categories c WHERE c.id = products.category_id AND c.store_id = products.store_id)));
--> statement-breakpoint
CREATE POLICY "products_member_update" ON "products" FOR UPDATE TO app_user USING (app_is_member(store_id)) WITH CHECK (app_is_member(store_id) AND (category_id IS NULL OR EXISTS (SELECT 1 FROM categories c WHERE c.id = products.category_id AND c.store_id = products.store_id)));
--> statement-breakpoint
CREATE POLICY "products_member_delete" ON "products" FOR DELETE TO app_user USING (app_is_member(store_id));
--> statement-breakpoint
CREATE POLICY "images_public_read" ON "product_images" FOR SELECT TO app_anon USING (EXISTS (SELECT 1 FROM products p WHERE p.id = product_images.product_id AND p.status = 'active'));
--> statement-breakpoint
CREATE POLICY "images_member_read" ON "product_images" FOR SELECT TO app_user USING (app_is_member(store_id) OR EXISTS (SELECT 1 FROM products p WHERE p.id = product_images.product_id AND p.status = 'active'));
--> statement-breakpoint
CREATE POLICY "images_member_insert" ON "product_images" FOR INSERT TO app_user WITH CHECK (app_is_member(store_id) AND EXISTS (SELECT 1 FROM products p WHERE p.id = product_images.product_id AND p.store_id = product_images.store_id));
--> statement-breakpoint
CREATE POLICY "images_member_update" ON "product_images" FOR UPDATE TO app_user USING (app_is_member(store_id)) WITH CHECK (app_is_member(store_id) AND EXISTS (SELECT 1 FROM products p WHERE p.id = product_images.product_id AND p.store_id = product_images.store_id));
--> statement-breakpoint
CREATE POLICY "images_member_delete" ON "product_images" FOR DELETE TO app_user USING (app_is_member(store_id));
