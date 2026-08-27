"use client";
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Bell, Check } from "lucide-react";
import { createClient } from "@/lib/supabase";
import { useCurrentProfile } from "@/hooks/useCurrentProfile";
import { cn, isTypingInField } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";

// Per-user in-app notifications (see notifications table,
// migrations/20260827_notifications_table.sql). Previously the only
// notification path was admin-only (notifyAdmin/sendAdminNotification) -
// an agent had no in-app signal when a task was assigned to them or a
// manager flagged their work; they had to poll pages to find out.

type Notification = {
  id: string;
  title: string;
  body: string | null;
  link: string | null;
  type: "info" | "success" | "warning" | "alert";
  read: boolean;
  created_at: string;
};

const TYPE_DOT: Record<Notification["type"], string> = {
  info: "bg-blue-400",
  success: "bg-emerald-400",
  warning: "bg-amber-400",
  alert: "bg-rose-500",
};

export function NotificationBell() {
  const { profile } = useCurrentProfile();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[]>([]);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  // Demo profile.id ("demo-presenter-id") isn't a real uuid - querying a
  // uuid column with it 400s. Same guard every other real-data component
  // in this app uses for demo mode.
  const isDemo = typeof document !== "undefined" && document.cookie.includes("crm-demo-mode=true");
  const userId = !isDemo ? profile?.id : null;

  const fetchNotifications = useCallback(async () => {
    if (!userId) return;
    const { data } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(20);
    setItems((data as any) || []);
  }, [supabase, userId]);

  useEffect(() => {
    if (!userId) return;
    fetchNotifications();

    const channel = supabase
      .channel(`notifications-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` }, () => {
        fetchNotifications();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, userId, fetchNotifications]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  // "n" toggles notifications, "Esc" closes - mirrors CommandPalette's own
  // shortcut/guard pattern (Ctrl/Cmd+K, "/", Esc).
  useEffect(() => {
    if (!userId) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key.toLowerCase() === "n" && !isTypingInField(e.target) && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        setOpen(o => !o);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [userId]);

  const unreadCount = items.filter(n => !n.read).length;

  const markRead = useCallback(async (id: string) => {
    setItems(prev => prev.map(n => (n.id === id ? { ...n, read: true } : n)));
    await supabase.from("notifications").update({ read: true }).eq("id", id);
  }, [supabase]);

  const markAllRead = useCallback(async () => {
    if (!userId || unreadCount === 0) return;
    setItems(prev => prev.map(n => ({ ...n, read: true })));
    await supabase.from("notifications").update({ read: true }).eq("user_id", userId).eq("read", false);
  }, [supabase, userId, unreadCount]);

  const openNotification = useCallback((n: Notification) => {
    if (!n.read) markRead(n.id);
    setOpen(false);
    if (n.link) router.push(n.link);
  }, [markRead, router]);

  if (!userId) return null;

  return (
    <div ref={containerRef} className="fixed top-4 right-4 lg:top-6 lg:right-6 z-40">
      <button
        onClick={() => setOpen(o => !o)}
        aria-label="Notifications"
        className="relative w-11 h-11 rounded-full bg-white border border-[#eceae4] shadow-lg flex items-center justify-center hover:scale-105 active:scale-95 transition-transform"
      >
        <Bell className="w-4 h-4 text-[#1c1c1c]" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[9px] font-black flex items-center justify-center">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 max-w-[90vw] bg-[#f7f4ed] rounded-2xl shadow-2xl border border-[#eceae4] overflow-hidden animate-slide-up">
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#eceae4]">
            <h3 className="text-xs font-black uppercase tracking-widest text-[#1c1c1c]">Notifications</h3>
            {unreadCount > 0 && (
              <button onClick={markAllRead} className="flex items-center gap-1 text-[10px] font-bold text-[#5f5f5d] hover:text-[#1c1c1c] transition-colors">
                <Check className="w-3 h-3" /> Mark all read
              </button>
            )}
          </div>
          <div className="max-h-[60vh] overflow-y-auto divide-y divide-[#eceae4]">
            {items.length === 0 ? (
              <div className="p-8 text-center text-[#5f5f5d] text-xs font-medium">You're all caught up.</div>
            ) : (
              items.map(n => (
                <button
                  key={n.id}
                  onClick={() => openNotification(n)}
                  className={cn("w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-[#eceae4]/50 transition-colors", !n.read && "bg-[#eceae4]/30")}
                >
                  <span className={cn("w-2 h-2 rounded-full mt-1.5 shrink-0", TYPE_DOT[n.type])} />
                  <div className="min-w-0 flex-1">
                    <div className={cn("text-xs text-[#1c1c1c] truncate", !n.read ? "font-black" : "font-bold")}>{n.title}</div>
                    {n.body && <div className="text-[11px] text-[#5f5f5d] mt-0.5 line-clamp-2">{n.body}</div>}
                    <div className="text-[9px] text-[#5f5f5d]/60 mt-1 font-medium">{formatDistanceToNow(new Date(n.created_at))} ago</div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
