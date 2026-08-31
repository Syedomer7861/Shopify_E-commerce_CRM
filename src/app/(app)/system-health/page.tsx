"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import { isDemoMode as checkDemoMode } from "@/lib/demo";
import {
  Activity, CheckCircle2, XCircle, AlertTriangle, HelpCircle,
  RefreshCw, Database, Zap, Server, Clock, Gauge, ListChecks, GitBranch, Copy, Check,
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
interface Summary { ok: number; error: number; stale: number; not_configured: number; info?: number; total?: number; }

const STATUS_CONFIG: Record<CheckStatus, { icon: any; color: string; bg: string; label: string; rank: number }> = {
  error: { icon: XCircle, color: "text-rose-600", bg: "bg-rose-50 border-rose-100", label: "Down", rank: 0 },
  stale: { icon: AlertTriangle, color: "text-amber-600", bg: "bg-amber-50 border-amber-100", label: "Stale", rank: 1 },
  not_configured: { icon: HelpCircle, color: "text-gray-400", bg: "bg-gray-50 border-gray-100", label: "Not Configured", rank: 2 },
  info: { icon: Activity, color: "text-blue-500", bg: "bg-blue-50 border-blue-100", label: "Info", rank: 3 },
  ok: { icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-50 border-emerald-100", label: "Operational", rank: 4 },
};

const CATEGORY_ICONS: Record<string, any> = {
  Backend: Database, Integrations: Zap, "Cron Jobs": Clock, Environment: Server,
  Quota: Gauge, Queue: ListChecks, Deployment: GitBranch,
};
const CATEGORY_ORDER = ["Backend", "Quota", "Integrations", "Cron Jobs", "Queue", "Deployment", "Environment"];

const latencyColor = (ms?: number) =>
  ms == null ? "text-gray-400" : ms < 500 ? "text-emerald-500" : ms < 2000 ? "text-amber-500" : "text-rose-500";

export default function SystemHealthPage() {
  const { profile, loading: profileLoading } = useCurrentProfile();
  const [checks, setChecks] = useState<Check[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState<0 | 30 | 60>(60);
  const [problemsOnly, setProblemsOnly] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => { setIsDemoMode(checkDemoMode()); }, []);
  useEffect(() => {
    try {
      const v = Number(localStorage.getItem("sysHealthAuto"));
      if (v === 0 || v === 30 || v === 60) setAutoRefresh(v as 0 | 30 | 60);
    } catch { /* ignore */ }
  }, []);

  const runCheck = useCallback(async (silent = false) => {
    if (checkDemoMode()) { setLoading(false); return; }
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
  }, [profileLoading, profile, runCheck]);

  useEffect(() => {
    if (!autoRefresh || isDemoMode || !isAdmin(profile)) return;
    const id = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      runCheck(true);
    }, autoRefresh * 1000);
    return () => clearInterval(id);
  }, [autoRefresh, isDemoMode, profile, runCheck]);

  const setAuto = (v: 0 | 30 | 60) => {
    setAutoRefresh(v);
    try { localStorage.setItem("sysHealthAuto", String(v)); } catch { /* ignore */ }
  };

  const problemCount = (summary?.error ?? 0) + (summary?.stale ?? 0);

  const visibleChecks = useMemo(() => {
    const arr = problemsOnly ? checks.filter(c => c.status === "error" || c.status === "stale") : checks;
    return [...arr].sort((a, b) => STATUS_CONFIG[a.status].rank - STATUS_CONFIG[b.status].rank);
  }, [checks, problemsOnly]);

  const categories = useMemo(() => {
    const present = Array.from(new Set(visibleChecks.map(c => c.category)));
    return present.sort((a, b) => {
      const ai = CATEGORY_ORDER.indexOf(a), bi = CATEGORY_ORDER.indexOf(b);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });
  }, [visibleChecks]);

  function copyReport() {
    const lines = [
      `# System Health — ${checkedAt ? new Date(checkedAt).toLocaleString() : "now"}`,
      `${summary?.ok ?? 0} ok · ${summary?.error ?? 0} down · ${summary?.stale ?? 0} stale · ${summary?.not_configured ?? 0} not configured`,
      "",
      ...categories.flatMap(cat => [
        `## ${cat}`,
        ...checks.filter(c => c.category === cat).map(c =>
          `- [${STATUS_CONFIG[c.status].label}] ${c.label}: ${c.message}${c.latencyMs != null ? ` (${c.latencyMs}ms)` : ""}`
        ),
        "",
      ]),
    ];
    navigator.clipboard.writeText(lines.join("\n")).then(
      () => { setCopied(true); setTimeout(() => setCopied(false), 1500); },
      () => toast.error("Clipboard blocked")
    );
  }

  if (profileLoading) return <div className="py-12 text-center text-gray-400">Loading...</div>;
  if (!isAdmin(profile)) {
    return <AccessDenied title="System Health Locked" desc="Only administrators can view infrastructure and integration status." />;
  }

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="System Health"
        subtitle="Live status of the database, quota, integrations, cron jobs, queue, and environment"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center bg-[#eceae4]/50 rounded-lg border border-[#eceae4] p-0.5">
              {([0, 30, 60] as const).map(v => (
                <button key={v} onClick={() => setAuto(v)}
                  className={cn("px-2 py-1 rounded-md text-[9px] font-black uppercase tracking-widest",
                    autoRefresh === v ? "bg-white text-[#1c1c1c] shadow-sm" : "text-[#5f5f5d]")}>
                  {v === 0 ? "Manual" : `${v}s`}
                </button>
              ))}
            </div>
            <button onClick={copyReport} disabled={!checks.length}
              className="px-2.5 py-2 rounded-lg border border-[#eceae4] bg-white text-[#1c1c1c] text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 disabled:opacity-40">
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">{copied ? "Copied" : "Copy report"}</span>
            </button>
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
            <p className="text-[11px] text-amber-700 font-medium">These checks call live production Shopify, Shiprocket, WhatsApp, Gmail, and Twilio APIs with real credentials - disabled during a demo session.</p>
          </div>
        </div>
      ) : loading ? (
        <div className="p-12 text-center text-gray-400 text-sm">Running live checks against every integration...</div>
      ) : (
        <>
          {/* Overall banner */}
          <div className={cn(
            "rounded-2xl border p-4 mb-6 flex items-center gap-3",
            problemCount === 0 ? "bg-emerald-50 border-emerald-100" : summary?.error ? "bg-rose-50 border-rose-100" : "bg-amber-50 border-amber-100"
          )}>
            {problemCount === 0
              ? <CheckCircle2 className="w-6 h-6 text-emerald-600 flex-shrink-0" />
              : <AlertTriangle className={cn("w-6 h-6 flex-shrink-0", summary?.error ? "text-rose-600" : "text-amber-600")} />}
            <div className="flex-1">
              <div className="text-sm font-black text-[#1c1c1c]">
                {problemCount === 0 ? "All systems operational" : `${problemCount} issue${problemCount === 1 ? "" : "s"} need attention`}
              </div>
              <div className="text-[11px] text-gray-500 font-medium">
                {summary?.total ?? checks.length} checks
                {checkedAt && ` · last run ${new Date(checkedAt).toLocaleTimeString()}`}
                {autoRefresh > 0 && ` · auto-refresh every ${autoRefresh}s`}
              </div>
            </div>
            {problemCount > 0 && (
              <button onClick={() => setProblemsOnly(p => !p)}
                className={cn("text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-lg border",
                  problemsOnly ? "bg-[#1c1c1c] text-white border-[#1c1c1c]" : "bg-white text-[#5f5f5d] border-[#eceae4]")}>
                {problemsOnly ? "Show all" : "Problems only"}
              </button>
            )}
          </div>

          {summary && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-8">
              {[
                { n: summary.ok, label: "Operational", c: "text-emerald-600", b: "border-l-emerald-500" },
                { n: summary.error, label: "Down", c: "text-rose-600", b: "border-l-rose-500" },
                { n: summary.stale, label: "Stale", c: "text-amber-600", b: "border-l-amber-500" },
                { n: summary.not_configured, label: "Not Configured", c: "text-gray-400", b: "border-l-gray-300" },
              ].map(t => (
                <div key={t.label} className={cn("card p-4 border-l-4", t.b)}>
                  <div className={cn("text-2xl font-black tabular-nums", t.c)}>{t.n}</div>
                  <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">{t.label}</div>
                </div>
              ))}
            </div>
          )}

          {visibleChecks.length === 0 ? (
            <div className="p-10 text-center text-[11px] font-bold uppercase tracking-widest text-gray-400">Nothing matches this filter</div>
          ) : (
            <div className="space-y-8">
              {categories.map(cat => {
                const CatIcon = CATEGORY_ICONS[cat] || Activity;
                const rows = visibleChecks.filter(c => c.category === cat);
                return (
                  <div key={cat}>
                    <div className="flex items-center gap-2 mb-3">
                      <CatIcon className="w-4 h-4 text-[#1c1c1c]/50" />
                      <h2 className="text-[10px] font-black text-[#1c1c1c] uppercase tracking-widest">{cat}</h2>
                      <span className="text-[9px] font-bold text-gray-300">{rows.length}</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {rows.map(c => {
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
                              <p className="text-[11px] text-gray-500 mt-1 leading-relaxed break-words">{c.message}</p>
                              {typeof c.latencyMs === "number" && (
                                <span className={cn("text-[9px] font-bold uppercase tracking-widest mt-1 inline-block", latencyColor(c.latencyMs))}>
                                  {c.latencyMs}ms
                                </span>
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
          )}
        </>
      )}
    </div>
  );
}
