"use client";
import React from 'react';
import { ChannelList } from '@/components/chat/ChannelList';
import { MessageList } from '@/components/chat/MessageList';
import { ChatInput } from '@/components/chat/ChatInput';
import { useChat } from '@/context/ChatContext';
import { Hash, Settings, Info, Search, Wifi, WifiOff, ChevronLeft } from 'lucide-react';
import { Avatar } from '@/components/ui';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';

import { createClient } from '@/lib/supabase';
import toast from 'react-hot-toast';

export default function ChatPage() {
  const { activeChannel, connected } = useChat();
  const router = useRouter();
  const supabase = createClient();
  const [isSearchOpen, setIsSearchOpen] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [showRightPanel, setShowRightPanel] = React.useState(true);
  const [showSettings, setShowSettings] = React.useState(false);
  
  // Settings State
  const [notifEnabled, setNotifEnabled] = React.useState(true);
  const [soundEnabled, setSoundEnabled] = React.useState(true);
  const [isSaving, setIsSaving] = React.useState(false);

  // Load preferences
  React.useEffect(() => {
    const savedNotif = localStorage.getItem('chat_notifications');
    const savedSound = localStorage.getItem('chat_sounds');
    if (savedNotif !== null) setNotifEnabled(savedNotif === 'true');
    if (savedSound !== null) setSoundEnabled(savedSound === 'true');

    // Request notification permission on mount
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  const handleSaveSettings = () => {
    setIsSaving(true);
    localStorage.setItem('chat_notifications', String(notifEnabled));
    localStorage.setItem('chat_sounds', String(soundEnabled));
    
    setTimeout(() => {
      setIsSaving(false);
      setShowSettings(false);
      toast.success("Preferences saved successfully");
    }, 600);
  };

  const handleClearHistory = async () => {
    if (!activeChannel) return;
    const isDemo = document.cookie.includes("crm-demo-mode=true");
    if (isDemo) {
      toast.success("Demo: History cleared (local only)");
      return;
    }
    if (!confirm("Are you absolutely sure you want to clear this conversation history? This cannot be undone.")) return;
    
    const loadingToast = toast.loading("Clearing history...");
    try {
      const { error } = await supabase
        .from('messages')
        .delete()
        .eq('channel_id', activeChannel.id);
      
      if (error) throw error;
      toast.success("Conversation history cleared", { id: loadingToast });
      // The socket/supabase subscription will handle the UI update or we could refresh
      window.location.reload(); 
    } catch (err) {
      toast.error("Failed to clear history", { id: loadingToast });
    }
  };

  const handleViewTask = () => {
    if (activeChannel?.metadata?.task_id) {
      router.push(`/tasks?id=${activeChannel.metadata.task_id}`);
    } else {
      router.push('/tasks');
    }
  };

  return (
    <div className="fixed inset-0 lg:left-64 bottom-16 lg:bottom-0 flex flex-col bg-white overflow-hidden">
      {/* Top Header */}
      <header className="h-16 border-b border-[#eceae4] bg-[#f8f7f4] flex items-center justify-between px-6 z-10">
        <div className="flex items-center gap-2 sm:gap-3">
          <button 
            onClick={() => router.back()}
            className="lg:hidden p-2 -ml-2 text-[#5f5f5d] hover:bg-[#eceae4] rounded-lg"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          {activeChannel ? (
            <>
              <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-[#1c1c1c] flex items-center justify-center text-[#fcfbf8]">
                {activeChannel.type === 'direct' ? (
                  <Avatar name={activeChannel.name || "User"} size="sm" />
                ) : (
                  <Hash className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                )}
              </div>
              <div className="flex flex-col">
                <h1 className="text-xs sm:text-sm font-bold text-[#1c1c1c] tracking-tight truncate max-w-[120px] sm:max-w-none">{activeChannel.name}</h1>
                <div className="flex items-center gap-1.5">
                  <div className="w-1 h-1 sm:w-1.5 sm:h-1.5 rounded-full bg-emerald-500" />
                  <span className="text-[8px] sm:text-[10px] font-bold text-[#5f5f5d] uppercase tracking-widest opacity-60 whitespace-nowrap">Active now</span>
                </div>
              </div>
            </>
          ) : (
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-[#eceae4] flex items-center justify-center">
                <Hash className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#5f5f5d]" />
              </div>
              <h1 className="text-xs sm:text-sm font-bold text-[#1c1c1c] tracking-tight">Internal Communications</h1>
            </div>
          )}
        </div>

        <div className="flex items-center gap-1 sm:gap-2">
          {isSearchOpen && (
            <div className="hidden sm:flex items-center bg-white border border-[#eceae4] rounded-lg px-2 py-1 mx-2">
              <Search className="w-3 h-3 text-[#5f5f5d] mr-2" />
              <input 
                type="text" 
                placeholder="Search messages..." 
                className="bg-transparent text-xs outline-none w-40"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                autoFocus
              />
            </div>
          )}

          {/* Connection status badge */}
          <div className={cn(
            "flex items-center gap-1 sm:gap-1.5 px-1.5 sm:px-2.5 py-1 rounded-xl border text-[8px] sm:text-[10px] font-black uppercase tracking-widest transition-all mr-1 sm:mr-2",
            connected
              ? "bg-emerald-50 border-emerald-200 text-emerald-700"
              : "bg-amber-50 border-amber-200 text-amber-700 animate-pulse"
          )}>
            {connected
              ? <><Wifi className="w-2.5 h-2.5 sm:w-3 sm:h-3" /> <span className="hidden xs:inline">Live</span></>
              : <><WifiOff className="w-2.5 h-2.5 sm:w-3 sm:h-3" /> <span className="hidden xs:inline">Syncing...</span></>
            }
          </div>

          <button 
            onClick={() => setIsSearchOpen(!isSearchOpen)}
            className={cn(
              "p-1.5 sm:p-2 text-[#5f5f5d] hover:bg-[#eceae4] rounded-lg transition-colors hidden sm:block",
              isSearchOpen && "bg-[#eceae4] text-[#1c1c1c]"
            )}
          >
            <Search className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </button>
          <button 
            onClick={() => setShowRightPanel(!showRightPanel)}
            className={cn(
              "p-1.5 sm:p-2 text-[#5f5f5d] hover:bg-[#eceae4] rounded-lg transition-colors hidden lg:block",
              showRightPanel && "bg-[#eceae4] text-[#1c1c1c]"
            )}
          >
            <Info className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </button>
          <div className="w-[1px] h-4 bg-[#eceae4] mx-0.5 sm:mx-1" />
          <button 
            onClick={() => setShowSettings(true)}
            className="p-1.5 sm:p-2 text-[#5f5f5d] hover:bg-[#eceae4] rounded-lg transition-colors"
          >
            <Settings className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar */}
        <ChannelList />

        {/* Chat Area */}
        <div className="flex-1 flex flex-col relative overflow-hidden">
          <MessageList searchQuery={searchQuery} />
          <ChatInput />
        </div>

        {/* Right Info Panel (Contextual) */}
        {showRightPanel && (
          <div className="w-80 border-l border-[#eceae4] bg-[#f7f4ed] p-6 hidden lg:block overflow-y-auto">
            {activeChannel?.type === 'task' ? (
              <>
                <h2 className="text-[10px] font-bold text-[#5f5f5d] uppercase tracking-widest mb-6 opacity-60">Linked Task</h2>
                <div className="p-4 bg-white border border-[#eceae4] rounded-2xl shadow-sm mb-6">
                  <div className="text-xs font-bold text-[#1c1c1c] mb-2">{activeChannel.metadata?.task_title || "CRM Task Thread"}</div>
                  <p className="text-[10px] text-[#5f5f5d] leading-relaxed mb-4">This discussion is linked to a specific CRM task for full context.</p>
                  <button
                    onClick={handleViewTask}
                    className="w-full py-2 bg-[#1c1c1c] text-[#fcfbf8] text-[10px] font-bold uppercase tracking-widest rounded-xl hover:scale-[1.02] active:scale-[0.98] transition-all"
                  >
                    View Task Details
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2 className="text-[10px] font-bold text-[#5f5f5d] uppercase tracking-widest mb-6 opacity-60">Channel Information</h2>
                <div className="p-4 bg-white border border-[#eceae4] rounded-2xl shadow-sm mb-6">
                  <div className="text-xs font-bold text-[#1c1c1c] mb-2">{activeChannel?.name || "Internal Communications"}</div>
                  <p className="text-[10px] text-[#5f5f5d] leading-relaxed">Official channel for real-time team collaboration and internal updates.</p>
                </div>
              </>
            )}

            <div className="space-y-4">
              <h3 className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Shared Files</h3>
              <div className="py-8 text-center border-2 border-dashed border-[#eceae4] rounded-2xl">
                <p className="text-[10px] text-[#5f5f5d] font-bold opacity-40">No shared files yet</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Settings Modal Placeholder */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="p-6 border-b border-[#eceae4] flex justify-between items-center">
              <h2 className="text-xs font-black text-[#1c1c1c] uppercase tracking-widest">Chat Settings</h2>
              <button onClick={() => setShowSettings(false)} className="text-[#5f5f5d] hover:text-[#1c1c1c]">✕</button>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#5f5f5d]">Desktop Notifications</span>
                <button 
                  onClick={() => setNotifEnabled(!notifEnabled)}
                  className={cn(
                    "w-10 h-5 rounded-full relative transition-colors duration-200",
                    notifEnabled ? "bg-emerald-500" : "bg-[#eceae4]"
                  )}
                >
                  <div className={cn(
                    "absolute top-1 w-3 h-3 bg-white rounded-full transition-all duration-200",
                    notifEnabled ? "right-1" : "left-1"
                  )} />
                </button>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#5f5f5d]">Sound Effects</span>
                <button 
                  onClick={() => setSoundEnabled(!soundEnabled)}
                  className={cn(
                    "w-10 h-5 rounded-full relative transition-colors duration-200",
                    soundEnabled ? "bg-emerald-500" : "bg-[#eceae4]"
                  )}
                >
                  <div className={cn(
                    "absolute top-1 w-3 h-3 bg-white rounded-full transition-all duration-200",
                    soundEnabled ? "right-1" : "left-1"
                  )} />
                </button>
              </div>
              <div className="pt-4 border-t border-[#eceae4]">
                <button 
                  onClick={handleClearHistory}
                  className="text-[10px] font-black text-rose-500 uppercase tracking-widest hover:opacity-80 transition-opacity"
                >
                  Clear Conversation History
                </button>
              </div>
            </div>
            <div className="p-6 bg-gray-50 flex justify-end">
              <button 
                onClick={handleSaveSettings}
                disabled={isSaving}
                className="px-6 py-2 bg-[#1c1c1c] text-[#fcfbf8] text-[10px] font-black uppercase tracking-widest rounded-xl hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 flex items-center gap-2"
              >
                {isSaving ? "Saving..." : "Save Preferences"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
