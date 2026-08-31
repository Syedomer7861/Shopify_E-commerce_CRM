"use client";
import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { ChatBus } from '@/lib/chat-bus';
import { useCurrentProfile } from '@/hooks/useCurrentProfile';
import { createClient } from '@/lib/supabase';
import toast from 'react-hot-toast';
import { isDemoMode } from "@/lib/demo";

interface ChatContextType {
  // Supabase Realtime behind a socket.io-shaped facade, so chat runs on
  // Vercel without the standalone chat_server.js process.
  socket: ChatBus | null;
  connected: boolean;
  unreadCount: number;
  activeChannel: any | null;
  onlineUsers: string[];
  setActiveChannel: (channel: any) => void;
  sendMessage: (channelId: string, content: string, type?: string, fileUrl?: string, taskId?: string) => void;
  isChatOpen: boolean;
  setIsChatOpen: (open: boolean) => void;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

export const ChatProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { profile } = useCurrentProfile();
  const [socket, setSocket] = useState<ChatBus | null>(null);
  const [connected, setConnected] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [activeChannel, setActiveChannelState] = useState<any>(null);
  const [onlineUsers, setOnlineUsers] = useState<string[]>([]);
  const [isChatOpen, setIsChatOpen] = useState(false);

  // Keep activeChannel accessible in socket event handlers without re-creating socket
  const activeChannelRef = useRef<any>(null);
  activeChannelRef.current = activeChannel;

  const supabase = createClient();

  // ── Unread count ─────────────────────────────────────────────────────────────
  const updateUnreadCount = useCallback(async () => {
    if (!profile?.id) return;
    const isDemo = isDemoMode();
    if (isDemo) {
      setUnreadCount(3);
      return;
    }
    try {
      const { data: memberships } = await supabase
        .from('channel_members')
        .select('channel_id, last_read_at')
        .eq('user_id', profile.id);

      if (!memberships?.length) { setUnreadCount(0); return; }

      let total = 0;
      for (const m of memberships) {
        if (activeChannelRef.current?.id === m.channel_id) continue;
        const { count } = await supabase
          .from('messages')
          .select('*', { count: 'exact', head: true })
          .eq('channel_id', m.channel_id)
          .gt('created_at', m.last_read_at || '2000-01-01')
          .neq('sender_id', profile.id);
        if (count) total += count;
      }
      setUnreadCount(total);
    } catch (err) {
      console.error('[Chat] Unread count error:', err);
    }
  }, [profile?.id, supabase]);

  // ── Switch channel ────────────────────────────────────────────────────────────
  const setActiveChannel = useCallback((channel: any) => {
    if (!channel) {
      setActiveChannelState(null);
      activeChannelRef.current = null;
      return;
    }

    // Optimistically mark as read in local state
    const updatedChannel = {
      ...channel,
      my_membership: channel.my_membership?.map((m: any) => 
        m.user_id === profile?.id ? { ...m, last_read_at: new Date().toISOString() } : m
      )
    };

    setActiveChannelState(updatedChannel);
    activeChannelRef.current = updatedChannel;

    const isDemo = isDemoMode();
    if (!isDemo && socket?.connected) {
      socket.emit('channel:join', { channelId: channel.id });
      socket.emit('message:seen', { channelId: channel.id });
      setTimeout(updateUnreadCount, 500);
    }
  }, [socket, updateUnreadCount, profile?.id]);

  // ── Init socket ONCE per profile ──────────────────────────────────────────────
  useEffect(() => {
    if (!profile?.id) return;

    updateUnreadCount();

    let newSocket: ChatBus;

    const initSocket = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;

      newSocket = new ChatBus(supabase, {
        id: profile.id,
        name: profile.name,
        role: profile.role,
      });

      newSocket.on('connect', () => {
        setConnected(true);
      });

      newSocket.on('connect_error', (err: Error) => {
        console.warn('[Chat] Realtime connection error:', err.message);
        setConnected(false);
      });

      newSocket.on('disconnect', () => {
        setConnected(false);
      });

      newSocket.on('presence:initial', setOnlineUsers);
      newSocket.on('presence:update',  setOnlineUsers);

      newSocket.on('message:new', (message: any) => {
        const isFocused = document.visibilityState === 'visible';
        const isCurrentChannel = activeChannelRef.current?.id === message.channel_id;

        // Sound & Notification Logic
        if (message.sender_id !== profile.id) {
          const soundEnabled = localStorage.getItem('chat_sounds') !== 'false';
          const notifEnabled = localStorage.getItem('chat_notifications') !== 'false';

          if (soundEnabled) {
            const audio = new Audio('/notification.mp3');
            audio.volume = 0.4;
            audio.play().catch(e => console.warn('[Chat] Sound failed:', e));
          }

          if (notifEnabled && (!isFocused || !isCurrentChannel)) {
            if ("Notification" in window && Notification.permission === "granted") {
              new Notification(`New message from ${message.sender_name || 'Team'}`, {
                body: message.type === 'text' ? message.content : 'Sent an attachment',
                icon: '/favicon.ico'
              });
            }
          }
        }

        // Use ref so this handler never goes stale
        if (!isCurrentChannel) {
          if (message.sender_id !== profile.id) {
            setUnreadCount(prev => prev + 1);
          }
        } else {
          // Currently viewing this channel — mark seen
          newSocket.emit('message:seen', { channelId: message.channel_id });
          
          // Update active channel ref/state to keep unread indicator clear
          setActiveChannelState((prev: any) => {
            if (prev?.id !== message.channel_id) return prev;
            return {
              ...prev,
              my_membership: prev.my_membership?.map((m: any) => 
                m.user_id === profile?.id ? { ...m, last_read_at: new Date().toISOString() } : m
              )
            };
          });
        }
      });

      newSocket.on('notification:mention', (data: any) => {
        toast(`💬 You were mentioned in a channel`, { duration: 4000 });
        updateUnreadCount();
      });

      newSocket.on('unread:refresh', updateUnreadCount);
      
      newSocket.on('system:sync_alert', (data: any) => {
        toast(data.message, {
          icon: data.type === 'success' ? '✅' : (data.type === 'error' ? '❌' : '🔄'),
          duration: 5000,
          id: 'sync-alert' // Prevent duplicate toasts if sync messages come fast
        });
      });

      newSocket.connect();
      setSocket(newSocket);
    };

    initSocket();

    return () => {
      newSocket?.disconnect();
      setSocket(null);
      setConnected(false);
    };
    // Only profile.id — NOT activeChannel — prevents connection churn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id, supabase, updateUnreadCount]);

  // ── Send message ─────────────────────────────────────────────────────────────
  const sendMessage = useCallback((
    channelId: string,
    content: string,
    type: string = 'text',
    fileUrl?: string,
    taskId?: string
  ) => {
    const isDemo = isDemoMode();
    if (isDemo) {
      toast.success('Demo: Message sent locally');
      // Dispatch a custom event that MessageList can listen to
      window.dispatchEvent(new CustomEvent('chat:demo_message', { 
        detail: { 
          id: 'demo-' + Date.now(),
          channel_id: channelId, 
          content, 
          type, 
          file_url: fileUrl, 
          task_id: taskId, 
          sender_id: profile?.id, 
          sender_name: profile?.name || 'Demo Presenter',
          created_at: new Date().toISOString(),
          sender: {
            id: profile?.id,
            name: profile?.name || 'Demo Presenter',
            role: profile?.role || 'agent'
          }
        } 
      }));
      return;
    }

    if (!socket || !connected) {
      toast.error('Chat not connected. Retrying...');
      return;
    }

    socket.emit('message:send', { channelId, content, type, fileUrl, taskId },
      async (response: any) => {
        if (!response?.ok) {
          toast.error(response?.error || 'Failed to send message');
        } else {
          const { logUserAction } = await import('@/lib/audit');
          logUserAction('chat_message_send',
            `Sent ${type} message to channel ${channelId}`,
            { channelId, type, content: type === 'text' ? content.substring(0, 50) : fileUrl }
          );
        }
      }
    );
  }, [socket, connected, profile]);

  return (
    <ChatContext.Provider value={{
      socket,
      connected,
      unreadCount,
      activeChannel,
      onlineUsers,
      setActiveChannel,
      sendMessage,
      isChatOpen,
      setIsChatOpen,
    }}>
      {children}
    </ChatContext.Provider>
  );
};

export const useChat = () => {
  const context = useContext(ChatContext);
  if (!context) throw new Error('useChat must be used within a ChatProvider');
  return context;
};
