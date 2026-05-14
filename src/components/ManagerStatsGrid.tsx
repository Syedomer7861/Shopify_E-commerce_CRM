"use client";
import { useEffect, useState, useCallback } from "react";
import { CheckSquare, Users, TrendingUp, Shield } from "lucide-react";
import { StatCard } from "@/components/ui";
import { createClient } from "@/lib/supabase";

export default function ManagerStatsGrid() {
  const [stats, setStats] = useState<any>(null);
  const supabase = createClient();

  const fetchStats = useCallback(async () => {
    const isDemo = document.cookie.includes("crm-demo-mode=true");
    if (isDemo) {
      setStats({
        auditQueue: 12,
        activeAgents: 5,
        ndrResolved: 154,
        security: "Secured"
      });
      return;
    }
    try {
      const res = await fetch("/api/manager/stats");
      if (res.ok) setStats(await res.json());
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    fetchStats();

    // ── 60-second polling fallback ────────────────────────────
    const poll = setInterval(fetchStats, 60_000);

    // ── Supabase real-time: re-fetch when tasks or orders change
    const channel = supabase
      .channel("manager-stats-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" },   fetchStats)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" },  fetchStats)
      .subscribe();

    return () => {
      clearInterval(poll);
      supabase.removeChannel(channel);
    };
  }, [fetchStats, supabase]);

  const config = [
    {
      label: "Audit Queue",
      value: stats?.auditQueue ?? "…",
      icon: <CheckSquare className="w-4 h-4" />,
      accent: "text-[#1c1c1c]",
      variant: "glass" as const,
    },
    {
      label: "Active Agents",
      value: stats?.activeAgents ?? "…",
      icon: <Users className="w-4 h-4" />,
      accent: "text-emerald-600",
      variant: "glass" as const,
    },
    {
      label: "NDR Resolved",
      value: stats?.ndrResolved ?? "…",
      icon: <TrendingUp className="w-4 h-4" />,
      accent: "text-blue-600",
      variant: "glass" as const,
    },
    {
      label: "Security",
      value: stats?.security ?? "Active",
      icon: <Shield className="w-4 h-4" />,
      accent: "text-amber-600",
      variant: "glass" as const,
      sub: "Platform Shield",
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 w-full animate-in fade-in slide-in-from-top-8 duration-700">
      {config.map((s, idx) => (
        <StatCard
          key={idx}
          label={s.label}
          value={s.value}
          icon={s.icon}
          accent={s.accent}
          variant={s.variant}
          sub={s.sub}
          className="hover:scale-[1.02] transition-all duration-500"
        />
      ))}
    </div>
  );
}
