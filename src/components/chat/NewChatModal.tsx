"use client";
import React, { useState, useEffect } from 'react';
import { Search, Plus, UserPlus, Hash, MessageSquare, Megaphone, Loader2 } from 'lucide-react';
import { Modal, Avatar } from '@/components/ui';
import { cn } from '@/lib/utils';
import { createClient } from '@/lib/supabase';
import { useChat } from '@/context/ChatContext';
import { useCurrentProfile } from '@/hooks/useCurrentProfile';
import toast from 'react-hot-toast';

export function NewChatModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<'dm' | 'group'>('dm');
  const [groupName, setGroupName] = useState("");
  const [creating, setCreating] = useState(false);
  
  const supabase = createClient();
  const { setActiveChannel } = useChat();
  const { profile } = useCurrentProfile();
  const isAdmin = profile?.role === 'admin';

  useEffect(() => {
    if (open) {
      fetchUsers();
      setTab('dm');
      setGroupName("");
    }
  }, [open]);

  const fetchUsers = async () => {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .neq('id', user?.id)
      .order('name');
    
    if (data) setUsers(data);
    setLoading(false);
  };

  const startDM = async (targetUser: any) => {
    if (creating) return;
    try {
      setCreating(true);
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) return;

      // 1. Robust existing DM check
      const { data: myMemberships } = await supabase
        .from('channel_members')
        .select('channel_id, channels!inner(*)')
        .eq('user_id', user.id)
        .eq('channels.type', 'direct');

      if (myMemberships && myMemberships.length > 0) {
        const myChannelIds = myMemberships.map(m => m.channel_id);
        const { data: existingMembers } = await supabase
          .from('channel_members')
          .select('*, channels(*)')
          .in('channel_id', myChannelIds)
          .eq('user_id', targetUser.id);

        if (existingMembers && existingMembers.length > 0) {
          // Sort to get the most recent/relevant one if duplicates exist
          const latestDm = existingMembers.sort((a, b) => 
            new Date(b.joined_at).getTime() - new Date(a.joined_at).getTime()
          )[0];
          
          setActiveChannel(latestDm.channels);
          onClose();
          return;
        }
      }

      // 2. Create new DM
      const { data: channel, error: createError } = await supabase
        .from('channels')
        .insert({
          name: targetUser.name,
          type: 'direct',
          created_by: user.id,
          metadata: { is_direct: true }
        })
        .select()
        .single();

      if (createError) throw createError;

      const { error: memberError } = await supabase.from('channel_members').insert([
        { channel_id: channel.id, user_id: user.id, role: 'admin' },
        { channel_id: channel.id, user_id: targetUser.id, role: 'member' }
      ]);

      if (memberError) throw memberError;

      setActiveChannel(channel);
      onClose();
      toast.success(`Conversation with ${targetUser.name} started`);
    } catch (err: any) {
      console.error("DM Start Error:", err);
      toast.error(`Error: ${err.message || "Failed to start conversation"}`);
    } finally {
      setCreating(false);
    }
  };

  const createGroup = async () => {
    if (!groupName.trim()) return;
    try {
      setCreating(true);
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) return;

      const { data: channel, error: createError } = await supabase
        .from('channels')
        .insert({
          name: groupName.trim(),
          type: 'group',
          created_by: user.id,
          metadata: { is_announcement: true }
        })
        .select()
        .single();

      if (createError) throw createError;

      // Add ALL users to announcement group
      const { data: allProfiles } = await supabase.from('profiles').select('id');
      if (allProfiles) {
        const members = allProfiles.map(p => ({
          channel_id: channel.id,
          user_id: p.id,
          role: p.id === user.id ? 'admin' : 'member'
        }));
        await supabase.from('channel_members').insert(members);
      }

      setActiveChannel(channel);
      onClose();
      toast.success(`Announcement Group "${groupName}" created for all members`);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setCreating(false);
    }
  };

  const filtered = users.filter(u => u.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <Modal open={open} onClose={onClose} title="New Conversation" maxWidth="max-w-md">
      <div className="space-y-4">
        {isAdmin && (
          <div className="flex bg-[#eceae4]/50 p-1 rounded-xl">
            <button 
              onClick={() => setTab('dm')}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 py-2 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all",
                tab === 'dm' ? "bg-white text-[#1c1c1c] shadow-sm" : "text-[#5f5f5d] hover:text-[#1c1c1c]"
              )}
            >
              <UserPlus className="w-3.5 h-3.5" />
              Direct Message
            </button>
            <button 
              onClick={() => setTab('group')}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 py-2 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all",
                tab === 'group' ? "bg-white text-[#1c1c1c] shadow-sm" : "text-[#5f5f5d] hover:text-[#1c1c1c]"
              )}
            >
              <Megaphone className="w-3.5 h-3.5" />
              Announcement Group
            </button>
          </div>
        )}

        {tab === 'dm' ? (
          <>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input 
                type="text" 
                placeholder="Search teammates..." 
                className="w-full bg-gray-50 border border-gray-200 rounded-xl py-2.5 pl-10 pr-4 text-sm outline-none focus:ring-2 focus:ring-[#1c1c1c]/5 focus:border-[#1c1c1c]"
                value={search}
                onChange={e => setSearch(e.target.value)}
                autoFocus
              />
            </div>

            <div className="max-h-[400px] overflow-y-auto space-y-1 pr-2 custom-scrollbar">
              {loading ? (
                <div className="p-8 text-center text-gray-400 text-xs">Loading teammates...</div>
              ) : filtered.length === 0 ? (
                <div className="p-8 text-center text-gray-400 text-xs">No users found</div>
              ) : (
                filtered.map(u => (
                  <button 
                    key={u.id}
                    onClick={() => startDM(u)}
                    className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 transition-colors group text-left"
                  >
                    <Avatar name={u.name} />
                    <div className="flex-1">
                      <div className="text-sm font-bold text-[#1c1c1c]">{u.name}</div>
                      <div className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">{u.role || 'Agent'}</div>
                    </div>
                    <MessageSquare className="w-4 h-4 text-gray-300 group-hover:text-[#1c1c1c] transition-colors" />
                  </button>
                ))
              )}
            </div>
          </>
        ) : (
          <div className="space-y-6 py-4">
            <div className="text-center space-y-2">
              <div className="w-12 h-12 bg-[#eceae4] rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Megaphone className="w-6 h-6 text-[#1c1c1c]" />
              </div>
              <h3 className="text-sm font-bold text-[#1c1c1c]">Create Announcement Group</h3>
              <p className="text-[10px] text-[#5f5f5d] uppercase tracking-widest leading-relaxed px-8">Create a space for important updates. Only you can invite others later.</p>
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-[#1c1c1c] uppercase tracking-widest px-1">Group Name</label>
                <input 
                  type="text"
                  placeholder="e.g. Sales Updates 2024"
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl py-3 px-4 text-sm outline-none focus:ring-2 focus:ring-[#1c1c1c]/5 focus:border-[#1c1c1c]"
                  value={groupName}
                  onChange={e => setGroupName(e.target.value)}
                />
              </div>
              <button 
                onClick={createGroup}
                disabled={!groupName.trim() || creating}
                className="w-full bg-[#1c1c1c] text-[#fcfbf8] py-3.5 rounded-xl text-xs font-black uppercase tracking-[0.2em] shadow-lg shadow-[#1c1c1c]/20 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:scale-100 flex items-center justify-center gap-2"
              >
                {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : "Create Group"}
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
