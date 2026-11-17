-- Customer, order and abandoned-cart rows were readable by every member of the
-- org (policy: org_id = current_org_id()), whatever their role's data grants
-- said. A web developer or designer could pull the whole customer list with
-- names and phone numbers through the API even though the menu hid it.
--
-- Reads now need the role's view grant (Roles page > data permissions), the
-- same has_perm() every newer module uses. Admins keep full access through
-- the existing admin_all_* policies and is_admin(). Writes are unchanged.
--
-- Unassigned call-queue tasks (assigned_to IS NULL) were also visible to every
-- role; they now need the customers view grant, since a call task is customer
-- work. Tasks assigned to the user stay visible to them.
--
-- Roles that already hold the grants (agent, manager, hr, marketing in the live
-- orgs) see exactly what they saw before.

BEGIN;

DROP POLICY IF EXISTS agent_read_customers ON public.customers;
CREATE POLICY customers_perm_read ON public.customers FOR SELECT TO authenticated
  USING (org_id = public.current_org_id() AND (public.is_admin() OR public.has_perm('customers', 'view')));

DROP POLICY IF EXISTS agent_read_orders ON public.orders;
CREATE POLICY orders_perm_read ON public.orders FOR SELECT TO authenticated
  USING (org_id = public.current_org_id() AND (public.is_admin() OR public.has_perm('orders', 'view')));

DROP POLICY IF EXISTS agent_read_abandoned_carts ON public.abandoned_carts;
CREATE POLICY abandoned_carts_perm_read ON public.abandoned_carts FOR SELECT TO authenticated
  USING (org_id = public.current_org_id() AND (public.is_admin() OR public.has_perm('customers', 'view')));

DROP POLICY IF EXISTS agent_own_tasks ON public.tasks;
CREATE POLICY agent_own_tasks ON public.tasks FOR SELECT TO authenticated
  USING (
    org_id = public.current_org_id()
    AND (assigned_to = auth.uid() OR (assigned_to IS NULL AND (public.is_admin() OR public.has_perm('customers', 'view'))))
  );

COMMIT;

-- Rollback (restores the previous, wider reads):
-- DROP POLICY customers_perm_read ON public.customers;
-- CREATE POLICY agent_read_customers ON public.customers FOR SELECT TO authenticated USING (org_id = public.current_org_id());
-- DROP POLICY orders_perm_read ON public.orders;
-- CREATE POLICY agent_read_orders ON public.orders FOR SELECT TO authenticated USING (org_id = public.current_org_id());
-- DROP POLICY abandoned_carts_perm_read ON public.abandoned_carts;
-- CREATE POLICY agent_read_abandoned_carts ON public.abandoned_carts FOR SELECT TO authenticated USING (org_id = public.current_org_id());
-- DROP POLICY agent_own_tasks ON public.tasks;
-- CREATE POLICY agent_own_tasks ON public.tasks FOR SELECT TO authenticated USING (((assigned_to = auth.uid()) OR (assigned_to IS NULL)) AND (org_id = public.current_org_id()));
