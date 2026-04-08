"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard, CheckSquare, Users, ShoppingBag,
  BarChart2, Upload, Settings, LogOut, Zap, Shield
} from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase";
import toast from "react-hot-toast";

const nav = [
  { label: "Dashboard",   href: "/dashboard",  icon: LayoutDashboard },
  { label: "Tasks",       href: "/tasks",       icon: CheckSquare,   badge: "taskCount" },
  { label: "Customers",   href: "/customers",   icon: Users },
  { label: "Orders",      href: "/orders",      icon: ShoppingBag },
];

const adminNav = [
  { label: "Analytics",   href: "/reports",     icon: BarChart2, permission: "view_analytics" },
  { label: "Import",      href: "/import",      icon: Upload,    permission: "can_import" },
  { label: "Team",        href: "/team",        icon: Shield,    permission: "manage_team" },
  { label: "Settings",    href: "/settings",    icon: Settings,  permission: "manage_team" },
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
  }, []);

  async function fetchProfile() {
    try {
      const { data, error: authErr } = await supabase.auth.getUser();
      if (authErr || !data?.user) return;
      
      const user = data.user;
      const { data: profileData } = await supabase.from("profiles").select("*").eq("id", user.id).single();
      setProfile(profileData || { id: user.id, email: user.email!, role: "agent" });
      fetchTaskCounts(user.id);
    } catch (err) {
      console.error("fetchProfile error:", err);
    }
  }

  async function fetchTaskCounts(userId: string) {
    const today = new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD
    const { data } = await supabase.from("tasks")
      .select("status, due_date")
      .neq("status", "done")
      .neq("status", "cancelled")
      .neq("status", "skipped");

    const c = { due: 0, overdue: 0 };
    data?.forEach(t => {
      if (t.due_date < today) c.overdue++;
      else if (t.due_date === today) c.due++;
    });
    setCounts(c);
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

  const isAdmin = profile?.role === "admin" || profile?.role === "superadmin";

  return (
    <aside className="w-60 min-w-[240px] h-screen bg-forest flex flex-col border-r border-white/10 sticky top-0">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-lime flex items-center justify-center">
            <Zap className="w-4 h-4 text-forest" strokeWidth={2.5} />
          </div>
          <div>
            <div className="text-white font-semibold text-sm leading-tight">CureForever</div>
            <div className="text-white/40 text-xs">CRM Dashboard</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        <div className="text-white/30 text-[10px] font-semibold uppercase tracking-wider px-3 pb-2">Main</div>
        {nav.map(({ label, href, icon: Icon, badge }) => {
          const active = path === href || (href !== "/" && path.startsWith(href));
          return (
            <Link key={href} href={href} className={cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all",
              active ? "bg-lime text-forest" : "text-white/60 hover:bg-white/10 hover:text-white"
            )}>
              <Icon className="w-4 h-4 flex-shrink-0" />
              <span className="flex-1">{label}</span>
              {badge === "taskCount" && totalTasks > 0 && (
                <span className={cn("text-xs font-bold px-1.5 py-0.5 rounded-md", active ? "bg-forest/20 text-forest" : "bg-rose-500 text-white")}>
                  {totalTasks}
                </span>
              )}
            </Link>
          );
        })}

        {/* Filter adminNav based on specific permissions or admin role */}
        {(isAdmin || (profile?.permissions && Object.values(profile.permissions).some(v => v))) && (
          <>
            <div className="text-white/30 text-[10px] font-semibold uppercase tracking-wider px-3 pb-2 pt-4">Admin & Reports</div>
            {adminNav.map((item) => {
              const { label, href, icon: Icon, permission } = item;
              const hasPermission = isAdmin || (profile?.permissions as any)?.[permission!];
              
              if (!hasPermission) return null;

              const active = path === href || (href !== "/" && path.startsWith(href));
              return (
                <Link key={href} href={href} className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all",
                  active ? "bg-lime text-forest" : "text-white/60 hover:bg-white/10 hover:text-white"
                )}>
                  <Icon className="w-4 h-4 flex-shrink-0" />
                  {label}
                </Link>
              );
            })}
          </>
        )}
      </nav>

      {/* User */}
      <div className="px-3 py-4 border-t border-white/10">
        <div className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/10 transition-all group">
          <div className="w-8 h-8 rounded-full bg-lime/20 flex items-center justify-center text-lime text-[10px] font-bold flex-shrink-0">
            {profile?.name ? profile.name.substring(0, 2).toUpperCase() : (profile?.email ? profile.email.substring(0, 2).toUpperCase() : "??")}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-white text-[11px] font-medium truncate capitalize">{profile?.role || "User"}</div>
            <div className="text-white/40 text-[10px] truncate">{profile?.email || "loading..."}</div>
          </div>
          <button onClick={handleLogout} className="w-7 h-7 rounded-lg hover:bg-rose-50/20 flex items-center justify-center transition-all">
            <LogOut className="w-3.5 h-3.5 text-white/30 group-hover:text-white/60" />
          </button>
        </div>
      </div>
    </aside>
  );
}
