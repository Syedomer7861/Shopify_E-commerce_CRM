"use client";
import { ChatProvider } from "@/context/ChatContext";
import { FloatingChat } from "@/components/chat/FloatingChat";
import { ChatWindow } from "@/components/chat/ChatWindow";
import Sidebar from "@/components/Sidebar";
import { usePathname } from "next/navigation";
import { AgentHeartbeat } from "@/components/AgentHeartbeat";
import { AdminNotifier } from "@/components/AdminNotifier";
import { CommandPalette } from "@/components/CommandPalette";
import { NotificationBell } from "@/components/NotificationBell";
import { ModuleGuard } from "@/components/ModuleGuard";
import { MfaGate } from "@/components/auth/MfaChallenge";
import { SuspendedGate } from "@/components/auth/SuspendedGate";
import { ProfileProvider } from "@/hooks/useCurrentProfile";
import { PlatformNotices } from "@/components/PlatformNotices";
import { KeyboardShortcutsHelp } from "@/components/KeyboardShortcutsHelp";
import { DialogHost } from "@/components/ConfirmDialog";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

import { Suspense } from "react";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isChatPage = pathname === "/chat";

  return (
    <ProfileProvider>
    <ChatProvider>
      <div className="app-ui flex flex-col lg:flex-row h-[100dvh] overflow-hidden bg-[#f2f3ee]">
        <AgentHeartbeat />
        <ModuleGuard />
        <MfaGate />
        <SuspendedGate />
        <AdminNotifier />
        <CommandPalette />
        <NotificationBell />
        <KeyboardShortcutsHelp />
        <Suspense fallback={<div className="fixed lg:static left-0 top-0 w-16 lg:w-64 h-screen bg-[#f6f7f2] animate-pulse" />}>
          <Sidebar />
        </Suspense>
        <main id="main-application-content" className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden pl-16 lg:pl-0">
          <div className={cn(isChatPage ? "" : "max-w-7xl mx-auto px-3 sm:px-4 md:px-6 pt-4 pb-24 md:py-6")}>
            {!isChatPage && <PlatformNotices />}
            <Suspense fallback={<div className="flex items-center justify-center h-full"><Loader2 className="w-8 h-8 animate-spin text-[#1c1c1c]" /></div>}>
              {children}
            </Suspense>
          </div>
        </main>
        {!isChatPage && <FloatingChat />}
        {!isChatPage && <ChatWindow />}
        {/* Last in the tree so confirm boxes sit above any open pop-up. */}
        <DialogHost />
      </div>
    </ChatProvider>
    </ProfileProvider>
  );
}
