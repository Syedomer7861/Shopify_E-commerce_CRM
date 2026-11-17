-- Universal organisation structure engine.
--
-- 1. org_unit_catalog: platform-wide starter list of departments, designations
--    and branch types (data, not frontend code). Read-only to members.
-- 2. org_structure_templates: industry templates that SUGGEST catalog entries;
--    an admin picks which ones to activate. Nothing is created automatically.
-- 3. Extra fields on the existing org-scoped tables (branches, departments,
--    designations). Existing rows, ids and RLS policies are untouched; the
--    existing audit_row_change triggers keep logging create/update/archive.
-- 4. Case-insensitive duplicate guard per organisation (checked: no current
--    duplicates on prod).
-- 5. Employment fields on profiles + a guard so a profile can only point at
--    branches / departments / designations / managers of its own organisation.
--
-- Additive only. Rollback:
--   DROP TRIGGER IF EXISTS trg_profiles_unit_org ON public.profiles;
--   DROP TRIGGER IF EXISTS trg_branches_ref_org ON public.branches; (and trg_departments_ref_org, trg_designations_ref_org)
--   DROP FUNCTION IF EXISTS public.org_unit_ref_check();
--   DROP FUNCTION IF EXISTS public.profiles_unit_org_check();
--   DROP FUNCTION IF EXISTS public.add_org_units(text, text[]);
--   DROP INDEX IF EXISTS branches_org_lower_name, departments_org_lower_name, designations_org_lower_name;
--   ALTER TABLE ... DROP COLUMN for each column added below;
--   DROP TABLE IF EXISTS public.org_structure_templates, public.org_unit_catalog;

BEGIN;

-- ── 1. Catalog ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.org_unit_catalog (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind       text NOT NULL CHECK (kind IN ('department', 'designation', 'branch_type')),
  name       text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
  category   text NOT NULL DEFAULT '',
  seniority  text CHECK (seniority IN ('executive', 'senior_leadership', 'management', 'senior', 'mid', 'junior', 'entry')),
  sort_order int  NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS org_unit_catalog_kind_name ON public.org_unit_catalog (kind, lower(name));
ALTER TABLE public.org_unit_catalog ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.org_unit_catalog FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.org_unit_catalog TO authenticated;
GRANT ALL ON public.org_unit_catalog TO service_role;
DROP POLICY IF EXISTS org_unit_catalog_read ON public.org_unit_catalog;
CREATE POLICY org_unit_catalog_read ON public.org_unit_catalog FOR SELECT TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS public.org_structure_templates (
  code         text PRIMARY KEY CHECK (code ~ '^[a-z][a-z0-9_]{1,39}$'),
  name         text NOT NULL,
  departments  text[] NOT NULL DEFAULT '{}',
  designations text[] NOT NULL DEFAULT '{}',
  sort_order   int NOT NULL DEFAULT 0
);
ALTER TABLE public.org_structure_templates ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.org_structure_templates FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.org_structure_templates TO authenticated;
GRANT ALL ON public.org_structure_templates TO service_role;
DROP POLICY IF EXISTS org_structure_templates_read ON public.org_structure_templates;
CREATE POLICY org_structure_templates_read ON public.org_structure_templates FOR SELECT TO authenticated USING (true);

-- Branch types
INSERT INTO public.org_unit_catalog (kind, name, sort_order)
SELECT 'branch_type', n, o FROM unnest(ARRAY['Head Office','Regional Office','Branch Office','Store','Warehouse','Factory','Remote Office']) WITH ORDINALITY t(n, o)
ON CONFLICT DO NOTHING;

-- Departments
INSERT INTO public.org_unit_catalog (kind, name, category, sort_order)
SELECT 'department', d.n, d.c, d.o FROM (VALUES
  ('Executive Management','Management & Administration',1),
  ('Administration & Facilities','Management & Administration',2),
  ('Human Resources (HR)','Management & Administration',3),
  ('Finance & Accounting','Management & Administration',4),
  ('Legal & Compliance','Management & Administration',5),
  ('Information Technology (IT)','Technology & Product',6),
  ('Software Engineering','Technology & Product',7),
  ('Product Management','Technology & Product',8),
  ('UI/UX & Creative Design','Technology & Product',9),
  ('Quality Assurance (QA)','Technology & Product',10),
  ('Data & Analytics','Technology & Product',11),
  ('Cybersecurity','Technology & Product',12),
  ('Research & Development (R&D)','Technology & Product',13),
  ('Sales & Business Development','Sales & Customer Management',14),
  ('Marketing & Growth','Sales & Customer Management',15),
  ('Customer Support','Sales & Customer Management',16),
  ('Customer Success','Sales & Customer Management',17),
  ('E-commerce & Digital Commerce','Sales & Customer Management',18),
  ('Creative & Content','Sales & Customer Management',19),
  ('Operations','Business Operations',20),
  ('Project & Program Management','Business Operations',21),
  ('Procurement & Vendor Management','Business Operations',22),
  ('Supply Chain & Logistics','Business Operations',23),
  ('Inventory & Warehouse','Business Operations',24),
  ('Production & Manufacturing','Business Operations',25)
) d(n, c, o)
ON CONFLICT DO NOTHING;

-- Designations: category + explicit seniority where the group sets it,
-- otherwise inferred from the title.
INSERT INTO public.org_unit_catalog (kind, name, category, seniority, sort_order)
SELECT 'designation', g.n, g.c,
  coalesce(g.s, CASE
    WHEN g.n ~* '(director|head|chief)' THEN 'senior_leadership'
    WHEN g.n ~* '(manager|lead|leader|supervisor|partner)' THEN 'management'
    WHEN g.n ~* '^senior ' THEN 'senior'
    WHEN g.n ~* '(junior|trainee|intern|assistant|clerk|operator|receptionist)' THEN 'entry'
    ELSE 'mid' END),
  1000 + row_number() OVER ()
FROM (
  SELECT unnest(ARRAY['Founder','Co-Founder','Chairman','Managing Director','Chief Executive Officer (CEO)','Chief Operating Officer (COO)','Chief Technology Officer (CTO)','Chief Financial Officer (CFO)','Chief Marketing Officer (CMO)','Chief Human Resources Officer (CHRO)']) n, 'Executive Leadership' c, 'executive' s
  UNION ALL SELECT unnest(ARRAY['President','Vice President','Executive Director','Director','General Manager','Senior General Manager','Assistant General Manager','Department Head']), 'Senior Leadership', 'senior_leadership'
  UNION ALL SELECT unnest(ARRAY['Senior Manager','Manager','Assistant Manager','Operations Manager','Project Manager','Program Manager','Team Lead','Technical Lead','Team Leader','Supervisor']), 'Management', 'management'
  UNION ALL SELECT unnest(ARRAY['Software Engineer','Senior Software Engineer','Frontend Developer','Backend Developer','Full Stack Developer','Website Developer','Shopify Developer','WordPress Developer','React Developer','Next.js Developer','Mobile App Developer','DevOps Engineer','Cloud Engineer','System Administrator','IT Administrator','Cybersecurity Analyst','Database Administrator','Data Analyst','Data Engineer','QA Engineer','Automation Tester','Manual Tester','Business Analyst','Product Manager']), 'Technology & Engineering', NULL
  UNION ALL SELECT unnest(ARRAY['UI Designer','UX Designer','UI/UX Designer','Graphic Designer','Motion Graphics Designer','Video Editor','Content Writer','Copywriter','Creative Director','Art Director','Photographer','Animator']), 'Design & Creative', NULL
  UNION ALL SELECT unnest(ARRAY['Sales Director','Sales Manager','Sales Executive','Business Development Manager','Business Development Executive','Account Executive','Account Manager','Marketing Manager','Digital Marketing Executive','SEO Executive','SEM Specialist','Performance Marketing Executive','Social Media Manager','Social Media Executive','Growth Manager','Brand Manager','Affiliate Marketing Manager']), 'Sales & Marketing', NULL
  UNION ALL SELECT unnest(ARRAY['HR Director','HR Manager','HR Business Partner','HR Executive','HR Generalist','Talent Acquisition Manager','Recruiter','Recruitment Executive','Payroll Executive','Training & Development Manager']), 'Human Resources', NULL
  UNION ALL SELECT unnest(ARRAY['Finance Director','Finance Manager','Accountant','Senior Accountant','Junior Accountant','Accounts Executive','Accounts Payable Executive','Accounts Receivable Executive','Financial Analyst','Auditor','Tax Consultant']), 'Finance & Accounting', NULL
  UNION ALL SELECT unnest(ARRAY['Customer Support Manager','Customer Support Executive','Customer Service Representative','Technical Support Engineer','Customer Success Manager','Customer Success Executive','Relationship Manager','Call Center Executive','Team Leader – Support']), 'Customer Support & Success', NULL
  UNION ALL SELECT unnest(ARRAY['Operations Executive','Operations Analyst','Operations Supervisor','Procurement Manager','Purchase Executive','Supply Chain Manager','Logistics Manager','Logistics Executive','Warehouse Manager','Inventory Manager','Inventory Controller','Production Manager','Production Supervisor']), 'Operations & Supply Chain', NULL
  UNION ALL SELECT unnest(ARRAY['Senior Executive','Executive','Associate','Senior Associate','Junior Executive','Assistant','Trainee','Graduate Trainee','Intern','Consultant','Specialist','Coordinator','Officer','Clerk','Data Entry Operator','Office Assistant','Receptionist','Administrative Assistant']), 'General & Entry-Level', NULL
) g
ON CONFLICT DO NOTHING;

-- Interns and trainees sit below the generic entry inference.
UPDATE public.org_unit_catalog SET seniority = 'entry' WHERE kind = 'designation' AND name IN ('Intern','Trainee','Graduate Trainee');
UPDATE public.org_unit_catalog SET seniority = 'junior' WHERE kind = 'designation' AND name IN ('Junior Accountant','Junior Executive','Manual Tester','Data Entry Operator');

-- Which department category each designation category belongs to, for
-- "relevant designations first" in the employee form.
ALTER TABLE public.org_unit_catalog ADD COLUMN IF NOT EXISTS department_hint text;
UPDATE public.org_unit_catalog SET department_hint = CASE category
  WHEN 'Technology & Engineering' THEN 'Technology & Product'
  WHEN 'Design & Creative' THEN 'Technology & Product'
  WHEN 'Sales & Marketing' THEN 'Sales & Customer Management'
  WHEN 'Customer Support & Success' THEN 'Sales & Customer Management'
  WHEN 'Human Resources' THEN 'Management & Administration'
  WHEN 'Finance & Accounting' THEN 'Management & Administration'
  WHEN 'Operations & Supply Chain' THEN 'Business Operations'
  ELSE NULL END
WHERE kind = 'designation';

-- Industry templates (suggestions only).
INSERT INTO public.org_structure_templates (code, name, departments, designations, sort_order) VALUES
('it_software', 'IT & Software Company',
  ARRAY['Executive Management','Human Resources (HR)','Finance & Accounting','Information Technology (IT)','Software Engineering','Product Management','UI/UX & Creative Design','Quality Assurance (QA)','Data & Analytics','Cybersecurity','Sales & Business Development','Customer Success'],
  ARRAY['Chief Executive Officer (CEO)','Chief Technology Officer (CTO)','Technical Lead','Software Engineer','Senior Software Engineer','Frontend Developer','Backend Developer','Full Stack Developer','DevOps Engineer','QA Engineer','UI/UX Designer','Product Manager','Business Analyst','Data Analyst','HR Manager','Accountant'], 10),
('digital_agency', 'Digital Marketing Agency',
  ARRAY['Executive Management','Marketing & Growth','Creative & Content','UI/UX & Creative Design','Sales & Business Development','Customer Success','Project & Program Management','Finance & Accounting','Human Resources (HR)'],
  ARRAY['Managing Director','Creative Director','Art Director','Account Manager','Project Manager','Digital Marketing Executive','SEO Executive','SEM Specialist','Performance Marketing Executive','Social Media Manager','Social Media Executive','Graphic Designer','Video Editor','Content Writer','Copywriter','Website Developer','Business Development Executive'], 20),
('ecommerce', 'E-commerce Business',
  ARRAY['Executive Management','E-commerce & Digital Commerce','Marketing & Growth','Customer Support','Operations','Inventory & Warehouse','Supply Chain & Logistics','Creative & Content','Finance & Accounting','Human Resources (HR)'],
  ARRAY['Founder','Operations Manager','Marketing Manager','Performance Marketing Executive','Social Media Executive','Shopify Developer','Graphic Designer','Content Writer','Customer Support Executive','Customer Service Representative','Call Center Executive','Inventory Manager','Warehouse Manager','Logistics Executive','Accountant'], 30),
('retail', 'Retail & Supermarket',
  ARRAY['Executive Management','Operations','Sales & Business Development','Inventory & Warehouse','Procurement & Vendor Management','Customer Support','Finance & Accounting','Human Resources (HR)'],
  ARRAY['General Manager','Operations Manager','Supervisor','Sales Executive','Inventory Controller','Purchase Executive','Procurement Manager','Warehouse Manager','Customer Service Representative','Accountant','HR Executive','Clerk','Assistant'], 40),
('manufacturing', 'Manufacturing Company',
  ARRAY['Executive Management','Production & Manufacturing','Quality Assurance (QA)','Procurement & Vendor Management','Supply Chain & Logistics','Inventory & Warehouse','Research & Development (R&D)','Sales & Business Development','Finance & Accounting','Human Resources (HR)','Administration & Facilities'],
  ARRAY['Managing Director','General Manager','Production Manager','Production Supervisor','QA Engineer','Procurement Manager','Purchase Executive','Supply Chain Manager','Logistics Manager','Warehouse Manager','Inventory Controller','Sales Manager','Accountant','HR Manager','Supervisor'], 50),
('healthcare', 'Healthcare & Hospital',
  ARRAY['Executive Management','Administration & Facilities','Operations','Customer Support','Finance & Accounting','Human Resources (HR)','Information Technology (IT)','Legal & Compliance','Procurement & Vendor Management'],
  ARRAY['Managing Director','General Manager','Operations Manager','Department Head','Supervisor','Receptionist','Administrative Assistant','Customer Service Representative','Accountant','HR Manager','IT Administrator','Purchase Executive','Coordinator'], 60),
('education', 'Education & Institution',
  ARRAY['Executive Management','Administration & Facilities','Operations','Marketing & Growth','Sales & Business Development','Customer Support','Finance & Accounting','Human Resources (HR)','Information Technology (IT)','Creative & Content'],
  ARRAY['Director','Department Head','Coordinator','Consultant','Specialist','Marketing Manager','Business Development Executive','Content Writer','Receptionist','Administrative Assistant','Accountant','HR Executive','IT Administrator'], 70),
('financial_services', 'Financial Services',
  ARRAY['Executive Management','Finance & Accounting','Sales & Business Development','Customer Success','Customer Support','Legal & Compliance','Operations','Information Technology (IT)','Data & Analytics','Human Resources (HR)'],
  ARRAY['Chief Executive Officer (CEO)','Chief Financial Officer (CFO)','Finance Director','Finance Manager','Financial Analyst','Relationship Manager','Account Manager','Sales Executive','Auditor','Tax Consultant','Senior Accountant','Operations Analyst','Data Analyst','Customer Support Executive'], 80),
('logistics', 'Logistics & Transportation',
  ARRAY['Executive Management','Operations','Supply Chain & Logistics','Inventory & Warehouse','Procurement & Vendor Management','Customer Support','Sales & Business Development','Finance & Accounting','Human Resources (HR)'],
  ARRAY['General Manager','Operations Manager','Logistics Manager','Logistics Executive','Supply Chain Manager','Warehouse Manager','Inventory Controller','Operations Supervisor','Customer Support Executive','Sales Executive','Accountant','Data Entry Operator'], 90),
('professional_services', 'Professional Services',
  ARRAY['Executive Management','Project & Program Management','Sales & Business Development','Customer Success','Legal & Compliance','Finance & Accounting','Human Resources (HR)','Administration & Facilities'],
  ARRAY['Managing Director','Director','Senior Manager','Project Manager','Consultant','Senior Associate','Associate','Business Analyst','Account Manager','Business Development Manager','Accountant','HR Business Partner','Administrative Assistant'], 100),
('hospitality', 'Hospitality & Restaurant',
  ARRAY['Executive Management','Operations','Customer Support','Marketing & Growth','Procurement & Vendor Management','Inventory & Warehouse','Finance & Accounting','Human Resources (HR)'],
  ARRAY['General Manager','Operations Manager','Supervisor','Team Leader','Receptionist','Customer Service Representative','Purchase Executive','Inventory Controller','Marketing Manager','Social Media Executive','Accountant','HR Executive','Trainee'], 110),
('construction', 'Construction & Real Estate',
  ARRAY['Executive Management','Project & Program Management','Operations','Sales & Business Development','Procurement & Vendor Management','Legal & Compliance','Finance & Accounting','Human Resources (HR)','Administration & Facilities'],
  ARRAY['Managing Director','Director','Project Manager','Program Manager','Supervisor','Sales Manager','Sales Executive','Relationship Manager','Procurement Manager','Purchase Executive','Accountant','HR Executive','Coordinator'], 120)
ON CONFLICT (code) DO UPDATE SET name = excluded.name, departments = excluded.departments, designations = excluded.designations, sort_order = excluded.sort_order;

-- ── 3. Extra fields on existing org-scoped tables ──────────────────────────
ALTER TABLE public.branches
  ADD COLUMN IF NOT EXISTS branch_type text CHECK (char_length(branch_type) <= 60),
  ADD COLUMN IF NOT EXISTS manager_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS phone text CHECK (char_length(phone) <= 40),
  ADD COLUMN IF NOT EXISTS email text CHECK (char_length(email) <= 200);
CREATE INDEX IF NOT EXISTS idx_fk_branches_manager_id ON public.branches (manager_id);

ALTER TABLE public.departments
  ADD COLUMN IF NOT EXISTS category text CHECK (char_length(category) <= 80),
  ADD COLUMN IF NOT EXISTS description text CHECK (char_length(description) <= 1000);

ALTER TABLE public.designations
  ADD COLUMN IF NOT EXISTS category text CHECK (char_length(category) <= 80),
  ADD COLUMN IF NOT EXISTS seniority text CHECK (seniority IN ('executive', 'senior_leadership', 'management', 'senior', 'mid', 'junior', 'entry')),
  ADD COLUMN IF NOT EXISTS description text CHECK (char_length(description) <= 2000),
  ADD COLUMN IF NOT EXISTS reports_to_id uuid REFERENCES public.designations(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_fk_designations_reports_to_id ON public.designations (reports_to_id);

-- ── 4. Case-insensitive duplicate guard (archived rows still count, so a
--      retired name is restored instead of duplicated).
CREATE UNIQUE INDEX IF NOT EXISTS branches_org_lower_name ON public.branches (org_id, lower(btrim(name)));
CREATE UNIQUE INDEX IF NOT EXISTS departments_org_lower_name ON public.departments (org_id, lower(btrim(name)));
CREATE UNIQUE INDEX IF NOT EXISTS designations_org_lower_name ON public.designations (org_id, lower(btrim(name)));

-- Bulk add from the catalog / a template. SECURITY INVOKER: the caller's RLS
-- (admin or organisation:manage, own org only) decides; existing names are
-- skipped, never duplicated or overwritten.
CREATE OR REPLACE FUNCTION public.add_org_units(p_kind text, p_names text[])
RETURNS int LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE added int;
BEGIN
  IF p_kind NOT IN ('department', 'designation') THEN RAISE EXCEPTION 'Unknown kind' USING ERRCODE = '22023'; END IF;
  IF coalesce(array_length(p_names, 1), 0) > 200 THEN RAISE EXCEPTION 'Too many at once' USING ERRCODE = '22023'; END IF;
  IF p_kind = 'department' THEN
    WITH ins AS (
      INSERT INTO public.departments (name, category)
      SELECT DISTINCT ON (lower(btrim(n))) btrim(n), c.category
        FROM unnest(p_names) n
        LEFT JOIN public.org_unit_catalog c ON c.kind = 'department' AND lower(c.name) = lower(btrim(n))
       WHERE char_length(btrim(n)) BETWEEN 1 AND 120
      ON CONFLICT (org_id, lower(btrim(name))) DO NOTHING
      RETURNING 1)
    SELECT count(*) INTO added FROM ins;
  ELSE
    WITH ins AS (
      INSERT INTO public.designations (name, category, seniority)
      SELECT DISTINCT ON (lower(btrim(n))) btrim(n), c.category, c.seniority
        FROM unnest(p_names) n
        LEFT JOIN public.org_unit_catalog c ON c.kind = 'designation' AND lower(c.name) = lower(btrim(n))
       WHERE char_length(btrim(n)) BETWEEN 1 AND 120
      ON CONFLICT (org_id, lower(btrim(name))) DO NOTHING
      RETURNING 1)
    SELECT count(*) INTO added FROM ins;
  END IF;
  RETURN added;
END $$;
REVOKE EXECUTE ON FUNCTION public.add_org_units(text, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_org_units(text, text[]) TO authenticated;

-- ── 5. Employment fields + same-org guard on profiles ──────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS employment_type text CHECK (employment_type IN ('full_time', 'part_time', 'contract', 'intern', 'consultant', 'temporary')),
  ADD COLUMN IF NOT EXISTS work_arrangement text CHECK (work_arrangement IN ('onsite', 'remote', 'hybrid')),
  ADD COLUMN IF NOT EXISTS employee_grade text CHECK (char_length(employee_grade) <= 40),
  ADD COLUMN IF NOT EXISTS employment_status text CHECK (employment_status IN ('active', 'probation', 'notice_period', 'on_leave', 'suspended', 'exited'));

CREATE OR REPLACE FUNCTION public.profiles_unit_org_check()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.branch_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.branches WHERE id = NEW.branch_id AND org_id IS NOT DISTINCT FROM NEW.org_id) THEN
    RAISE EXCEPTION 'Branch belongs to another organisation' USING ERRCODE = '42501';
  END IF;
  IF NEW.department_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.departments WHERE id = NEW.department_id AND org_id IS NOT DISTINCT FROM NEW.org_id) THEN
    RAISE EXCEPTION 'Department belongs to another organisation' USING ERRCODE = '42501';
  END IF;
  IF NEW.designation_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.designations WHERE id = NEW.designation_id AND org_id IS NOT DISTINCT FROM NEW.org_id) THEN
    RAISE EXCEPTION 'Designation belongs to another organisation' USING ERRCODE = '42501';
  END IF;
  IF NEW.manager_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = NEW.manager_id AND org_id IS NOT DISTINCT FROM NEW.org_id) THEN
    RAISE EXCEPTION 'Manager belongs to another organisation' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.profiles_unit_org_check() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_profiles_unit_org ON public.profiles;
CREATE TRIGGER trg_profiles_unit_org
  BEFORE INSERT OR UPDATE OF branch_id, department_id, designation_id, manager_id, org_id ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_unit_org_check();

-- Same guard for the people / designation a unit points at.
CREATE OR REPLACE FUNCTION public.org_unit_ref_check()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  -- Separate IF blocks: plpgsql only resolves NEW.<field> for the branch it runs.
  IF TG_TABLE_NAME = 'branches' THEN
    IF NEW.manager_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = NEW.manager_id AND org_id IS NOT DISTINCT FROM NEW.org_id) THEN
      RAISE EXCEPTION 'That person belongs to another organisation' USING ERRCODE = '42501';
    END IF;
  ELSIF TG_TABLE_NAME = 'departments' THEN
    IF NEW.head_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = NEW.head_id AND org_id IS NOT DISTINCT FROM NEW.org_id) THEN
      RAISE EXCEPTION 'That person belongs to another organisation' USING ERRCODE = '42501';
    END IF;
    IF NEW.parent_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.departments WHERE id = NEW.parent_id AND org_id IS NOT DISTINCT FROM NEW.org_id) THEN
      RAISE EXCEPTION 'Parent department belongs to another organisation' USING ERRCODE = '42501';
    END IF;
  ELSIF TG_TABLE_NAME = 'designations' THEN
    IF NEW.department_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.departments WHERE id = NEW.department_id AND org_id IS NOT DISTINCT FROM NEW.org_id) THEN
      RAISE EXCEPTION 'Department belongs to another organisation' USING ERRCODE = '42501';
    END IF;
    IF NEW.reports_to_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.designations WHERE id = NEW.reports_to_id AND org_id IS NOT DISTINCT FROM NEW.org_id) THEN
      RAISE EXCEPTION 'Reporting designation belongs to another organisation' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.org_unit_ref_check() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_branches_ref_org ON public.branches;
CREATE TRIGGER trg_branches_ref_org BEFORE INSERT OR UPDATE ON public.branches FOR EACH ROW EXECUTE FUNCTION public.org_unit_ref_check();
DROP TRIGGER IF EXISTS trg_departments_ref_org ON public.departments;
CREATE TRIGGER trg_departments_ref_org BEFORE INSERT OR UPDATE ON public.departments FOR EACH ROW EXECUTE FUNCTION public.org_unit_ref_check();
DROP TRIGGER IF EXISTS trg_designations_ref_org ON public.designations;
CREATE TRIGGER trg_designations_ref_org BEFORE INSERT OR UPDATE ON public.designations FOR EACH ROW EXECUTE FUNCTION public.org_unit_ref_check();

COMMIT;
