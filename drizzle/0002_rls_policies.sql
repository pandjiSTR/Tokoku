DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_anon') THEN CREATE ROLE app_anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN CREATE ROLE app_user NOLOGIN; END IF;
END $$;
--> statement-breakpoint
GRANT app_anon, app_user TO CURRENT_USER;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO app_anon, app_user;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app_user_id() RETURNS uuid
LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('app.user_id', true), '')::uuid $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app_is_member(sid uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM store_members WHERE store_id = sid AND user_id = app_user_id()) $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app_is_owner(sid uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM store_members WHERE store_id = sid AND user_id = app_user_id() AND role = 'owner') $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app_store_has_members(sid uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM store_members WHERE store_id = sid) $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_is_member(uuid), app_is_owner(uuid), app_store_has_members(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_user_id(), app_is_member(uuid), app_is_owner(uuid), app_store_has_members(uuid) TO app_anon, app_user;
--> statement-breakpoint
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "regions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "stores" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "store_members" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "social_links" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "store_settings" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT ON "stores", "social_links", "store_settings", "regions" TO app_anon;
--> statement-breakpoint
GRANT SELECT ON "regions", "stores", "social_links", "store_settings", "users", "store_members", "audit_logs" TO app_user;
--> statement-breakpoint
GRANT INSERT, UPDATE ON "stores" TO app_user;
--> statement-breakpoint
GRANT UPDATE ON "users" TO app_user;
--> statement-breakpoint
GRANT INSERT, UPDATE, DELETE ON "store_members" TO app_user;
--> statement-breakpoint
GRANT INSERT, UPDATE, DELETE ON "social_links", "store_settings" TO app_user;
--> statement-breakpoint
GRANT INSERT ON "audit_logs" TO app_user;
--> statement-breakpoint
CREATE POLICY "users_self_select" ON "users" FOR SELECT TO app_user USING (id = app_user_id());
--> statement-breakpoint
CREATE POLICY "users_self_update" ON "users" FOR UPDATE TO app_user USING (id = app_user_id()) WITH CHECK (id = app_user_id());
--> statement-breakpoint
CREATE POLICY "regions_read" ON "regions" FOR SELECT TO app_anon, app_user USING (true);
--> statement-breakpoint
CREATE POLICY "stores_public_read" ON "stores" FOR SELECT TO app_anon, app_user USING (true);
--> statement-breakpoint
CREATE POLICY "stores_insert_any_user" ON "stores" FOR INSERT TO app_user WITH CHECK (app_user_id() IS NOT NULL);
--> statement-breakpoint
CREATE POLICY "stores_owner_update" ON "stores" FOR UPDATE TO app_user USING (app_is_owner(id)) WITH CHECK (app_is_owner(id));
--> statement-breakpoint
CREATE POLICY "members_select_team" ON "store_members" FOR SELECT TO app_user USING (app_is_member(store_id));
--> statement-breakpoint
CREATE POLICY "members_insert" ON "store_members" FOR INSERT TO app_user WITH CHECK (app_is_owner(store_id) OR (user_id = app_user_id() AND role = 'owner' AND NOT app_store_has_members(store_id)));
--> statement-breakpoint
CREATE POLICY "members_update_owner" ON "store_members" FOR UPDATE TO app_user USING (app_is_owner(store_id)) WITH CHECK (app_is_owner(store_id));
--> statement-breakpoint
CREATE POLICY "members_delete_owner" ON "store_members" FOR DELETE TO app_user USING (app_is_owner(store_id));
--> statement-breakpoint
CREATE POLICY "social_public_read" ON "social_links" FOR SELECT TO app_anon, app_user USING (true);
--> statement-breakpoint
CREATE POLICY "social_owner_insert" ON "social_links" FOR INSERT TO app_user WITH CHECK (app_is_owner(store_id));
--> statement-breakpoint
CREATE POLICY "social_owner_update" ON "social_links" FOR UPDATE TO app_user USING (app_is_owner(store_id)) WITH CHECK (app_is_owner(store_id));
--> statement-breakpoint
CREATE POLICY "social_owner_delete" ON "social_links" FOR DELETE TO app_user USING (app_is_owner(store_id));
--> statement-breakpoint
CREATE POLICY "settings_public_read" ON "store_settings" FOR SELECT TO app_anon, app_user USING (true);
--> statement-breakpoint
CREATE POLICY "settings_owner_insert" ON "store_settings" FOR INSERT TO app_user WITH CHECK (app_is_owner(store_id));
--> statement-breakpoint
CREATE POLICY "settings_owner_update" ON "store_settings" FOR UPDATE TO app_user USING (app_is_owner(store_id)) WITH CHECK (app_is_owner(store_id));
--> statement-breakpoint
CREATE POLICY "settings_owner_delete" ON "store_settings" FOR DELETE TO app_user USING (app_is_owner(store_id));
--> statement-breakpoint
CREATE POLICY "audit_member_select" ON "audit_logs" FOR SELECT TO app_user USING (app_is_member(store_id));
--> statement-breakpoint
CREATE POLICY "audit_member_insert" ON "audit_logs" FOR INSERT TO app_user WITH CHECK (app_is_member(store_id) AND user_id = app_user_id());
