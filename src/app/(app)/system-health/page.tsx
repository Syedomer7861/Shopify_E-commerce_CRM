"use client";
import { useState, useEffect, useCallback } from "react";
import { isDemoMode as checkDemoMode } from "@/lib/demo";
import {
  Activity, CheckCircle2, XCircle, AlertTriangle, HelpCircle,
  RefreshCw, Database, Zap, Server, Clock
} from "lucide-react";
import { PageHeader, AccessDenied } from "@/components/ui";
import { useCurrentProfile } from "@/hooks/useCurrentProfile";
import { isAdmin } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";

type CheckStatus = "ok" | "error" | "not_configured" | "stale" | "info";
interface Check {
  key: string; label: string; category: string; status: CheckStatus;
  message: string; latencyMs?: number; meta?: Record<string, any>;
}

const STATUS_CONFIG: Record<CheckStatus, { icon: any; color: string; bg: string; label: string }> = {
  ok: { icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-50 border-emerald-100", label: "Operational" },
  error: { icon: XCircle, color: "text-rose-600", bg: "bg-rose-50 border-rose-100", label: "Down" },
  stale: { icon: AlertTriangle, color: "text-amber-600", bg: "bg-amber-50 border-amber-100", label: "Stale" },
  not_configured: { icon: HelpCircle, color: "text-gray-400", bg: "bg-gray-50 border-gray-100", label: "Not Configured" },
  info: { icon: Activity, color: "text-blue-500", bg: "bg-blue-50 border-blue-100", label: "Info" },
};

const CATEGORY_ICONS: Record<string, any> = {
  Backend: Database, Integrations: Zap, "Cron Jobs": Clock, Environment: Server,
};

export default function SystemHealthPage() {
  const { profile, loading: profileLoading } = useCurrentProfile();
  const [checks, setChecks] = useState<Check[]>([]);
  const [summary, setSummary] = useState<{ ok: number; error: number; stale: number; not_configured: number } | null>(null);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isDemoMode, setIsDemoMode] = useState(false);

  useEffect(() => {
    setIsDemoMode(checkDemoMode());
  }, []);

  const runCheck = useCallback(async (silent = false) => {
    // Every check here makes a REAL live call to production Shopify/
    // Shiprocket/Twilio/Gmail/Meta APIs using real credentials - the demo
    // persona presents as role:'admin' client-side (useCurrentProfile.ts)
    // but the underlying real session isn't admin, so the server correctly
    // 403s. Rather than let that hang as a silent spinner, block it
    // outright: same reasoning Settings already uses for credential
    // exposure, and repeated live third-party calls from a demo walkthrough
    // risk real rate-limiting on production integrations.
    if (checkDemoMode()) {
      setLoading(false);
      return;
    }
    if (!silent) setRefreshing(true);
    try {
      const res = await fetch("/api/admin/system-health");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setChecks(json.checks || []);
      setSummary(json.summary || null);
      setCheckedAt(json.checkedAt || null);
    } catch (err: any) {
      toast.error("Health check failed: " + err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (profileLoading) return;
    if (!isAdmin(profile)) { setLoading(false); return; }
    runCheck();
    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      runCheck(true);
    }, 60000);
    return () => clearInterval(interval);
  }, [profileLoading, profile, runCheck]);

  if (profileLoading) {
    return <div className="py-12 text-center text-gray-400">Loading...</div>;
  }

  if (!isAdmin(profile)) {
    return <AccessDenied title="System Health Locked" desc="Only administrators can view infrastructure and integration status." />;
  }

  const categories = Array.from(new Set(checks.map(c => c.category)));

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="System Health"
        subtitle="Live status of the database, integrations, cron jobs, and environment"
        actions={
          <div className="flex items-center gap-3">
            {checkedAt && (
              <span className="text-[10px] text-gray-400 font-bold uppercase tracking-widest hidden sm:block">
                Checked {new Date(checkedAt).toLocaleTimeString()}
              </span>
            )}
            <button onClick={() => runCheck()} disabled={refreshing || isDemoMode} className="btn-primary py-2 px-4 text-xs">
              <RefreshCw className={cn("w-3.5 h-3.5", refreshing && "animate-spin")} />
              {refreshing ? "Checking..." : "Run Health Check"}
            </button>
          </div>
        }
      />

      {isDemoMode ? (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
            <Activity className="w-5 h-5 text-amber-700" />
          </div>
          <div>
            <p className="text-xs font-black text-amber-900 uppercase tracking-widest">Unavailable in Demo Mode</p>
            <p className="text-[11px] text-amber-700 font-medium">These checks call live production Shopify, Shiprocket, WhatsApp, Gmail, and Twilio APIs with real credentials - disabled during a demo session to avoid unnecessary calls to production integrations.</p>
          </div>
        </div>
      ) : loading ? (
        <div className="p-12 text-center text-gray-400 text-sm">Running live checks against every integration...</div>
      ) : (
        <>
          {summary && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-8">
              <div className="card p-4 border-l-4 border-l-emerald-500">
                <div className="text-2xl font-black text-emerald-600 tabular-nums">{summary.ok}</div>
                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">Operational</div>
              </div>
              <div className="card p-4 border-l-4 border-l-rose-500">
                <div className="text-2xl font-black text-rose-600 tabular-nums">{summary.error}</div>
                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">Down</div>
              </div>
              <div className="card p-4 border-l-4 border-l-amber-500">
                <div className="text-2xl font-black text-amber-600 tabular-nums">{summary.stale}</div>
                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">Stale</div>
              </div>
              <div className="card p-4 border-l-4 border-l-gray-300">
                <div className="text-2xl font-black text-gray-400 tabular-nums">{summary.not_configured}</div>
                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">Not Configured</div>
              </div>
            </div>
          )}

          <div className="space-y-8">
            {categories.map(cat => {
              const CatIcon = CATEGORY_ICONS[cat] || Activity;
              return (
                <div key={cat}>
                  <div className="flex items-center gap-2 mb-3">
                    <CatIcon className="w-4 h-4 text-[#1c1c1c]/50" />
                    <h2 className="text-[10px] font-black text-[#1c1c1c] uppercase tracking-widest">{cat}</h2>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {checks.filter(c => c.category === cat).map(c => {
                      const cfg = STATUS_CONFIG[c.status];
                      const Icon = cfg.icon;
                      return (
                        <div key={c.key} className={cn("card p-4 border flex items-start gap-3", cfg.bg)}>
                          <Icon className={cn("w-5 h-5 flex-shrink-0 mt-0.5", cfg.color)} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs font-bold text-[#1c1c1c] truncate">{c.label}</span>
                              <span className={cn("text-[9px] font-black uppercase tracking-widest flex-shrink-0", cfg.color)}>{cfg.label}</span>
                            </div>
                            <p className="text-[11px] text-gray-500 mt-1 leading-relaxed">{c.message}</p>
                            {typeof c.latencyMs === "number" && (
                              <span className="text-[9px] text-gray-400 font-bold uppercase tracking-widest mt-1 inline-block">{c.latencyMs}ms</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
