-- ============================================================
-- FIX: Database error deleting user (Foreign Key Restrict)
-- ============================================================

-- 1. Fix 'channels.created_by' (was Restrict, now Set Null)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'channels_created_by_fkey') THEN
        ALTER TABLE channels DROP CONSTRAINT channels_created_by_fkey;
    END IF;
    ALTER TABLE channels ADD CONSTRAINT channels_created_by_fkey 
        FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;
END $$;

-- 2. Fix 'channels.last_message_sender_id' (was Restrict, now Set Null)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'channels_last_message_sender_id_fkey') THEN
        ALTER TABLE channels DROP CONSTRAINT channels_last_message_sender_id_fkey;
    END IF;
    ALTER TABLE channels ADD CONSTRAINT channels_last_message_sender_id_fkey 
        FOREIGN KEY (last_message_sender_id) REFERENCES profiles(id) ON DELETE SET NULL;
END $$;

-- 3. Verify the fix
SELECT 'Channel constraints updated to ON DELETE SET NULL' AS status;
