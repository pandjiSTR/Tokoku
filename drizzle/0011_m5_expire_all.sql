CREATE OR REPLACE FUNCTION app_expire_all_stale_orders() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
  UPDATE orders SET status = 'expired' WHERE status = 'pending_payment' AND expires_at < now();
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;
--> statement-breakpoint
-- Hanya pemilik tabel (tugas sistem terjadwal) yang boleh menjalankannya; role aplikasi tidak.
REVOKE ALL ON FUNCTION app_expire_all_stale_orders() FROM PUBLIC;
