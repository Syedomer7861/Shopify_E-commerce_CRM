"use client";
import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { 
  LayoutDashboard, Users, ShoppingBag, 
  Megaphone, Shield, Settings, Sparkles, 
  LogOut, Zap, Calendar, BarChart2, Upload, CheckSquare, Plus, Loader2,
  UserCheck, Clock, FileText, ShieldCheck, Calculator, BellRing,
  Activity, ShoppingCart, MessageSquare
} from "lucide-react";
import { cn, toDbDateString } from "@/lib/utils";
import { createClient } from "@/lib/supabase";
import toast from "react-hot-toast";

import { DEFAULT_PERMISSIONS, hasPermission, isAdmin } from "@/lib/permissions";
import { sendAdminNotification } from "@/lib/notifications";
import { Modal } from "./ui";
import { useChat } from "@/context/ChatContext";

const nav = [
  { label: "Dashboard",   href: "/dashboard",  icon: LayoutDashboard },
  { label: "Tasks",       href: "/tasks",       icon: CheckSquare,   badge: "taskCount" },
  { label: "Chat",        href: "/chat",        icon: MessageSquare, badge: "chatUnread" },
  { label: "My Hub",       href: "/my-hub",      icon: Sparkles },
  { label: "Customers",   href: "/customers",   icon: Users },
  { label: "Orders",      href: "/orders",      icon: ShoppingBag },
  { label: "Calendar",    href: "/calendar",    icon: Calendar },
];

const adminNav = [
  { label: "Live Floor",  href: "/floor",       icon: Activity,    permission: "manage_team" },
  { label: "Analytics",   href: "/reports",     icon: BarChart2, permission: "view_analytics" },
  { label: "Abandoned Carts", href: "/abandoned-carts", icon: ShoppingCart, permission: "view_analytics" },
  { label: "Alert Logs",  href: "/admin-logs",  icon: ShieldCheck, permission: "view_analytics" },
  { label: "Import",      href: "/import",      icon: Upload,    permission: "can_import" },
  { label: "Campaigns",   href: "/campaigns",   icon: Megaphone,  permission: "manage_team" },
  { label: "Templates",   href: "/templates",   icon: Sparkles,   permission: "manage_team" },
  { label: "Workflows",   href: "/workflows",   icon: Zap,        permission: "manage_team" },
  { label: "Team",        href: "/team",        icon: Shield,     permission: "manage_team" },
  { label: "Settings",    href: "/settings",    icon: Settings,   permission: "manage_team" },
];

const hrNav = [
  { label: "HR Dashboard", href: "/hr",           icon: LayoutDashboard },
  { label: "Agent Intelligence", href: "/hr?tab=agents", icon: ShieldCheck },
  { label: "Employees",    href: "/hr?tab=employees", icon: Users },
  { label: "Attendance",   href: "/hr?tab=attendance-reg", icon: Clock },
  { label: "Payroll",      href: "/hr?tab=payroll",   icon: BarChart2 },
  { label: "Calculator",   href: "/hr?tab=calculator", icon: Calculator },
  { label: "Documents",    href: "/hr?tab=documents", icon: FileText },
  { label: "Announcements", href: "/hr?tab=announcements", icon: Megaphone },
  { label: "Engagement",   href: "/hr?tab=engagement", icon: Sparkles },
];

const managerNav = [
  { label: "Manager Hub", href: "/manager", icon: ShieldCheck },
];

import type { Profile } from "@/types";

export default function Sidebar() {
  const path = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();
  const { unreadCount } = useChat();
  const [profile, setProfile] = useState<Profile | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      audioRef.current = new Audio('/notification.mp3');
      audioRef.current.load();
    }
  }, []);
  const [counts, setCounts] = useState({ due: 0, overdue: 0 });
  const [timers, setTimers] = useState({ workMs: 0, breakMs: 0 });
  const [showStatusModal, setShowStatusModal] = useState<{ id: string, label: string } | null>(null);
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [myLeaves, setMyLeaves] = useState<any[]>([]);
  const [leaveData, setLeaveData] = useState({ start: "", end: "", reason: "" });
  const [isSubmittingLeave, setIsSubmittingLeave] = useState(false);
  const [reason, setReason] = useState("");

  const formatDuration = (ms: number) => {
    const seconds = Math.floor((ms / 1000) % 60);
    const minutes = Math.floor((ms / (1000 * 60)) % 60);
    const hours = Math.floor(ms / (1000 * 60 * 60));
    return [
      hours.toString().padStart(2, '0'),
      minutes.toString().padStart(2, '0'),
      seconds.toString().padStart(2, '0')
    ].join(':');
  };

  useEffect(() => {
    if (!profile?.status || profile.status === "offline") return;

    const interval = setInterval(() => {
      setTimers(prev => {
        const isProductive = ["online", "meeting", "training"].includes(profile.status!);
        const isBreak = ["break", "lunch", "away"].includes(profile.status!);
        
        return {
          workMs: isProductive ? prev.workMs + 1000 : prev.workMs,
          breakMs: isBreak ? prev.breakMs + 1000 : prev.breakMs,
        };
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [profile?.status]);

  useEffect(() => {
    fetchProfile();

    

    return () => {
      
    };
  }, [profile?.id]);

  useEffect(() => {
    if (!profile?.id) return;
    
    // Audio for notifications
    const playNotification = () => {
      if (audioRef.current) {
        audioRef.current.currentTime = 0;
        audioRef.current.volume = 1.0;
        audioRef.current.play().catch(e => console.warn("Audio playback failed:", e));
      } else {
        const audio = new Audio('/notification.mp3');
        audio.volume = 1.0;
        audio.play().catch(e => console.warn("Audio playback failed:", e));
      }
    };

    async function checkReminders() {
      if (!profile?.id) return;
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from('personal_reminders')
        .select('id, title, remind_at, user_id, is_fired')
        .eq('user_id', profile.id)
        .eq('is_fired', false)
        .lte('remind_at', now);

      if (data && data.length > 0) {
        // Play notification sound once for the batch
        playNotification();

        data.forEach(reminder => {
          toast((t) => (
            <div className="flex flex-col gap-2 p-1 min-w-[200px]">
              <div className="flex items-center gap-2 font-black text-[#1c1c1c] text-xs">
                <BellRing className="w-4 h-4 text-rose-500 animate-bounce" />
                <span className="uppercase tracking-tight">Personal Reminder</span>
              </div>
              <p className="text-[11px] text-[#5f5f5d] font-medium leading-relaxed italic">{reminder.title}</p>
              <div className="flex justify-end border-t border-[#eceae4] pt-2">
                <button 
                  onClick={() => toast.dismiss(t.id)}
                  className="text-[9px] font-black text-emerald-600 hover:text-emerald-700 uppercase tracking-widest"
                >
                  Got it
                </button>
              </div>
            </div>
          ), { duration: 15000, position: 'top-right', id: `reminder-${reminder.id}` });

          // Mark as fired immediately so we don't notify again
          supabase.from('personal_reminders').update({ is_fired: true }).eq('id', reminder.id).then();
        });
      }
    }

    const interval = setInterval(checkReminders, 60000); // Check every minute
    checkReminders(); // Initial check

    return () => clearInterval(interval);
  }, [profile?.id]);

  async function fetchProfile() {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;
      
      const user = session.user;
      const { data: profileData } = await supabase
        .from("profiles")
        .select("id, email, name, role, permissions, is_active, status, last_seen_at, created_at")
        .eq("id", user.id)
        .maybeSingle();

      const profile: Profile = profileData || { 
        id: user.id, 
        email: user.email!, 
        role: "agent", 
        permissions: DEFAULT_PERMISSIONS, 
        is_active: true,
        created_at: new Date().toISOString()
      };
      
      setProfile(profile);
      fetchTaskCounts(user.id, profile.role);
      fetchTodayAttendance(user.id);
    } catch (err) {
      console.error("fetchProfile error:", err);
    }
  }

  const fetchMyLeaves = async () => {
    if (!profile) return;
    const { data } = await supabase
      .from("leaves")
      .select("*")
      .eq("agent_id", profile.id)
      .order("created_at", { ascending: false });
    if (data) setMyLeaves(data);
  };

  useEffect(() => {
    if (showLeaveModal && profile) {
      fetchMyLeaves();
    }
  }, [showLeaveModal, profile]);

  async function handleRequestLeave() {
    if (!leaveData.start || !leaveData.end || !leaveData.reason) {
      return toast.error("Please fill all fields");
    }
    
    setIsSubmittingLeave(true);
    try {
      const res = await fetch("/api/leaves/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId: profile?.id,
          startDate: leaveData.start,
          endDate: leaveData.end,
          reason: leaveData.reason
        })
      });
      
      if (!res.ok) throw new Error("Failed to submit request");
      
      toast.success("Leave request submitted to HR");
      fetchMyLeaves();
      setLeaveData({ start: "", end: "", reason: "" });
    } catch (err) {
      toast.error("Request failed. Try again.");
    } finally {
      setIsSubmittingLeave(false);
    }
  }

  // Helper to apply specialization filters
  const applyAgentFilters = (query: any, prof: any) => {
    if (prof?.role !== 'agent') return query;
    
    const segs = prof.assigned_segments || [];
    const types = prof.assigned_task_types || [];
    
    // Strict Logic: Agent MUST match specialization to see ANY task
    // AND it must be either assigned to them or unassigned
    let filteredQuery = query.or(`assigned_to.eq.${prof.id},assigned_to.is.null`);

    if (segs.length > 0) {
      filteredQuery = filteredQuery.filter('customer.segment', 'in', `(${segs.join(",")})`);
    }
    if (types.length > 0) {
      filteredQuery = filteredQuery.in('task_type', types);
    }
    
    return filteredQuery;
  };

  async function fetchTaskCounts(userId: string, role?: string) {
    try {
      const today = toDbDateString(new Date());
      let dueQuery = supabase.from("tasks")
        .select("*, customer:customers!inner(id, segment)", { count: "exact", head: true })
        .eq("due_date", today)
        .neq("status", "done");
      
      let overdueQuery = supabase.from("tasks")
        .select("*, customer:customers!inner(id, segment)", { count: "exact", head: true })
        .lt("due_date", today)
        .neq("status", "done");

      if (role === "agent" && profile) {
        dueQuery = applyAgentFilters(dueQuery, profile);
        overdueQuery = applyAgentFilters(overdueQuery, profile);
      }

      const [dueRes, overdueRes] = await Promise.all([dueQuery, overdueQuery]);
      setCounts({
        due: dueRes.count || 0,
        overdue: overdueRes.count || 0
      });
    } catch (err) {
      console.error("fetchTaskCounts error:", err);
    }
  }
  




  // 2. Heartbeat & Auto-Clock-In
  useEffect(() => {
    if (!profile?.id) return;

    const runHeartbeat = async () => {
      try {
        // 1. Automatic Online Transition
        // If the agent is "offline" but actively viewing the dashboard, 
        // we should transition them to "online" to start the telemetry.
        if (profile.status === "offline" && !path.includes("login")) {
           await updateStatus("online", "Auto-Active");
           return; // updateStatus will trigger its own attendance record
        }

        // 2. Update Last Seen
        await supabase.from("profiles").update({ 
          last_seen_at: new Date().toISOString() 
        }).eq("id", profile.id);

        // 3. Check for Auto-Clock-In
        const today = new Date();
        today.setHours(0,0,0,0);
        const todayKey = `${today.getFullYear()}-${today.getMonth() + 1}-${today.getDate()}`;
        const lockKey = `auto_clockin_${profile.id}_${todayKey}`;

        if (!localStorage.getItem(lockKey)) {
          const { count } = await supabase
            .from("agent_attendance")
            .select("*", { count: "exact", head: true })
            .eq("agent_id", profile.id)
            .gte("created_at", today.toISOString());

          if (count === 0 && profile.status && profile.status !== "offline") {
            try {
              await supabase.from("agent_attendance").insert({
                agent_id: profile.id,
                status: profile.status,
                reason: "Auto-Clock-In"
              });
              await sendAdminNotification(`🚀 *Auto Clock-In*: *${profile.name || profile.email}* started their shift as *${profile.status.toUpperCase()}*`, "info");
              localStorage.setItem(lockKey, "true");
              fetchTodayAttendance(profile.id);
            } catch (insErr) {
              console.warn("Auto-Clock-In insert failed (check schema):", insErr);
              // Try inserting without reason if it failed (fallback for schema lag)
              await supabase.from("agent_attendance").insert({
                agent_id: profile.id,
                status: profile.status
              });
              localStorage.setItem(lockKey, "true");
            }
          } else if (count && count > 0) {
            localStorage.setItem(lockKey, "true");
          }
        }
      } catch (err) {
        console.warn("Heartbeat failed:", err);
      }
    };

    runHeartbeat();
    const rtHeartbeat = setInterval(runHeartbeat, 60000);

    return () => clearInterval(rtHeartbeat);
  }, [profile?.id, profile?.status, path]);

  
  async function fetchTodayAttendance(userId: string) {
    try {
      const today = new Date();
      today.setHours(0,0,0,0);
      const { data } = await supabase
        .from("agent_attendance")
        .select("*")
        .eq("agent_id", userId)
        .gte("created_at", today.toISOString())
        .order("created_at", { ascending: true });

      if (!data || data.length === 0) return;

      let workMs = 0;
      let breakMs = 0;
      for (let i = 0; i < data.length; i++) {
        const curr = data[i];
        const next = data[i+1];
        const end = next ? new Date(next.created_at).getTime() : Date.now();
        const duration = end - new Date(curr.created_at).getTime();
        
        const isProductive = ["online", "meeting", "training"].includes(curr.status);
        const isBreak = ["break", "lunch", "away"].includes(curr.status);

        if (isProductive) workMs += duration;
        else if (isBreak) breakMs += duration;
      }
      setTimers({ workMs, breakMs });
    } catch (err) {
      console.error("fetchTodayAttendance error:", err);
    }
  }

  const totalTasks = counts.due + counts.overdue;

  async function handleLogout() {
    if (profile) {
      try {
        await supabase.from("profiles").update({ 
          status: "offline", 
          last_seen_at: new Date().toISOString(),
          live_state: null
        }).eq("id", profile.id);
        
        await supabase.from("agent_attendance").insert({
          agent_id: profile.id,
          status: "offline",
          reason: "Manual Logout"
        });
      } catch (err) {
        console.warn("Logout attendance logging failed:", err);
      }

      await sendAdminNotification(`🚪 Agent Log-out: *${profile.name || profile.email}* has signed off.`, "info");
    }
    const { error } = await supabase.auth.signOut();
    if (error) toast.error(error.message);
    else {
      toast.success("Signed out successfully");
      router.push("/login");
    }
  }

  async function updateStatus(status: string, reasonCode?: string) {
    if (!profile) return;
    const { error } = await supabase.from("profiles").update({ 
        status: status, 
        last_seen_at: new Date().toISOString(),
        live_state: status === 'offline' ? null : undefined
    }).eq("id", profile.id);
    
    if (!error) {
      try {
        await supabase.from("agent_attendance").insert({ 
          agent_id: profile.id, 
          status: status,
          reason: reasonCode || null
        });
      } catch (insErr) {
        console.warn("Status update logging failed (check schema):", insErr);
        await supabase.from("agent_attendance").insert({ 
          agent_id: profile.id, 
          status: status
        });
      }
      await sendAdminNotification(`🔄 Status Shift: *${profile.name || profile.email}* is now *${status.toUpperCase()}* ${reasonCode ? `(${reasonCode})` : ""}`, "info");
      setProfile({ ...profile, status: status as any });
      fetchTodayAttendance(profile.id);
      toast.success(`Shift: ${status.toUpperCase()}`);
    }
  }

  const adminUser = isAdmin(profile);

  return (
    <aside className="w-64 min-w-[256px] h-screen bg-[#f7f4ed] flex flex-col border-r border-[#eceae4] sticky top-0 z-50">
      {/* Header */}
      <div className="px-6 py-10 border-b border-[#eceae4]/50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#1c1c1c] flex items-center justify-center shadow-lg shadow-[#1c1c1c]/10">
            <Zap className="w-5 h-5 text-[#fcfbf8]" strokeWidth={2.5} />
          </div>
          <div className="flex flex-col">
            <div className="text-[#1c1c1c] font-black text-xl tracking-tight font-display">CureForever</div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[#5f5f5d]/60 text-[9px] uppercase font-black tracking-widest">Live Engine</span>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4 py-8 space-y-1.5 overflow-y-auto">
        <div className="text-[#5f5f5d]/40 text-[9px] font-black uppercase tracking-[0.2em] px-4 pb-3">Main Menu</div>
        {nav.map(({ label, href, icon: Icon, badge }) => {
          const active = path === href || (href !== "/" && path.startsWith(href));
          const badgeValue = badge === "taskCount" ? totalTasks : (badge === "chatUnread" ? unreadCount : 0);

          return (
            <Link key={href} href={href} className={cn(
              "flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 group relative",
              active 
                ? "bg-[#1c1c1c] text-[#fcfbf8] shadow-sm" 
                : "text-[#5f5f5d] hover:bg-[rgba(28,28,28,0.04)] hover:text-[#1c1c1c]"
            )}>
              <Icon className={cn("w-4 h-4 flex-shrink-0 transition-transform group-hover:scale-105", active ? "text-[#fcfbf8]" : "text-[#5f5f5d]/60 group-hover:text-[#1c1c1c]")} />
              <span className="flex-1">{label}</span>
              {badgeValue > 0 && (
                <span className={cn(
                  "text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center", 
                  active ? "bg-[#fcfbf8]/20 text-[#fcfbf8]" : "bg-rose-500 text-white"
                )}>
                  {badgeValue}
                </span>
              )}
            </Link>
          );
        })}

        {(adminUser || profile?.role === "hr" || profile?.role === "manager" || (profile?.permissions && Object.values(profile.permissions).some(v => v))) && (
          <>
            {(adminUser || profile?.role === "manager" || profile?.permissions?.audit_tasks) && (
              <>
                <div className="text-[#5f5f5d]/40 text-[9px] font-black uppercase tracking-[0.2em] px-4 pb-3 pt-8">Management</div>
                {managerNav.map((item) => {
                  const active = path === item.href;
                  return (
                    <Link key={item.label} href={item.href} className={cn(
                      "flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 group relative",
                      active 
                        ? "bg-[#1c1c1c] text-[#fcfbf8] shadow-sm" 
                        : "text-[#5f5f5d] hover:bg-[rgba(28,28,28,0.04)] hover:text-[#1c1c1c]"
                    )}>
                      <item.icon className={cn("w-4 h-4 flex-shrink-0 transition-transform group-hover:scale-105", active ? "text-[#fcfbf8]" : "text-[#5f5f5d]/60 group-hover:text-[#1c1c1c]")} />
                      <span className="flex-1">{item.label}</span>
                    </Link>
                  );
                })}
              </>
            )}

            {(adminUser || profile?.role === "hr") && (
              <>
                <div className="text-[#5f5f5d]/40 text-[9px] font-black uppercase tracking-[0.2em] px-4 pb-3 pt-8">Human Capital</div>
                {hrNav.map((item) => {
                  const itemTab = item.href.includes("?") ? new URLSearchParams(item.href.split("?")[1]).get("tab") : null;
                  const currentTab = searchParams.get("tab");
                  
                  const active = itemTab 
                    ? (path === "/hr" && currentTab === itemTab)
                    : (path === "/hr" && !currentTab);
                  return (
                    <Link key={item.href} href={item.href} className={cn(
                      "flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 group relative",
                      active 
                        ? "bg-[#1c1c1c] text-[#fcfbf8] shadow-sm" 
                        : "text-[#5f5f5d] hover:bg-[rgba(28,28,28,0.04)] hover:text-[#1c1c1c]"
                    )}>
                      <item.icon className={cn("w-4 h-4 flex-shrink-0 transition-transform group-hover:scale-105", active ? "text-[#fcfbf8]" : "text-[#5f5f5d]/60 group-hover:text-[#1c1c1c]")} />
                      <span className="flex-1">{item.label}</span>
                    </Link>
                  );
                })}
              </>
            )}

            <div className="text-[#5f5f5d]/40 text-[9px] font-black uppercase tracking-[0.2em] px-4 pb-3 pt-8">Operations</div>
            {adminNav.map((item) => {
              const { label, href, icon: Icon, permission } = item;
              if (label === "Alert Logs" && !adminUser) return null;
              if (permission && !hasPermission(profile, permission as any)) return null;
              
              const active = path === href || (href !== "/" && path.startsWith(href));
              return (
                <Link key={href} href={href} className={cn(
                  "flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 group relative",
                  active 
                    ? "bg-[#1c1c1c] text-[#fcfbf8] shadow-sm" 
                    : "text-[#5f5f5d] hover:bg-[rgba(28,28,28,0.04)] hover:text-[#1c1c1c]"
                )}>
                  <Icon className={cn("w-4 h-4 flex-shrink-0 transition-transform group-hover:scale-105", active ? "text-[#fcfbf8]" : "text-[#5f5f5d]/60 group-hover:text-[#1c1c1c]")} />
                  <span className="flex-1">{label}</span>
                </Link>
              );
            })}
          </>
        )}
      </nav>

      {/* Footer / Status */}
      <div className="px-4 py-6 border-t border-[#eceae4]/50 bg-[rgba(28,28,28,0.01)]">
        <div className="mb-4 px-2">
          <label className="text-[9px] font-bold text-[#5f5f5d]/60 uppercase tracking-widest block mb-1.5">Shift Status</label>
          <div className="relative">
            <select
              value={profile?.status || "offline"}
              onChange={async (e) => {
                if (!profile) return;
                const newStatus = e.target.value;
                const statusObj = [
                  { id: "online", label: "Online" },
                  { id: "meeting", label: "Meeting" },
                  { id: "break", label: "Break" },
                  { id: "lunch", label: "Lunch" },
                  { id: "away", label: "Away" },
                  { id: "offline", label: "Offline" }
                ].find(s => s.id === newStatus);

                if (["break", "away", "meeting"].includes(newStatus)) {
                  setShowStatusModal({ id: newStatus, label: statusObj?.label || newStatus });
                  return;
                }
                updateStatus(newStatus);
              }}
              className="w-full appearance-none bg-[#f7f4ed] border border-[#eceae4] text-[#1c1c1c] text-xs font-bold py-2.5 pl-3 pr-8 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#1c1c1c] focus:border-[#1c1c1c] shadow-sm transition-all"
            >
              <option value="online">⚡ Online</option>
              <option value="meeting">👥 Meeting</option>
              <option value="break">☕ Break</option>
              <option value="lunch">🍱 Lunch</option>
              <option value="away">🚶 Away</option>
              <option value="offline">💤 Offline</option>
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-[#5f5f5d]/60">
              <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
            </div>
          </div>
        </div>

        {/* Status Reason Modal */}
        <Modal 
          open={!!showStatusModal} 
          onClose={() => setShowStatusModal(null)} 
          title={`Switch to ${showStatusModal?.label}`}
          maxWidth="max-w-xs"
        >
          <div className="space-y-4">
            <div className="text-[10px] text-[#5f5f5d] font-bold uppercase tracking-widest mb-1">Select Reason</div>
            <div className="grid grid-cols-1 gap-2">
              {(showStatusModal?.id === "break" ? ["Bio Break", "Personal", "Tea/Smoke", "Tech Issue"] : 
                showStatusModal?.id === "away" ? ["System Maintenance", "Support Request", "Escalation", "Management"] :
                ["Stand-up", "Client Meeting", "Training Session", "Team Sync"]
              ).map(r => (
                <button
                  key={r}
                  onClick={() => {
                    updateStatus(showStatusModal!.id, r);
                    setShowStatusModal(null);
                  }}
                  className="w-full text-left px-4 py-2.5 rounded-lg border border-[#eceae4] text-xs font-medium hover:bg-[#1c1c1c] hover:text-white transition-all"
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
        </Modal>

        {profile?.role !== 'admin' && profile?.role !== 'hr' && (
           <button 
             onClick={() => setShowLeaveModal(true)}
             className="w-full flex items-center justify-center gap-2 py-2 mb-4 rounded-lg border border-[#eceae4] text-[#5f5f5d] text-[10px] font-bold uppercase tracking-widest hover:bg-[#1c1c1c] hover:text-white transition-all shadow-sm"
           >
             <Calendar className="w-3 h-3" /> Request Leave
           </button>
        )}

        {/* Leave Request Modal */}
        <Modal 
          open={showLeaveModal} 
          onClose={() => setShowLeaveModal(false)} 
          title="Submit Leave Request"
        >
           <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                 <div>
                    <label className="text-[10px] font-black text-[#5f5f5d]/60 uppercase tracking-widest block mb-1.5">Start Date</label>
                    <input type="date" className="w-full bg-[#f7f4ed] border-[#eceae4] rounded-lg text-xs font-bold p-2.5 focus:ring-[#1c1c1c] shadow-sm" value={leaveData.start} onChange={e => setLeaveData({...leaveData, start: e.target.value})} />
                 </div>
                 <div>
                    <label className="text-[10px] font-black text-[#5f5f5d]/60 uppercase tracking-widest block mb-1.5">End Date</label>
                    <input type="date" className="w-full bg-[#f7f4ed] border-[#eceae4] rounded-lg text-xs font-bold p-2.5 focus:ring-[#1c1c1c] shadow-sm" value={leaveData.end} onChange={e => setLeaveData({...leaveData, end: e.target.value})} />
                 </div>
              </div>
              <div>
                 <label className="text-[10px] font-black text-[#5f5f5d]/60 uppercase tracking-widest block mb-2.5">Reason for Leave</label>
                 <div className="flex flex-wrap gap-2 mb-4">
                    {[
                      { label: "Sick Leave (SL)", text: "I am taking Sick Leave (SL) due to health issues. Please approve." },
                      { label: "Casual Leave (CL)", text: "I would like to take Casual Leave (CL) for some personal work. Please approve." },
                      { label: "Privilege Leave (PL)", text: "I would like to take my Privilege Leave (PL) as planned. Please approve." }
                    ].map(preset => (
                      <button
                        key={preset.label}
                        onClick={() => setLeaveData({ ...leaveData, reason: preset.text })}
                        className="text-[10px] px-3 py-1.5 bg-[#f7f4ed] border border-[#eceae4] hover:bg-[#1c1c1c] hover:text-white rounded-lg transition-all text-[#5f5f5d] font-black uppercase tracking-tighter"
                      >
                        {preset.label}
                      </button>
                    ))}
                 </div>
                 <textarea 
                   className="w-full bg-[#f7f4ed] border-[#eceae4] rounded-xl p-4 text-xs font-bold min-h-[120px] focus:ring-[#1c1c1c] placeholder:text-[#5f5f5d]/20 shadow-inner" 
                   placeholder="Select a preset above or write a custom message..."
                   value={leaveData.reason}
                   onChange={e => setLeaveData({...leaveData, reason: e.target.value})}
                 />
              </div>
              <button 
                onClick={handleRequestLeave}
                disabled={isSubmittingLeave}
                className="w-full py-4 bg-[#1c1c1c] text-[#f7f4ed] rounded-xl text-[10px] font-black uppercase tracking-widest hover:opacity-90 transition-all shadow-xl flex items-center justify-center gap-2"
                style={{ boxShadow: "rgba(255,255,255,0.2) 0px 0.5px 0px 0px inset, rgba(0,0,0,0.2) 0px 0px 0px 0.5px inset, rgba(0,0,0,0.05) 0px 1px 2px 0px" }}
              >
                {isSubmittingLeave ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Sparkles className="w-4 h-4" /> Submit to HR</>}
              </button>

              {myLeaves.length > 0 && (
                <div className="mt-8 border-t border-[#eceae4] pt-8">
                  <h4 className="text-[10px] font-black text-[#5f5f5d]/40 uppercase tracking-[0.2em] mb-4">Request History</h4>
                  <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                    {myLeaves.map(l => (
                      <div key={l.id} className="p-4 bg-[#eceae4]/20 rounded-xl border border-[#eceae4] group transition-all hover:bg-[#f7f4ed]">
                        <div className="flex justify-between items-start mb-2.5">
                           <div className="text-[11px] font-black text-[#1c1c1c] tracking-tight">
                             {l.start_date} <span className="text-[#5f5f5d]/20 font-bold mx-1">→</span> {l.end_date}
                           </div>
                           <div className={cn("text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-lg border", 
                             l.status === 'approved' ? 'bg-emerald-50 border-emerald-100 text-emerald-600' : 
                             l.status === 'rejected' ? 'bg-rose-50 border-rose-100 text-rose-600' : 'bg-amber-50 border-amber-100 text-amber-600'
                           )}>{l.status}</div>
                        </div>
                        <p className="text-[11px] text-[#5f5f5d] font-medium leading-relaxed italic line-clamp-2">
                          &ldquo;{l.reason}&rdquo;
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
           </div>
        </Modal>

        <div className="flex items-center justify-between px-2 mb-6">
            <div className="flex flex-col">
                <span className="text-[9px] text-[#5f5f5d] uppercase font-bold tracking-widest opacity-60">Productive</span>
                <span className="text-xs font-bold text-[#1c1c1c]">{formatDuration(timers.workMs)}</span>
            </div>
            <div className="flex flex-col items-end">
                <span className="text-[9px] text-[#5f5f5d] uppercase font-bold tracking-widest opacity-60">Break</span>
                <span className="text-xs font-bold text-amber-700">{formatDuration(timers.breakMs)}</span>
            </div>
        </div>

        <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-[#f7f4ed] border border-[#eceae4] group">
          <div className="w-8 h-8 rounded-full bg-[#1c1c1c] flex items-center justify-center text-[#fcfbf8] text-[10px] font-bold flex-shrink-0">
            {profile?.name ? profile.name.substring(0, 2).toUpperCase() : (profile?.email ? profile.email.substring(0, 2).toUpperCase() : "??")}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[#1c1c1c] text-[11px] font-bold truncate capitalize leading-tight">{profile?.role || "User"}</div>
            <div className="text-[#5f5f5d] text-[10px] truncate opacity-80">{profile?.email || "loading..."}</div>
          </div>
          <button onClick={handleLogout} className="w-7 h-7 rounded-md hover:bg-rose-50 flex items-center justify-center transition-all">
            <LogOut className="w-3.5 h-3.5 text-[#5f5f5d] hover:text-rose-500" />
          </button>
        </div>
      </div>
    </aside>
  );
}
