-- Add last message tracking to channels
ALTER TABLE channels ADD COLUMN IF NOT EXISTS last_message_content TEXT;
ALTER TABLE channels ADD COLUMN IF NOT EXISTS last_message_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE channels ADD COLUMN IF NOT EXISTS last_message_sender_id UUID REFERENCES profiles(id);

-- Update last message when a new message is inserted
CREATE OR REPLACE FUNCTION update_channel_last_message()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE channels
  SET 
    last_message_content = CASE 
      WHEN NEW.type = 'image' THEN '📷 Image'
      WHEN NEW.type = 'file' THEN '📄 File: ' || NEW.content
      ELSE NEW.content
    END,
    last_message_at = NEW.created_at,
    last_message_sender_id = NEW.sender_id
  WHERE id = NEW.channel_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_message_inserted ON messages;
CREATE TRIGGER on_message_inserted
  AFTER INSERT ON messages
  FOR EACH ROW
  EXECUTE FUNCTION update_channel_last_message();

-- Enable RLS on the new columns (already enabled for table, but just in case)
-- Policies are already permissive from our previous fix.
