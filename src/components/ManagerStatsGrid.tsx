"use client";
import { useEffect, useState, useCallback } from "react";
import { CheckSquare, Users, TrendingUp, Shield } from "lucide-react";
import { StatCard } from "@/components/ui";
import { isDemoMode } from "@/lib/demo";

export default function ManagerStatsGrid() {
  const [stats, setStats] = useState<any>(null);
  const [failed, setFailed] = useState(false);

  const fetchStats = useCallback(async () => {
    if (isDemoMode()) {
      setStats({ auditQueue: 12, activeAgents: 5, ndrResolved: 154, security: "Secured" });
      return true;
    }
    // Bound the request - a throttled Supabase project can otherwise leave
    // this hanging forever, and every poll stacks another dead fetch.
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 12_000);
    try {
      const res = await fetch("/api/manager/stats", { signal: ctrl.signal, cache: "no-store" });
      if (res.ok) {
        setStats(await res.json());
        setFailed(false);
        return true;
      }
    } catch { /* aborted or network error */ }
    finally { clearTimeout(t); }
    setFailed(true);
    return false;
  }, []);

  useEffect(() => {
    let cancelled = false;

    // First paint: try now, and if it fails retry a few times quickly so the
    // cards don't sit on the placeholder until the 3-minute poll comes round.
    (async () => {
      for (let i = 0; i < 4; i++) {
        if (cancelled) return;
        if (await fetchStats()) return;
        await new Promise((r) => setTimeout(r, 4000));
      }
    })();

    const poll = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      fetchStats();
    }, 3 * 60_000);

    return () => {
      cancelled = true;
      clearInterval(poll);
    };
  }, [fetchStats]);

  const ph = failed ? "—" : "…";
  const config = [
    {
      label: "Audit Queue",
      value: stats?.auditQueue ?? ph,
      icon: <CheckSquare className="w-4 h-4" />,
      accent: "text-[#1c1c1c]",
      variant: "glass" as const,
    },
    {
      label: "Active Agents",
      value: stats?.activeAgents ?? ph,
      icon: <Users className="w-4 h-4" />,
      accent: "text-emerald-600",
      variant: "glass" as const,
    },
    {
      label: "NDR Resolved",
      value: stats?.ndrResolved ?? ph,
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
