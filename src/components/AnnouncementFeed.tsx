"use client";
import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase";
import { Megaphone, Pin, Star, Info, Bell, AlertTriangle, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Modal } from "./ui";

type AnnouncementType = "Info" | "Important" | "Celebration" | "Alert";

interface Announcement {
  id: string;
  title: string;
  body: string;
  type: AnnouncementType;
  is_pinned: boolean;
  created_at: string;
  author_name?: string;
}

const TYPE_STYLES: Record<AnnouncementType, { bg: string; text: string; icon: any; border: string; glow: string }> = {
  Info: { 
    bg: "bg-sky-50", 
    text: "text-sky-700", 
    icon: Info, 
    border: "border-sky-100",
    glow: "shadow-sky-200/20"
  },
  Important: { 
    bg: "bg-amber-50", 
    text: "text-amber-700", 
    icon: AlertTriangle, 
    border: "border-amber-100",
    glow: "shadow-amber-200/20"
  },
  Celebration: { 
    bg: "bg-emerald-50", 
    text: "text-emerald-700", 
    icon: Star, 
    border: "border-emerald-100",
    glow: "shadow-emerald-200/20"
  },
  Alert: { 
    bg: "bg-rose-50", 
    text: "text-rose-700", 
    icon: Bell, 
    border: "border-rose-100",
    glow: "shadow-rose-200/20"
  },
};

export default function AnnouncementFeed() {
  const [mounted, setMounted] = useState(false);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<Announcement | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);
  const supabase = createClient();

  const fetchAnnouncements = useCallback(async () => {
    // Demo mode is a real Supabase login, so this would otherwise fetch
    // whatever real announcements exist in production - this widget sits on
    // the Dashboard, the first thing anyone sees in a demo. type must be one
    // of TYPE_STYLES' keys (Info/Important/Celebration/Alert); real rows
    // satisfy the DB CHECK constraint, but skip the fetch entirely rather
    // than showing real internal announcements to a demo audience.
    const isDemo = document.cookie.includes("crm-demo-mode=true");
    if (isDemo) {
      setAnnouncements([
        {
          id: "demo-ann-1",
          title: "New Product Launch",
          body: "We are launching a new Krill Oil variant next week!",
          type: "Celebration",
          is_pinned: true,
          created_at: new Date().toISOString(),
        },
        {
          id: "demo-ann-2",
          title: "System Maintenance",
          body: "Scheduled downtime this Sunday 2-4 AM for infrastructure upgrades.",
          type: "Important",
          is_pinned: false,
          created_at: new Date(Date.now() - 86400000).toISOString(),
        },
      ] as any);
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from("announcements")
        .select("*")
        .order("is_pinned", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(10);

      if (error) throw error;
      setAnnouncements(data || []);
    } catch (err) {
      console.error("Failed to fetch announcements:", err);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    fetchAnnouncements();

    // Listen for new announcements
    const channel = supabase
      .channel("live-announcements")
      .on("postgres_changes", { event: "*", schema: "public", table: "announcements" }, fetchAnnouncements)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchAnnouncements, supabase]);

  if (loading && announcements.length === 0) return null;
  if (!loading && announcements.length === 0) return null;

  return (
    <div className="space-y-4 mb-8">
      <div className="flex flex-col gap-1 px-2">
        <div className="flex items-center gap-2">
          <Megaphone className="w-4 h-4 text-[#1c1c1c]" />
          <h3 className="text-[10px] font-black text-[#1c1c1c] uppercase tracking-[0.2em]">Team Bulletins</h3>
        </div>
        <p className="text-[10px] text-gray-500 font-medium">Important broadcasts, company updates, and team announcements.</p>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {announcements.map((a) => {
          const S = TYPE_STYLES[a.type] || TYPE_STYLES.Info;
          return (
            <div 
              key={a.id} 
              onClick={() => setSelectedAnnouncement(a)}
              className={cn(
                "relative group p-5 rounded-[24px] border transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer overflow-hidden",
                S.bg, S.border, S.glow,
                a.is_pinned ? "shadow-lg" : "shadow-sm"
              )}
            >
              {/* Pin Indicator */}
              {a.is_pinned && (
                <div className="absolute top-4 right-4 text-amber-500 animate-pulse">
                  <Pin className="w-3.5 h-3.5 fill-current" />
                </div>
              )}

              <div className="flex gap-4">
                <div className={cn(
                  "w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 border",
                  S.bg, S.border, S.text
                )}>
                  <S.icon className="w-5 h-5" />
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={cn("text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border", S.bg, S.border, S.text)}>
                      {a.type}
                    </span>
                    <span className="text-[9px] font-bold text-gray-400">
                      {mounted ? new Date(a.created_at).toLocaleDateString() : "---"}
                    </span>
                  </div>
                  <h4 className="text-sm font-black text-[#1c1c1c] tracking-tight mb-1 truncate">{a.title}</h4>
                  <p className="text-[11px] text-gray-600 font-medium leading-relaxed line-clamp-2 break-words">
                    {a.body}
                  </p>
                  <div className="mt-3 flex items-center gap-2">
                    <div className="w-4 h-4 rounded-full bg-[#1c1c1c] flex items-center justify-center text-[7px] text-white font-black">
                      {a.author_name ? a.author_name.charAt(0).toUpperCase() : "H"}
                    </div>
                    <span className="text-[9px] font-black text-[#1c1c1c] uppercase tracking-tighter">
                      {a.author_name || "HR Intelligence"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Hover highlight effect */}
              <div className="absolute inset-0 bg-white/40 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
            </div>
          );
        })}
      </div>

      {/* Full View Modal */}
      <Modal
        open={!!selectedAnnouncement}
        onClose={() => setSelectedAnnouncement(null)}
        title={
          <div className="flex items-center gap-2">
            {selectedAnnouncement && (
              <>
                <span className={cn(
                  "text-[9px] font-black uppercase tracking-[0.2em] px-2 py-0.5 rounded-full border",
                  (TYPE_STYLES[selectedAnnouncement.type] || TYPE_STYLES.Info).bg,
                  (TYPE_STYLES[selectedAnnouncement.type] || TYPE_STYLES.Info).border,
                  (TYPE_STYLES[selectedAnnouncement.type] || TYPE_STYLES.Info).text
                )}>
                  {selectedAnnouncement.type}
                </span>
                <span className="text-[9px] font-black text-[#5f5f5d] uppercase tracking-[0.2em] opacity-40">
                  Full Bulletin
                </span>
              </>
            )}
          </div>
        }
      >
        {selectedAnnouncement && (
          <div className="space-y-6">
            <div className="flex items-start gap-4">
              <div className={cn(
                "w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 border",
                (TYPE_STYLES[selectedAnnouncement.type] || TYPE_STYLES.Info).bg,
                (TYPE_STYLES[selectedAnnouncement.type] || TYPE_STYLES.Info).border,
                (TYPE_STYLES[selectedAnnouncement.type] || TYPE_STYLES.Info).text
              )}>
                {(() => {
                  const Icon = (TYPE_STYLES[selectedAnnouncement.type] || TYPE_STYLES.Info).icon;
                  return <Icon className="w-6 h-6" />;
                })()}
              </div>
              <div className="flex-1">
                <h2 className="text-xl font-black text-[#1c1c1c] tracking-tight leading-tight mb-2 break-words">
                  {selectedAnnouncement.title}
                </h2>
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded-full bg-[#1c1c1c] flex items-center justify-center text-[8px] text-white font-black">
                    {selectedAnnouncement.author_name ? selectedAnnouncement.author_name.charAt(0).toUpperCase() : "H"}
                  </div>
                  <span className="text-[10px] font-black text-[#1c1c1c] uppercase tracking-widest">
                    {selectedAnnouncement.author_name || "HR Intelligence"}
                  </span>
                  <span className="text-[10px] font-bold text-gray-300">|</span>
                  <span className="text-[10px] font-bold text-gray-500">
                    {mounted ? new Date(selectedAnnouncement.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }) : "---"}
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-white/50 border border-[#eceae4] p-6 rounded-[24px] text-sm text-[#1c1c1c] font-medium leading-relaxed break-words whitespace-pre-wrap shadow-inner">
              {selectedAnnouncement.body}
            </div>

            <div className="flex justify-end">
              <button 
                onClick={() => setSelectedAnnouncement(null)}
                className="btn-secondary py-2.5 px-6 bg-[#1c1c1c] text-white hover:bg-black transition-all shadow-lg text-[10px] font-black uppercase tracking-widest"
              >
                Close Bulletin
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
