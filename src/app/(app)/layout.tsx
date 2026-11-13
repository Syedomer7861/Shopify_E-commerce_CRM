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
import { KeyboardShortcutsHelp } from "@/components/KeyboardShortcutsHelp";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

import { Suspense } from "react";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isChatPage = pathname === "/chat";

  return (
    <ProfileProvider>
    <ChatProvider>
      <div className="flex flex-col lg:flex-row h-screen overflow-hidden bg-[#f8f7f4]">
        <AgentHeartbeat />
        <ModuleGuard />
        <MfaGate />
        <SuspendedGate />
        <AdminNotifier />
        <CommandPalette />
        <NotificationBell />
        <KeyboardShortcutsHelp />
        <Suspense fallback={<div className="w-64 bg-[#f7f4ed] animate-pulse" />}>
          <Sidebar />
        </Suspense>
        <main id="main-application-content" className="flex-1 overflow-y-auto pb-20 lg:pb-0">
          <div className={cn(isChatPage ? "" : "max-w-7xl mx-auto px-4 md:px-6 py-4 md:py-6")}>
            <Suspense fallback={<div className="flex items-center justify-center h-full"><Loader2 className="w-8 h-8 animate-spin text-[#1c1c1c]" /></div>}>
              {children}
            </Suspense>
          </div>
        </main>
        {!isChatPage && <FloatingChat />}
        {!isChatPage && <ChatWindow />}
      </div>
    </ChatProvider>
    </ProfileProvider>
  );
}
