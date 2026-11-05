-- add_new_user_to_announcements() (pre-existing, not something this
-- session wrote) fires AFTER INSERT ON profiles and auto-joins every new
-- user to announcement channels. Its INSERT INTO channel_members omits
-- org_id, relying on the column default (current_org_id(), which reads
-- auth.uid()) — but this trigger always fires inside a DB-side insert
-- chain (handle_new_user on signup, or admin.ts's service-role employee
-- creation), never inside a real end-user HTTP request, so auth.uid() is
-- unset and the default resolves to NULL. Violates channel_members'
-- NOT NULL org_id, which rolls back the whole profiles insert — meaning
-- every future signup AND every new employee created via Team page would
-- fail outright, not just mine. Confirmed via the Phase 6a backfill.
--
-- Fix: use NEW.org_id (the just-inserted profile's own org_id, already
-- correct) instead of depending on the default at all.

-- Also scope the channels lookup itself to the new user's own org — the
-- original had no org filter at all, so a new org's user would get a
-- channel_members row pointing at ANOTHER org's announcement channel.
-- Today's chat RLS (channels/messages both check the row's own org_id,
-- not just membership) already stops that from exposing any real data,
-- but the stray cross-org membership row itself is wrong regardless.
CREATE OR REPLACE FUNCTION public.add_new_user_to_announcements()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  INSERT INTO channel_members (channel_id, user_id, role, org_id)
  SELECT id, NEW.id, 'member', NEW.org_id
  FROM channels
  WHERE (metadata->>'is_announcement')::boolean = true
    AND org_id = NEW.org_id;
  RETURN NEW;
END;
$function$;
