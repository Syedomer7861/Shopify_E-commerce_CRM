"use client";
import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { Sparkles, CheckCircle2, Circle, Plus, Trash2, Clock, Calendar as CalendarIcon, StickyNote, Bell, BellRing, ChevronRight, CheckSquare } from "lucide-react";
import { PageHeader } from "@/components/ui";
import { createClient } from "@/lib/supabase";
import { useCurrentProfile } from "@/hooks/useCurrentProfile";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";
import { TodoSection } from "@/components/hub/TodoSection";
import { NoteSection } from "@/components/hub/NoteSection";
import { ReminderSection } from "@/components/hub/ReminderSection";
import { AssignedTasksPanel } from "@/components/dashboard/AssignedTasksPanel";
import LivePulseFeed from "@/components/LivePulseFeed";
import { TwoFactorCard } from "@/components/auth/TwoFactorCard";
import { isAdmin } from "@/lib/permissions";
import { isDemoMode as checkDemoMode } from "@/lib/demo";

export default function MyHubPage() {
  const sp = useSearchParams();
  const [activeTab, setActiveTab] = useState<'todos' | 'notes' | 'reminders' | 'assigned'>(
    sp.get("tab") === "assigned" ? "assigned" : "todos"
  );
  const [isDemoMode, setIsDemoMode] = useState(false);
  const { profile } = useCurrentProfile();

  useEffect(() => {
    setIsDemoMode(checkDemoMode());
  }, []);

  return (
    <div className="animate-fade-in pb-10">
      <PageHeader
        title={
          <div className="flex items-center gap-3">
            <Sparkles className="w-8 h-8 text-amber-500" />
            <span>My Personal Hub</span>
          </div>
        }
        subtitle="Manage your personal todos, private notes, and custom reminders."
      />

      {isDemoMode && (
        <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-center gap-3 animate-pulse">
          <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-amber-700" />
          </div>
          <div>
            <p className="text-xs font-black text-amber-900 uppercase tracking-widest">Presentation Mode Active</p>
            <p className="text-[11px] text-amber-700 font-medium">Personal data is sandboxed. Changes made here will not be saved to your production profile.</p>
          </div>
        </div>
      )}

      {/* Hub Navigation */}
      <div className="grid grid-cols-2 lg:flex gap-3 lg:gap-4 mb-8">
        {[
          { id: 'assigned', label: 'Assigned Tasks', icon: CheckSquare, color: 'text-indigo-500' },
          { id: 'todos', label: 'Todo List', icon: CheckCircle2, color: 'text-emerald-500' },
          { id: 'notes', label: 'Private Notes', icon: StickyNote, color: 'text-blue-500' },
          { id: 'reminders', label: 'Reminders', icon: Bell, color: 'text-rose-500' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={cn(
              "flex-1 flex items-center gap-3 p-4 rounded-2xl border transition-all duration-300 group",
              activeTab === tab.id 
                ? "bg-[#1c1c1c] border-[#1c1c1c] text-white shadow-xl shadow-[#1c1c1c]/10 translate-y-[-2px]" 
                : "bg-white border-[#eceae4] text-[#5f5f5d] hover:border-gray-300 hover:bg-gray-50"
            )}
          >
            <div className={cn(
              "w-10 h-10 rounded-xl flex items-center justify-center transition-colors",
              activeTab === tab.id ? "bg-white/10" : "bg-gray-100 group-hover:bg-gray-200"
            )}>
              <tab.icon className={cn("w-5 h-5", activeTab === tab.id ? tab.color : "text-gray-400")} />
            </div>
            <div className="text-left">
              <div className="text-sm font-bold">{tab.label}</div>
              <div className={cn(
                "text-[10px] uppercase tracking-widest font-bold opacity-60",
                activeTab === tab.id ? "text-white/60" : "text-gray-400"
              )}>
                {tab.id === 'assigned' ? 'From Your Team' : tab.id === 'todos' ? 'Personal Tasks' : tab.id === 'notes' ? 'Quick Ideas' : 'Timed Alerts'}
              </div>
            </div>
            <ChevronRight className={cn(
              "w-4 h-4 ml-auto transition-transform",
              activeTab === tab.id ? "text-white/40 rotate-90" : "text-gray-300"
            )} />
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          {activeTab === 'assigned' && <AssignedTasksPanel userId={profile?.id} />}
          {activeTab === 'todos' && <TodoSection />}
          {activeTab === 'notes' && <NoteSection />}
          {activeTab === 'reminders' && <ReminderSection />}
        </div>
        
        {/* Live Pulse Sidebar in Hub - company-wide activity feed, same
            component Dashboard restricts to admin only. This is a personal
            workspace page, not an ops-monitoring one, so match that gate
            instead of showing every agent's/webhook's activity to everyone. */}
        <div className="space-y-6">
          {/* Admins manage this under Settings → Security; staff can't open Settings. */}
          {profile && !isAdmin(profile) && <TwoFactorCard />}
          {profile?.role === "admin" && (
            <div className="hidden lg:block">
               <LivePulseFeed />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
