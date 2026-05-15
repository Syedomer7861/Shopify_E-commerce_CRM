"use client";
import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import Image from 'next/image';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { Paperclip, Trash2, WifiOff } from 'lucide-react';
import { Avatar } from '@/components/ui';
import { useChat } from '@/context/ChatContext';
import { createClient } from '@/lib/supabase';
import { useCurrentProfile } from '@/hooks/useCurrentProfile';
import toast from 'react-hot-toast';

export function MessageList({ searchQuery = "" }: { searchQuery?: string }) {
  const { activeChannel, socket, connected } = useChat();
  const { profile } = useCurrentProfile();
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [typingUsers, setTypingUsers] = useState<{ userId: string; userName: string }[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const supabase = useMemo(() => createClient(), []);

  const filteredMessages = messages.filter(msg => 
    msg.content?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    msg.sender?.name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const fetchMessages = useCallback(async () => {
    if (!activeChannel?.id) return;
    const channelId = activeChannel.id;
    const isDemo = document.cookie.includes("crm-demo-mode=true");
    
    if (isDemo) {
      setLoading(true);
      // Simulate some history
      setTimeout(() => {
        setMessages([
          {
            id: 'mock-1',
            channel_id: channelId,
            content: 'Hey team, how is the NDR clearance going?',
            sender_id: 'other-1',
            created_at: new Date(Date.now() - 3600000).toISOString(),
            sender: { name: 'Sarah Manager', role: 'manager' }
          },
          {
            id: 'mock-2',
            channel_id: channelId,
            content: 'Clearing the high-priority ones now. 15 done.',
            sender_id: 'other-2',
            created_at: new Date(Date.now() - 1800000).toISOString(),
            sender: { name: 'Agent John', role: 'agent' }
          }
        ]);
        setLoading(false);
      }, 400);
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('messages')
        .select('*, sender:profiles!sender_id(id, name, email, role)')
        .eq('channel_id', channelId)
        .order('created_at', { ascending: true })
        .limit(50);
      if (error) throw error;
      if (activeChannel?.id === channelId) setMessages(data || []);
    } catch (err) {
      console.error("Chat fetch error:", err);
      toast.error("Failed to load messages");
    } finally {
      if (activeChannel?.id === channelId) setLoading(false);
    }
  }, [activeChannel, supabase]);

  // ── Fetch messages on channel switch ─────────────────────────────────────────
  useEffect(() => {
    if (!activeChannel) return;
    setMessages([]);
    fetchMessages();
  }, [activeChannel?.id, fetchMessages]);

  // ── Demo Event Listener ──────────────────────────────────────────────────────
  useEffect(() => {
    const handleDemoMsg = (e: any) => {
      const msg = e.detail;
      if (msg.channel_id === activeChannel?.id) {
        setMessages(prev => [...prev, msg]);
      }
    };
    window.addEventListener('chat:demo_message', handleDemoMsg);
    return () => window.removeEventListener('chat:demo_message', handleDemoMsg);
  }, [activeChannel?.id]);

  // ── Socket event listeners ────────────────────────────────────────────────────
  useEffect(() => {
    if (!socket) return;
    const isDemo = document.cookie.includes("crm-demo-mode=true");
    if (isDemo) return; // Ignore live socket events in demo mode

    const handleNewMessage = (message: any) => {
      if (message.channel_id === activeChannel?.id) {
        setMessages(prev => [...prev, message]);
        setTypingUsers([]); // clear typing when message arrives
      }
    };

    const handleTyping = (data: any) => {
      if (data.channelId === activeChannel?.id && data.userId !== profile?.id) {
        setTypingUsers(prev => {
          const exists = prev.find(u => u.userId === data.userId);
          if (exists) return prev;
          return [...prev, { userId: data.userId, userName: data.userName }];
        });
      }
    };

    const handleStopTyping = (data: any) => {
      if (data.channelId === activeChannel?.id) {
        setTypingUsers(prev => prev.filter(u => u.userId !== data.userId));
      }
    };

    socket.on('message:new',      handleNewMessage);
    socket.on('user:typing',      handleTyping);
    socket.on('user:stop_typing', handleStopTyping);

    return () => {
      socket.off('message:new',      handleNewMessage);
      socket.off('user:typing',      handleTyping);
      socket.off('user:stop_typing', handleStopTyping);
    };
  }, [socket, activeChannel?.id, profile?.id]);

  // ── Auto-scroll on new messages ───────────────────────────────────────────────
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, typingUsers]);



  if (!activeChannel) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center p-8 bg-[#f8f7f4]">
        <div className="w-20 h-20 rounded-3xl bg-[#1c1c1c] flex items-center justify-center mb-5 shadow-2xl shadow-[#1c1c1c]/20">
          <span className="text-3xl">💬</span>
        </div>
        <h3 className="text-sm font-bold text-[#1c1c1c] uppercase tracking-widest">Internal Communications</h3>
        <p className="text-xs text-[#5f5f5d] mt-2 max-w-[280px] leading-relaxed opacity-60">
          Select a channel or teammate from the left to start collaborating in real-time.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-[#f8f7f4]">
      {/* Disconnected banner */}
      {!connected && (
        <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 border-b border-amber-200 text-amber-700 text-[10px] font-bold">
          <WifiOff className="w-3 h-3" />
          Chat server offline — new messages may be delayed. Reconnecting...
        </div>
      )}

      {/* Message scroll area */}
      <div className="flex-1 overflow-y-auto p-6 space-y-1 custom-scrollbar" ref={scrollRef}>
        {loading && (
          <div className="text-center py-4">
            <div className="inline-block w-4 h-4 border-2 border-[#1c1c1c]/20 border-t-[#1c1c1c] rounded-full animate-spin" />
          </div>
        )}

        {filteredMessages.map((msg, i) => {
          const isMe = msg.sender_id === profile?.id;
          const prevMsg = filteredMessages[i - 1];
          const isSameSender = prevMsg?.sender_id === msg.sender_id;
          const showAvatar = !isMe && !isSameSender;

          return (
            <div
              key={msg.id}
              className={cn(
                "flex items-start gap-3",
                isMe ? "flex-row-reverse" : "flex-row",
                isSameSender ? "mt-1" : "mt-5"
              )}
            >
              <div className="w-8 flex-shrink-0">
                {showAvatar && <Avatar name={msg.sender?.name || "User"} size="sm" />}
              </div>

              <div className={cn("flex flex-col max-w-[70%]", isMe ? "items-end" : "items-start")}>
                {!isSameSender && (
                  <div className="flex items-center gap-2 mb-1 px-1">
                    {!isMe && <span className="text-[10px] font-black text-[#1c1c1c] tracking-tight">{msg.sender?.name}</span>}
                    <span className="text-[8px] font-bold text-gray-400 uppercase tracking-tighter">
                      {format(new Date(msg.created_at), 'h:mm a')}
                    </span>
                  </div>
                )}

                <div className="relative group/msg">
                  <div className={cn(
                    "px-4 py-2.5 rounded-2xl text-xs leading-relaxed shadow-sm",
                    isMe
                      ? "bg-[#1c1c1c] text-[#fcfbf8] rounded-tr-none"
                      : "bg-white border border-[#eceae4] text-[#1c1c1c] rounded-tl-none"
                  )}>
                    {msg.type === 'image' && msg.file_url && (
                      <div className="mb-2 -mx-1">
                        <Image
                          src={msg.file_url}
                          alt="Attachment"
                          width={400}
                          height={300}
                          className="rounded-lg max-w-full h-auto cursor-pointer hover:opacity-90 transition-opacity"
                          onClick={() => window.open(msg.file_url, '_blank')}
                          unoptimized
                        />
                      </div>
                    )}
                    {msg.type === 'file' && msg.file_url && (
                      <a href={msg.file_url} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-2 py-1 underline decoration-[#1c1c1c]/20 hover:decoration-[#1c1c1c] transition-all">
                        <Paperclip className="w-3.5 h-3.5" />
                        <span>{msg.content || 'Download Attachment'}</span>
                      </a>
                    )}
                    {msg.content && msg.type !== 'file' && (
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                    )}
                  </div>

                  <button
                    onClick={async () => {
                      if (!confirm("Delete this message?")) return;
                      const { error } = await supabase.from('messages').delete().eq('id', msg.id);
                      if (error) toast.error("Failed to delete message");
                      else setMessages(prev => prev.filter(m => m.id !== msg.id));
                    }}
                    className={cn(
                      "absolute top-0 opacity-0 group-hover/msg:opacity-100 p-1 bg-white/90 shadow-sm border border-[#eceae4] rounded-lg text-rose-500 hover:bg-rose-500 hover:text-white transition-all z-10",
                      isMe ? "-left-8" : "-right-8"
                    )}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}

        {/* Typing indicator */}
        {typingUsers.length > 0 && (
          <div className="flex items-start gap-3 mt-3">
            <div className="w-8 flex-shrink-0">
              <Avatar name={typingUsers[0].userName} size="sm" />
            </div>
            <div className="bg-white border border-[#eceae4] rounded-2xl rounded-tl-none px-4 py-2.5 shadow-sm flex items-center gap-1.5">
              <span className="text-[10px] text-[#5f5f5d] font-medium">
                {typingUsers.map(u => u.userName).join(", ")} {typingUsers.length > 1 ? "are" : "is"} typing
              </span>
              <span className="flex gap-0.5">
                {[0,1,2].map(i => (
                  <span key={i} className="w-1 h-1 bg-[#5f5f5d]/40 rounded-full animate-bounce"
                    style={{ animationDelay: `${i * 0.15}s` }} />
                ))}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
