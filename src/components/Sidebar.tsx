"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { 
  LayoutDashboard, Users, ClipboardCheck, ShoppingBag, 
  Megaphone, Shield, Settings, Info, CreditCard, Sparkles, 
  GitBranch, LogOut, CheckCircle2, Moon, Sun, Monitor, 
  Menu, X, MessageSquare, Zap, Calendar, BarChart2, Upload, CheckSquare
} from "lucide-react";
import { cn, toDbDateString } from "@/lib/utils";
import { createClient } from "@/lib/supabase";
import toast from "react-hot-toast";
import { DEFAULT_PERMISSIONS, hasPermission, isAdmin } from "@/lib/permissions";

const nav = [
  { label: "Dashboard",   href: "/dashboard",  icon: LayoutDashboard },
  { label: "Tasks",       href: "/tasks",       icon: CheckSquare,   badge: "taskCount" },
  { label: "Customers",   href: "/customers",   icon: Users },
  { label: "Orders",      href: "/orders",      icon: ShoppingBag },
];

const adminNav = [
  { label: "Analytics",   href: "/reports",     icon: BarChart2, permission: "view_analytics" },
  { label: "Import",      href: "/import",      icon: Upload,    permission: "can_import" },
  { label: "Campaigns",   href: "/campaigns",   icon: Megaphone,  permission: "manage_team" },
  { label: "Templates",   href: "/templates",   icon: Sparkles,   permission: "manage_team" },
  { label: "Workflows",   href: "/workflows",   icon: Zap,        permission: "manage_team" },
  { label: "Calendar",    href: "/calendar",    icon: Calendar,   permission: "manage_team" },
  { label: "Team",        href: "/team",        icon: Shield,     permission: "manage_team" },
  { label: "Settings",    href: "/settings",    icon: Settings,   permission: "manage_team" },
];

import type { Profile } from "@/types";

export default function Sidebar() {
  const path = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [counts, setCounts] = useState({ due: 0, overdue: 0 });

  useEffect(() => {
    fetchProfile();

    // Subscribe to task changes for real-time badge updates
    const channel = supabase
      .channel("sidebar-task-count-sync")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tasks" },
        () => {
          // Real-time re-fetch when tasks are added, updated, or deleted
          if (profile?.id) fetchTaskCounts(profile.id, profile.role);
          else fetchProfile(); 
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.id]);

  async function fetchProfile() {
    try {
      const { data, error: authErr } = await supabase.auth.getUser();
      if (authErr || !data?.user) return;
      
      const user = data.user;
      
      // Fetch actual profile data from Supabase
      const { data: profileData } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .maybeSingle();

      const profile = profileData || { 
        id: user.id, 
        email: user.email!, 
        role: "agent", 
        permissions: DEFAULT_PERMISSIONS, 
        is_active: true 
      };
      
      setProfile(profile);
      fetchTaskCounts(user.id, profile.role);
    } catch (err) {
      console.error("fetchProfile error:", err);
    }
  }

  async function fetchTaskCounts(userId: string, role?: string) {
    try {
      const today = toDbDateString(new Date());
      
      // Use count: "exact" to avoid the 1000-row fetch limit and improve performance
      let dueQuery = supabase.from("tasks")
        .select("*", { count: "exact", head: true })
        .eq("due_date", today)
        .in("status", ["pending", "due", "rescheduled"]);
      
      let overdueQuery = supabase.from("tasks")
        .select("*", { count: "exact", head: true })
        .lt("due_date", today)
        .not("status", "in", '("done","skipped","cancelled")');

      // Individual agents only see their own tasks
      if (role === "agent") {
        dueQuery = dueQuery.eq("assigned_to", userId);
        overdueQuery = overdueQuery.eq("assigned_to", userId);
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

  const totalTasks = counts.due + counts.overdue;

  async function handleLogout() {
    const { error } = await supabase.auth.signOut();
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Signed out successfully");
      router.push("/login");
    }
  }

  const adminUser = isAdmin(profile);

  return (
    <aside className="w-64 min-w-[256px] h-screen bg-white flex flex-col border-r border-gray-100 sticky top-0 z-50 transition-all duration-300">
      {/* Logo */}
      <div className="px-6 py-8 border-b border-gray-50 relative">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#2D1E6F] flex items-center justify-center shadow-lg shadow-[#2D1E6F]/20">
            <Zap className="w-5 h-5 text-white" strokeWidth={3} />
          </div>
          <div className="flex flex-col">
            <div className="text-[#1A1A1A] font-bold text-lg tracking-tight">CureForever</div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
              <span className="text-gray-400 text-[9px] uppercase font-bold tracking-widest">Live Engine</span>
            </div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto">
        <div className="text-gray-400 text-[10px] font-bold uppercase tracking-widest px-3 pb-3">Main Menu</div>
        {nav.map(({ label, href, icon: Icon, badge }) => {
          const active = path === href || (href !== "/" && path.startsWith(href));
          return (
            <Link key={href} href={href} className={cn(
              "flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 group relative",
              active 
                ? "bg-[#2D1E6F] text-white shadow-md shadow-[#2D1E6F]/20" 
                : "text-gray-500 hover:bg-gray-50 hover:text-[#2D1E6F]"
            )}>
              <Icon className={cn("w-4 h-4 flex-shrink-0 transition-transform group-hover:scale-110", active ? "text-white" : "text-gray-400 group-hover:text-[#2D1E6F]")} />
              <span className="flex-1">{label}</span>
              {badge === "taskCount" && totalTasks > 0 && (
                <span className={cn(
                  "text-[10px] font-bold px-2 py-0.5 rounded-full", 
                  active ? "bg-white/20 text-white" : "bg-rose-500 text-white shadow-lg shadow-rose-500/30"
                )}>
                  {totalTasks}
                </span>
              )}
            </Link>
          );
        })}

        {/* Filter adminNav based on specific permissions or admin role */}
        {(adminUser || (profile?.permissions && Object.values(profile.permissions).some(v => v))) && (
          <>
            <div className="text-gray-400 text-[10px] font-bold uppercase tracking-widest px-3 pb-3 pt-6">Admin & Reports</div>
            {adminNav.map((item) => {
              const { label, href, icon: Icon, permission } = item;
              const hasNavPermission = hasPermission(profile, permission as any);
              
              if (!hasNavPermission) return null;

              const active = path === href || (href !== "/" && path.startsWith(href));
              return (
                <Link key={href} href={href} className={cn(
                  "flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 group relative",
                  active 
                    ? "bg-[#2D1E6F] text-white shadow-md shadow-[#2D1E6F]/20" 
                    : "text-gray-500 hover:bg-gray-50 hover:text-[#2D1E6F]"
                )}>
                  <Icon className={cn("w-4 h-4 flex-shrink-0 transition-transform group-hover:scale-110", active ? "text-white" : "text-gray-400 group-hover:text-[#2D1E6F]")} />
                  <span className="flex-1">{label}</span>
                </Link>
              );
            })}
          </>
        )}
      </nav>

      {/* Shift Toggle & User */}
      <div className="px-4 py-6 border-t border-gray-50 space-y-4">
        {/* Status Mode Picker */}
        <div className={cn(
          "p-1 rounded-xl bg-gray-50 flex items-center gap-1",
          !profile && "opacity-20 pointer-events-none"
        )}>
          {[
            { id: "online", color: "bg-blue-500", label: "On" },
            { id: "break",  color: "bg-amber-500",   label: "Break" },
            { id: "offline", color: "bg-gray-500",    label: "Off" }
          ].map(s => (
            <button
              key={s.id}
              onClick={async () => {
                if (!profile) return;
                const { error } = await supabase.from("profiles").update({ status: s.id, last_seen_at: new Date().toISOString() }).eq("id", profile.id);
                if (!error) {
                  setProfile({ ...profile, status: s.id as any });
                  toast.success(`Shift: ${s.id.toUpperCase()}`);
                }
              }}
              className={cn(
                "flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[10px] font-bold transition-all",
                profile?.status === s.id 
                  ? "bg-white text-[#2D1E6F] shadow-sm" 
                  : "text-gray-400 hover:text-gray-600"
              )}
            >
              <div className={cn("w-1.5 h-1.5 rounded-full animate-pulse", s.color)} />
              {s.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-50 transition-all group border border-transparent hover:border-gray-100">
          <div className="w-9 h-9 rounded-full bg-[#2D1E6F]/10 flex items-center justify-center text-[#2D1E6F] text-[11px] font-bold flex-shrink-0">
            {profile?.name ? profile.name.substring(0, 2).toUpperCase() : (profile?.email ? profile.email.substring(0, 2).toUpperCase() : "??")}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-gray-900 text-[11px] font-bold truncate capitalize">{profile?.role || "User"}</div>
            <div className="text-gray-400 text-[10px] truncate">{profile?.email || "loading..."}</div>
          </div>
          <button onClick={handleLogout} className="w-8 h-8 rounded-lg hover:bg-rose-50 flex items-center justify-center transition-all group/logout">
            <LogOut className="w-4 h-4 text-gray-300 group-hover/logout:text-rose-500" />
          </button>
        </div>
      </div>
    </aside>

  );
}
