-- Team -> Edit Permissions lets an admin toggle "Delete Records
-- (Customers/Orders)" (can_delete) for any role, including manager/agent -
-- but customers/orders RLS (admin_all_customers/admin_all_orders, both
-- FOR ALL) only ever checked is_admin(). Granting can_delete to a
-- non-admin did nothing: their delete silently affected 0 rows (no RLS
-- error) while customers/page.tsx and orders/page.tsx's handleBulkDelete
-- still showed a success toast, since a 0-row delete isn't a Postgres
-- error. This adds DELETE specifically for can_delete holders - SELECT/
-- UPDATE already have their own broader agent-facing policies, so this
-- doesn't grant anything beyond what the permission's own label promises.
CREATE POLICY "can_delete_permission_customers" ON customers
FOR DELETE TO authenticated
USING (COALESCE((SELECT (permissions->>'can_delete')::boolean FROM profiles WHERE id = auth.uid()), false));

CREATE POLICY "can_delete_permission_orders" ON orders
FOR DELETE TO authenticated
USING (COALESCE((SELECT (permissions->>'can_delete')::boolean FROM profiles WHERE id = auth.uid()), false));
