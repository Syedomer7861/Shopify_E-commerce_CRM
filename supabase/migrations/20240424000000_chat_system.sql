-- ============================================================
-- CureForever CRM — Internal Chat System Migration
-- ============================================================

-- Channels (group conversations)
CREATE TABLE IF NOT EXISTS channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,              -- e.g. "general", "agents-only"
  type TEXT NOT NULL DEFAULT 'group' CHECK (type IN ('group', 'direct', 'task')),
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  is_archived BOOLEAN DEFAULT false,
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Channel members
CREATE TABLE IF NOT EXISTS channel_members (
  channel_id UUID REFERENCES channels(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  joined_at TIMESTAMPTZ DEFAULT now(),
  last_read_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (channel_id, user_id)
);

-- Messages
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID REFERENCES channels(id) ON DELETE CASCADE,
  sender_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  content TEXT,
  type TEXT DEFAULT 'text' CHECK (type IN ('text', 'image', 'file', 'task_link', 'system')),
  file_url TEXT,                   -- filled if type is image or file
  task_id UUID,                    -- filled if type is task_link
  is_pinned BOOLEAN DEFAULT false,
  is_deleted BOOLEAN DEFAULT false, -- soft delete only
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Message receipts (seen/delivered)
CREATE TABLE IF NOT EXISTS message_receipts (
  message_id UUID REFERENCES messages(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'delivered' CHECK (status IN ('delivered', 'seen')),
  at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (message_id, user_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_messages_channel_created ON messages(channel_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_channel_members_user ON channel_members(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id);

-- Enable RLS
ALTER TABLE channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE channel_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_receipts ENABLE ROW LEVEL SECURITY;

-- Policies
DROP POLICY IF EXISTS "Users can see channels they are members of" ON channels;
CREATE POLICY "Users can see channels they are members of" ON channels FOR SELECT USING (
  id IN (SELECT channel_id FROM channel_members WHERE user_id = auth.uid()) OR 
  public.is_admin()
);

DROP POLICY IF EXISTS "Authenticated users can create channels" ON channels;
CREATE POLICY "Authenticated users can create channels" ON channels FOR INSERT WITH CHECK (
  auth.role() = 'authenticated'
);

DROP POLICY IF EXISTS "messages_view_members" ON messages;
CREATE POLICY "messages_view_members" ON messages
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM channel_members
    WHERE channel_id = messages.channel_id AND user_id = auth.uid()
  ) OR public.is_admin()
);

DROP POLICY IF EXISTS "messages_send_members" ON messages;
CREATE POLICY "messages_send_members" ON messages
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM channel_members
    WHERE channel_id = messages.channel_id AND user_id = auth.uid()
  ) OR public.is_admin()
);

DROP POLICY IF EXISTS "admin_all_channels" ON channels;
CREATE POLICY "admin_all_channels" ON channels FOR ALL TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "admin_all_members" ON channel_members;
CREATE POLICY "admin_all_members" ON channel_members FOR ALL TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "admin_all_messages" ON messages;
CREATE POLICY "admin_all_messages" ON messages FOR ALL TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "Users can join channels" ON channel_members;
CREATE POLICY "Users can join channels" ON channel_members 
FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Initial Default Channels
INSERT INTO channels (id, name, type) VALUES 
('00000000-0000-0000-0000-000000000001', 'general', 'group'),
('00000000-0000-0000-0000-000000000002', 'agents-only', 'group'),
('00000000-0000-0000-0000-000000000003', 'admin-ops', 'group'),
('00000000-0000-0000-0000-000000000004', 'announcements', 'group')
ON CONFLICT DO NOTHING;
