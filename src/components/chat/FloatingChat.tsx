"use client";
import React from 'react';
import { MessageSquare } from 'lucide-react';
import { useChat } from '@/context/ChatContext';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function FloatingChat() {
  const { unreadCount, isChatOpen, setIsChatOpen } = useChat();

  return (
    <div className="fixed right-0 top-1/2 -translate-y-1/2 z-[100] group">
      <button 
        onClick={() => setIsChatOpen(!isChatOpen)}
        className={cn(
          "flex items-center gap-3 bg-[#1c1c1c] text-[#fcfbf8] pl-4 pr-3 py-3 rounded-l-2xl shadow-2xl transition-all duration-300 transform translate-x-2 group-hover:translate-x-0 hover:bg-[#2a2a2a] active:scale-95",
          unreadCount > 0 && "ring-2 ring-rose-500 ring-offset-2 ring-offset-transparent",
          isChatOpen && "translate-x-0 bg-rose-500"
        )}
      >
        <div className="relative">
          <MessageSquare className="w-5 h-5 transition-transform group-hover:scale-110" />
          {unreadCount > 0 && (
            <span className="absolute -top-3 -right-3 min-w-[18px] h-[18px] bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center rounded-full px-1 border-2 border-[#1c1c1c] animate-bounce">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </div>
        
        <div className="flex flex-col items-start overflow-hidden w-0 group-hover:w-24 transition-all duration-300">
          <span className="text-[10px] font-bold uppercase tracking-widest opacity-60 leading-none">Team</span>
          <span className="text-xs font-bold whitespace-nowrap">Chat Hub</span>
        </div>

        {/* Pulse effect if unread */}
        {unreadCount > 0 && (
          <span className="absolute inset-0 rounded-l-2xl animate-ping bg-rose-500/20 -z-10" />
        )}
      </button>
    </div>
  );
}
