-- Pricing v2 (market-aligned, 2026-11-14). Data only, no schema change.
--
-- 1. New price version per plan (14-day trial). Versions are append-only:
--    anyone already subscribed keeps their version; new sign-ups get v2.
--    Checkout creates the matching Razorpay plan on first use.
--      Basic     Rs 1,999/mo  Rs 19,990/yr
--      Standard  Rs 4,999/mo  Rs 49,990/yr  (featured)
--      Premium   Rs 9,999/mo  Rs 99,990/yr
-- 2. Module matrix (plan_modules). Before this, no rows = every plan had all.
--    No workspace was subscribed when written, so nobody loses a module.
-- 3. Card text (description, highlights) and comparison rows.
--
-- Written as direct DML because platform_* owner functions need an aal2
-- browser session. Everything stays editable afterwards in Super Admin.
--
-- Rollback:
--   DELETE FROM plan_versions WHERE version = 2 AND plan_id IN (SELECT id FROM subscription_plans WHERE code IN ('basic','standard','premium'))
--     AND NOT EXISTS (SELECT 1 FROM org_subscriptions s WHERE s.plan_version_id = plan_versions.id);
--   DELETE FROM plan_modules WHERE plan_id IN (SELECT id FROM subscription_plans WHERE code IN ('basic','standard','premium'));
--   DELETE FROM platform_pricing_rows WHERE section IN ('Plan details','Included in every plan');
-- Safe to re-run.

BEGIN;

-- 1. Prices: add v2 only when the latest version differs.
WITH want(code, monthly, yearly) AS (VALUES
  ('basic',    199900,  1999000),
  ('standard', 499900,  4999000),
  ('premium',  999900,  9999000)
), latest AS (
  SELECT DISTINCT ON (pv.plan_id) pv.plan_id, pv.version, pv.price_monthly_minor, pv.price_yearly_minor, pv.trial_days
    FROM plan_versions pv ORDER BY pv.plan_id, pv.version DESC
)
INSERT INTO plan_versions (plan_id, version, currency, price_monthly_minor, price_yearly_minor, trial_days)
SELECT p.id, coalesce(l.version, 0) + 1, 'INR', w.monthly, w.yearly, 14
  FROM want w JOIN subscription_plans p ON p.code = w.code
  LEFT JOIN latest l ON l.plan_id = p.id
 WHERE l.plan_id IS NULL OR (l.price_monthly_minor, l.price_yearly_minor, l.trial_days) <> (w.monthly, w.yearly, 14);

-- 2. Modules per plan.
DELETE FROM plan_modules WHERE plan_id IN (SELECT id FROM subscription_plans WHERE code IN ('basic','standard','premium'));
INSERT INTO plan_modules (plan_id, module_key)
SELECT p.id, m.key
  FROM (VALUES
    ('basic','leads'), ('basic','deals'), ('basic','tickets'), ('basic','approvals'),
    ('standard','leads'), ('standard','deals'), ('standard','tickets'), ('standard','approvals'),
    ('standard','commerce'), ('standard','visits'), ('standard','expenses'), ('standard','invoices'),
    ('premium','leads'), ('premium','deals'), ('premium','tickets'), ('premium','approvals'),
    ('premium','commerce'), ('premium','visits'), ('premium','expenses'), ('premium','invoices'), ('premium','vendors')
  ) v(code, key)
  JOIN subscription_plans p ON p.code = v.code
  JOIN platform_modules m ON m.key = v.key;

-- 3a. Card text.
UPDATE subscription_plans SET is_featured = (code = 'standard') WHERE code IN ('basic','standard','premium');
UPDATE subscription_plans SET description = 'For small teams getting their sales and service in one place.',
  highlights = ARRAY['Up to 5 team members','Leads, deals and pipeline','Service desk tickets','Approvals','Projects, tasks and HR','Email support']
 WHERE code = 'basic';
UPDATE subscription_plans SET description = 'For growing teams that sell, ship and work in the field.',
  highlights = ARRAY['Up to 25 team members','Everything in Basic','Sales and call centre: Shopify orders, WhatsApp, shipping','Field visits with check-in','Expenses and GST invoices','Priority email and chat support']
 WHERE code = 'standard';
UPDATE subscription_plans SET description = 'For larger organisations running every department on one platform.',
  highlights = ARRAY['Up to 75 team members','Everything in Standard','Vendors and purchasing','Guided onboarding and data import','Phone support with named contact']
 WHERE code = 'premium';

-- 3b. Comparison rows (owner can edit or delete in Super Admin > Pricing page).
INSERT INTO platform_pricing_rows (section, label, plan_values, sort_order)
SELECT v.section, v.label, v.vals::jsonb, v.sort
  FROM (VALUES
    ('Plan details', 'Team members', '{"basic":"Up to 5","standard":"Up to 25","premium":"Up to 75"}', 10),
    ('Plan details', 'Free trial', '{"basic":"14 days","standard":"14 days","premium":"14 days"}', 20),
    ('Plan details', 'Support', '{"basic":"Email","standard":"Email and chat","premium":"Phone, named contact"}', 30),
    ('Plan details', 'Guided onboarding and data import', '{"basic":"no","standard":"no","premium":"yes"}', 40),
    ('Included in every plan', 'Projects, tasks and workspaces', '{"basic":"yes","standard":"yes","premium":"yes"}', 50),
    ('Included in every plan', 'HR: employees, attendance and leave', '{"basic":"yes","standard":"yes","premium":"yes"}', 60),
    ('Included in every plan', 'Roles and module access per team member', '{"basic":"yes","standard":"yes","premium":"yes"}', 70),
    ('Included in every plan', 'Separate, private workspace for your company', '{"basic":"yes","standard":"yes","premium":"yes"}', 80)
  ) v(section, label, vals, sort)
 WHERE NOT EXISTS (SELECT 1 FROM platform_pricing_rows r WHERE r.label = v.label);

-- Re-gate any subscribed workspace (none when written).
DO $$
DECLARE o UUID;
BEGIN
  FOR o IN SELECT DISTINCT s.org_id FROM org_subscriptions s WHERE s.status <> 'cancelled' LOOP
    PERFORM public.platform_recompute_org_modules(o);
  END LOOP;
END $$;

COMMIT;
