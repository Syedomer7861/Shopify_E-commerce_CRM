-- abandoned_carts was never hardened past the original blanket policy
-- (schema.sql: FOR ALL TO authenticated USING (true) WITH CHECK (true)),
-- unlike customers/orders which got admin-only DELETE in
-- 20260413_phase4_ecosystem.sql. Settings' "Purge: Abandoned Carts" button
-- is only gated client-side (isAdmin(profile)) - any authenticated user
-- could currently run the same delete directly. Mirrors the exact split
-- already proven safe for customers/orders: admin-only for everything,
-- explicit read/update for regular agents (Abandoned Carts page, the
-- Import feature's recovery-status updates, and workflow-engine all need
-- authenticated-but-non-admin write access to this table).
DROP POLICY IF EXISTS "auth_all" ON abandoned_carts;
CREATE POLICY "admin_all_abandoned_carts" ON abandoned_carts FOR ALL TO authenticated USING (public.is_admin());
CREATE POLICY "agent_read_abandoned_carts" ON abandoned_carts FOR SELECT TO authenticated USING (true);
CREATE POLICY "agent_write_abandoned_carts" ON abandoned_carts FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "agent_update_abandoned_carts" ON abandoned_carts FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
