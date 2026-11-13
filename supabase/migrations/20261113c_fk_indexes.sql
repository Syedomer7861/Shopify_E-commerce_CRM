-- Phase 1: index every single-column foreign key that has no index.
-- Without one, joins/filters on these columns and deletes of the parent row
-- scan the whole child table. Additive only: no data or rule changes.
-- Rollback: DROP INDEX each idx_fk_* index. Safe to re-run.
DO $$
DECLARE
  r RECORD;
  name TEXT;
BEGIN
  FOR r IN
    SELECT c.conrelid::regclass AS tbl, c.conrelid AS relid, a.attname AS col
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
    WHERE c.contype = 'f'
      AND c.connamespace = 'public'::regnamespace
      AND array_length(c.conkey, 1) = 1
      AND NOT EXISTS (
        SELECT 1 FROM pg_index i
        WHERE i.indrelid = c.conrelid AND i.indkey[0] = c.conkey[1]
      )
  LOOP
    name := left('idx_fk_' || (SELECT relname FROM pg_class WHERE oid = r.relid) || '_' || r.col, 63);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %s (%I)', name, r.tbl, r.col);
  END LOOP;
END $$;
