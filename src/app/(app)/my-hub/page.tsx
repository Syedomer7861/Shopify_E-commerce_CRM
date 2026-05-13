"use client";
import { useState, useEffect } from "react";
import { Sparkles, CheckCircle2, Circle, Plus, Trash2, Clock, Calendar as CalendarIcon, StickyNote, Bell, BellRing, ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/ui";
import { createClient } from "@/lib/supabase";
import { useCurrentProfile } from "@/hooks/useCurrentProfile";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";
import { TodoSection } from "@/components/hub/TodoSection";
import { NoteSection } from "@/components/hub/NoteSection";
import { ReminderSection } from "@/components/hub/ReminderSection";
import LivePulseFeed from "@/components/LivePulseFeed";

export default function MyHubPage() {
  const [activeTab, setActiveTab] = useState<'todos' | 'notes' | 'reminders'>('todos');
  const { profile } = useCurrentProfile();

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

      {/* Hub Navigation */}
      <div className="flex gap-4 mb-8">
        {[
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
                {tab.id === 'todos' ? 'Personal Tasks' : tab.id === 'notes' ? 'Quick Ideas' : 'Timed Alerts'}
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
          {activeTab === 'todos' && <TodoSection />}
          {activeTab === 'notes' && <NoteSection />}
          {activeTab === 'reminders' && <ReminderSection />}
        </div>
        
        {/* Live Pulse Sidebar in Hub */}
        <div className="hidden lg:block">
           <LivePulseFeed />
        </div>
      </div>
    </div>
  );
}
