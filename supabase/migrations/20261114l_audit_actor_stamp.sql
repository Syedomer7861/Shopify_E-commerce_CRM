-- SEC-12 close-out: audit_logs is already append-only for members
-- (20261112b: INSERT own org, no UPDATE/DELETE policy). The gap left is that
-- a member could INSERT a row naming someone else as actor_id / actor_email.
--
-- This trigger stamps the real caller on every row written under a user JWT.
-- It never rejects a row (app writers already send their own id or null),
-- so no insert path breaks. Service-role and cron writers (auth.uid() null)
-- keep whatever actor they pass, as before.

CREATE OR REPLACE FUNCTION public.audit_logs_stamp_actor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    NEW.actor_id := auth.uid();
    NEW.actor_email := auth.jwt() ->> 'email';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS audit_logs_stamp_actor ON public.audit_logs;
CREATE TRIGGER audit_logs_stamp_actor
  BEFORE INSERT ON public.audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.audit_logs_stamp_actor();
