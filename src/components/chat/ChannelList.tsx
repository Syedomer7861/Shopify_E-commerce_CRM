"use client";
import React, { useEffect, useState } from 'react';
import { Hash, MessageCircle, Search, Plus, Archive, Settings, MessageSquare, UserPlus, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Avatar } from '@/components/ui';
import { useChat } from '@/context/ChatContext';
import { useCurrentProfile } from '@/hooks/useCurrentProfile';
import { createClient } from '@/lib/supabase';
import { NewChatModal } from './NewChatModal';
import toast from 'react-hot-toast';

export function ChannelList() {
  const { activeChannel, setActiveChannel, socket, onlineUsers } = useChat();
  const { profile } = useCurrentProfile();
  const isAdmin = profile?.role === 'admin';
  const [channels, setChannels] = useState<any[]>([]);
  const [directMessages, setDirectMessages] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [isNewChatOpen, setIsNewChatOpen] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    fetchChannels();
    const pollInterval = setInterval(fetchChannels, 60_000);

    // ── Supabase real-time: channel list refreshes on new messages ──
    let refreshTimeout: NodeJS.Timeout;
    const debouncedFetch = () => {
      clearTimeout(refreshTimeout);
      refreshTimeout = setTimeout(fetchChannels, 800);
    };

    const channel = supabase
      .channel("channel-list-live")
      .on("postgres_changes", { event: "*",      schema: "public", table: "channels" },        debouncedFetch)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" },        debouncedFetch)
      .on("postgres_changes", { event: "*",      schema: "public", table: "channel_members" }, debouncedFetch)
      .subscribe();

    return () => {
      clearInterval(pollInterval);
      clearTimeout(refreshTimeout);
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchChannels = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id;
    if (!userId) return;

    // Fetch channels user is member of
    const { data } = await supabase
      .from('channels')
      .select(`
        *,
        my_membership:channel_members!inner(user_id, last_read_at),
        all_members:channel_members(user_id, profiles:profiles(name, avatar_url))
      `)
      .eq('channel_members.user_id', userId)
      .order('last_message_at', { ascending: false });

    if (data) {
      const groups = data.filter(c => c.type === 'group' || c.type === 'task');
      setChannels(groups);

      // Deduplicate Direct Messages based on the set of members
      const dms = data.filter(c => c.type === 'direct');
      const uniqueDmsMap = new Map();

      for (const dm of dms) {
        // Create a unique key based on the pair of users involved
        const memberIds = dm.all_members?.map((m: any) => m.user_id).sort() || [];
        const key = memberIds.length > 0 ? memberIds.join(':') : dm.id;
        
        // Resolve dynamic display name for DMs
        let resolvedName = dm.name;
        if (dm.type === 'direct') {
          const otherMember = dm.all_members?.find((m: any) => m.user_id !== userId);
          resolvedName = otherMember?.profiles?.name || dm.name || "Direct Message";
        }
        
        const dmWithMetadata = { ...dm, displayName: resolvedName };

        if (!uniqueDmsMap.has(key)) {
          uniqueDmsMap.set(key, dmWithMetadata);
        }
      }
      
      setDirectMessages(Array.from(uniqueDmsMap.values()));
    }
  };


  const filteredChannels = channels.filter(c => c.name.toLowerCase().includes(search.toLowerCase()));

  const renderChannel = (channel: any) => {
    const isSelected = activeChannel?.id === channel.id;
    const hasUnread = channel.last_message_at && channel.my_membership?.[0]?.last_read_at 
      ? new Date(channel.last_message_at) > new Date(channel.my_membership[0].last_read_at)
      : false;

    // Use dynamic name for DMs, original name for groups
    const displayName = channel.type === 'direct' ? channel.displayName : channel.name;

    // Check online status for DMs
    let isOnline = false;
    if (channel.type === 'direct' && profile) {
      const otherMember = channel.all_members?.find((m: any) => m.user_id !== profile.id);
      if (otherMember) {
        isOnline = onlineUsers.includes(otherMember.user_id);
      }
    } else if (channel.type === 'group') {
      isOnline = true;
    }

    return (
      <div
        key={channel.id}
        onClick={() => {
          // Optimistically update local state to clear unread indicator
          const updateFn = (prev: any[]) => prev.map(c => 
            c.id === channel.id 
              ? { 
                  ...c, 
                  my_membership: c.my_membership?.map((m: any) => 
                    m.user_id === profile?.id ? { ...m, last_read_at: new Date().toISOString() } : m
                  )
                } 
              : c
          );
          setChannels(updateFn);
          setDirectMessages(updateFn);
          
          setActiveChannel({ ...channel, displayName });
        }}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setActiveChannel({ ...channel, displayName });
          }
        }}
        className={cn(
          "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all group relative cursor-pointer outline-none focus:ring-2 ring-[#1c1c1c]/20",
          isSelected 
            ? "bg-[#1c1c1c] text-[#fcfbf8] shadow-lg shadow-[#1c1c1c]/10" 
            : "text-[#5f5f5d] hover:bg-white hover:shadow-md hover:shadow-[#1c1c1c]/5"
        )}
      >
        <div className="relative flex-shrink-0">
          {channel.type === 'direct' ? (
            <Avatar name={displayName} size="sm" />
          ) : (
            <div className={cn(
              "w-8 h-8 rounded-lg flex items-center justify-center transition-colors",
              isSelected ? "bg-[#fcfbf8]/10" : "bg-[#eceae4]"
            )}>
              <Hash className={cn("w-4 h-4", isSelected ? "text-[#fcfbf8]" : "text-[#5f5f5d]")} />
            </div>
          )}
          {isOnline && (
            <div className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-500 border-2 border-white rounded-full shadow-sm" />
          )}
          {hasUnread && !isSelected && !isOnline && (
            <div className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-500 border-2 border-white rounded-full" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-0.5">
            <span className={cn(
              "text-xs font-bold truncate",
              isSelected ? "text-[#fcfbf8]" : "text-[#1c1c1c]",
              hasUnread && !isSelected && "text-emerald-600"
            )}>
              {displayName}
            </span>
            <div className="flex items-center gap-2">
              {channel.last_message_at && (
                <span className={cn(
                  "text-[9px] font-bold uppercase tracking-tighter opacity-40 shrink-0",
                  isSelected ? "text-[#fcfbf8]" : "text-[#5f5f5d]"
                )}>
                  {new Date(channel.last_message_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
              {((channel.type === 'group' || channel.type === 'task') ? (isAdmin || profile?.role === 'manager') : true) && (
                <button 
                  onClick={async (e) => {
                    e.stopPropagation();
                    if (!confirm("Are you sure you want to delete this conversation?")) return;
                    
                    try {
                      // Use API route instead of direct Supabase call to bypass RLS issues
                      const res = await fetch(`/api/chat/delete-channel?id=${channel.id}`, {
                        method: 'DELETE'
                      });
                      const result = await res.json();
                      
                      if (!result.ok) {
                        console.error("Delete channel error:", result.error);
                        toast.error(`Failed to delete: ${result.error}`);
                        return;
                      }

                      // Optimistic Update
                      setChannels(prev => prev.filter(c => c.id !== channel.id));
                      setDirectMessages(prev => prev.filter(c => c.id !== channel.id));

                      // [ADMIN LOG] Log channel deletion
                      const { logUserAction } = await import("@/lib/audit");
                      await logUserAction(
                        "chat_channel_delete", 
                        `Deleted ${channel.type} channel: ${channel.name}`,
                        { channelId: channel.id, type: channel.type, name: channel.name }
                      ).catch(console.warn);
                      
                      toast.success("Channel deleted");
                      if (isSelected) setActiveChannel(null);
                      
                      // Small delay to allow DB/Realtime to settle
                      setTimeout(fetchChannels, 500);
                    } catch (err: any) {
                      console.error("Deletion catch:", err);
                      toast.error("An unexpected error occurred");
                    }
                  }}
                  className={cn(
                    "opacity-0 group-hover:opacity-100 p-1 hover:bg-rose-500 hover:text-white rounded transition-all",
                    isSelected ? "text-white/40" : "text-[#5f5f5d]/40"
                  )}
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>
          <p className={cn(
            "text-[10px] truncate leading-tight opacity-60",
            isSelected ? "text-[#fcfbf8]/70" : "text-[#5f5f5d]",
            hasUnread && !isSelected && "font-bold opacity-100 text-[#1c1c1c]"
          )}>
            {channel.last_message_content || "No messages yet"}
          </p>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto px-2 space-y-6 py-4 custom-scrollbar">
        {/* Group Channels */}
        <div className="space-y-1">
          <div className="flex items-center justify-between px-3 mb-2">
            <span className="text-[10px] font-bold text-[#5f5f5d] uppercase tracking-widest opacity-60">Channels</span>
            {isAdmin && (
              <button onClick={() => setIsNewChatOpen(true)} className="p-1 hover:bg-[#eceae4] rounded transition-colors">
                <Plus className="w-3.5 h-3.5 text-[#5f5f5d]" />
              </button>
            )}
          </div>
          {filteredChannels.map(renderChannel)}
        </div>

        {/* Direct Messages */}
        <div className="space-y-1">
          <div className="flex items-center justify-between px-3 mb-2">
            <span className="text-[10px] font-bold text-[#5f5f5d] uppercase tracking-widest opacity-60">Direct Messages</span>
            <button onClick={() => setIsNewChatOpen(true)} className="p-1 hover:bg-[#eceae4] rounded transition-colors">
              <UserPlus className="w-3.5 h-3.5 text-[#5f5f5d]" />
            </button>
          </div>
          {directMessages.length === 0 && (
            <div className="px-2 py-4 text-center">
              <button 
                onClick={() => setIsNewChatOpen(true)}
                className="text-[10px] font-bold text-[#1c1c1c]/40 hover:text-[#1c1c1c] transition-colors uppercase tracking-widest"
              >
                + Start Messaging
              </button>
            </div>
          )}
          {directMessages.map(renderChannel)}
        </div>
      </div>
      <NewChatModal open={isNewChatOpen} onClose={() => setIsNewChatOpen(false)} />
    </div>
  );
}
