"use client";
import React, { useState } from 'react';
import { X, Minus, Maximize2, Hash, ChevronLeft, Search } from 'lucide-react';
import { useChat } from '@/context/ChatContext';
import { useCurrentProfile } from '@/hooks/useCurrentProfile';
import { ChannelList } from './ChannelList';
import { MessageList } from './MessageList';
import { ChatInput } from './ChatInput';
import { cn } from '@/lib/utils';
import { Avatar } from '@/components/ui';

export function ChatWindow() {
  const { isChatOpen, setIsChatOpen, activeChannel, setActiveChannel, onlineUsers } = useChat();
  const { profile } = useCurrentProfile();
  const [isMinimized, setIsMinimized] = useState(false);

  if (!isChatOpen) return null;

  // Determine online status for the header
  const getStatus = () => {
    if (!activeChannel) return null;
    if (activeChannel.type === 'group') return { label: 'Active', color: 'text-emerald-400' };
    
    // For DMs, we need to know if the other person is online
    // We check all_members which we added to the channel object in ChannelList
    const otherMemberId = activeChannel.all_members?.find((m: any) => m.user_id !== profile?.id)?.user_id;
    const isOnline = otherMemberId && onlineUsers.includes(otherMemberId);
    
    return isOnline 
      ? { label: 'Online', color: 'text-emerald-400' }
      : { label: 'Offline', color: 'text-gray-400' };
  };

  const status = getStatus();

  return (
    <div className={cn(
      "fixed bottom-4 right-4 z-[100] bg-white border border-[#eceae4] rounded-2xl shadow-2xl overflow-hidden transition-all duration-300 flex flex-col",
      isMinimized ? "h-14 w-72" : "h-[550px] w-[380px]"
    )}>
      {/* Header */}
      <header className="h-14 bg-[#1c1c1c] text-[#fcfbf8] px-4 flex items-center justify-between flex-shrink-0 cursor-pointer" onClick={() => isMinimized && setIsMinimized(false)}>
        <div className="flex items-center gap-2.5 overflow-hidden">
          {activeChannel ? (
            <>
              <button aria-label="Back" 
                onClick={(e) => { e.stopPropagation(); setActiveChannel(null); }}
                className="p-1 hover:bg-white/10 rounded-lg transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <div className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center text-white flex-shrink-0">
                {activeChannel.type === 'direct' ? <Avatar name={activeChannel.displayName || activeChannel.name} size="sm" /> : <Hash className="w-3.5 h-3.5" />}
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-xs font-bold truncate leading-tight">{activeChannel.displayName || activeChannel.name}</span>
                {status && (
                  <span className={cn("text-[9px] font-bold uppercase tracking-widest leading-none", status.color)}>
                    {status.label}
                  </span>
                )}
              </div>
            </>
          ) : (
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center">
                <Hash className="w-3.5 h-3.5" />
              </div>
              <span className="text-xs font-bold tracking-tight">Team Hub</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-1">
          <button aria-label="Minimise" 
            onClick={(e) => { e.stopPropagation(); setIsMinimized(!isMinimized); }}
            className="p-1.5 hover:bg-white/10 rounded-lg transition-colors"
          >
            <Minus className="w-4 h-4" />
          </button>
          <button aria-label="Close" 
            onClick={(e) => { e.stopPropagation(); setIsChatOpen(false); }}
            className="p-1.5 hover:bg-white/10 rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Content */}
      {!isMinimized && (
        <div className="flex-1 flex flex-col overflow-hidden bg-[#f8f7f4]">
          {!activeChannel ? (
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="p-3 border-b border-[#eceae4]">
                 <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-[#5f5f5d]" />
                    <input type="text" placeholder="Find people or channels..." className="w-full bg-[#eceae4]/50 border-none rounded-lg py-1.5 pl-8 pr-4 text-[11px] font-medium placeholder:text-[#5f5f5d]/50" />
                 </div>
              </div>
              <div className="flex-1 overflow-y-auto">
                <ChannelList />
              </div>
            </div>
          ) : (
            <>
              <div className="flex-1 overflow-hidden flex flex-col">
                <MessageList />
              </div>
              <ChatInput />
            </>
          )}
        </div>
      )}
    </div>
  );
}
