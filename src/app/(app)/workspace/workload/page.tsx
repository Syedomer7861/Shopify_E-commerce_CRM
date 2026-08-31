"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { RefreshCw, Gauge } from "lucide-react";
import toast from "react-hot-toast";
import { PageHeader } from "@/components/ui";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase";
import { isDemoMode } from "@/lib/demo";
import { marketingApi } from "@/lib/marketing-client";
import { MOCK_TEAM } from "@/lib/mockData";
import type { MktTask, MktList } from "@/types";

const CAP_KEY = "mkt-workload-weekly-hours";
const DEFAULT_WEEKLY_HOURS = 40;
const fmtH = (mins: number) => `${(mins / 60).toFixed(1)}h`;

// Open workload per person across every Space the viewer can see: how many
// open tasks are assigned to them and how many estimated hours that is,
// against a configurable weekly capacity.
export default function WorkloadPage() {
  const [tasks, setTasks] = useState<MktTask[]>([]);
  const [lists, setLists] = useState<MktList[]>([]);
  const [loading, setLoading] = useState(true);
  const [names, setNames] = useState<Record<string, string>>({});
  const [weeklyHours, setWeeklyHours] = useState(DEFAULT_WEEKLY_HOURS);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(CAP_KEY);
      if (raw) setWeeklyHours(Math.max(1, Number(raw)) || DEFAULT_WEEKLY_HOURS);
    } catch { /* ignore */ }
  }, []);
  function setCap(h: number) {
    setWeeklyHours(h);
    try { localStorage.setItem(CAP_KEY, String(h)); } catch { /* ignore */ }
  }

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [t, l] = await Promise.all([marketingApi.listTasks({}), marketingApi.listLists()]);
        setTasks(t);
        setLists(l);

        const ids = [...new Set(t.flatMap((x) => x.assignees ?? []))];
        if (isDemoMode()) {
          setNames(Object.fromEntries(MOCK_TEAM.map((m: any) => [m.id, m.name])));
        } else if (ids.length) {
          const { data } = await createClient().from("profiles").select("id, name, email").in("id", ids);
          setNames(Object.fromEntries((data ?? []).map((p: any) => [p.id, p.name || p.email])));
        }
      } catch (e: any) {
        toast.error(e.message || "Could not load workload");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const rows = useMemo(() => {
    const doneKeys = new Set(
      lists.flatMap((l) => (l.statuses ?? []).filter((s) => s.type === "done").map((s) => `${l.id}:${s.id}`))
    );
    const open = tasks.filter((t) => !doneKeys.has(`${t.list_id}:${t.status}`));

    const byUser = new Map<string, { count: number; mins: number; noEstimate: number }>();
    for (const t of open) {
      for (const uid of t.assignees ?? []) {
        const cur = byUser.get(uid) ?? { count: 0, mins: 0, noEstimate: 0 };
        cur.count += 1;
        if (t.estimate_minutes && t.estimate_minutes > 0) cur.mins += t.estimate_minutes;
        else cur.noEstimate += 1;
        byUser.set(uid, cur);
      }
    }
    const capMins = weeklyHours * 60;
    return [...byUser.entries()]
      .map(([uid, v]) => ({
        uid,
        name: names[uid] || "Unknown",
        ...v,
        pct: capMins ? Math.round((v.mins / capMins) * 100) : 0,
      }))
      .sort((a, b) => b.mins - a.mins || b.count - a.count);
  }, [tasks, lists, names, weeklyHours]);

  const unassigned = useMemo(() => {
    const doneKeys = new Set(
      lists.flatMap((l) => (l.statuses ?? []).filter((s) => s.type === "done").map((s) => `${l.id}:${s.id}`))
    );
    return tasks.filter((t) => !doneKeys.has(`${t.list_id}:${t.status}`) && (t.assignees ?? []).length === 0).length;
  }, [tasks, lists]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-[#5f5f5d] gap-3">
        <RefreshCw className="w-8 h-8 animate-spin" />
        <p className="text-[10px] font-bold uppercase tracking-widest opacity-60">Loading workload…</p>
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-3xl">
      <PageHeader
        title={<span className="flex items-center gap-2"><Gauge className="w-5 h-5" /> Workload</span>}
        subtitle="Open tasks and estimated hours per person, across every Space you can see."
        actions={
          <div className="flex items-center gap-2 text-xs">
            <span className="font-bold text-[#5f5f5d]">Weekly capacity</span>
            <input
              type="number" min={1} value={weeklyHours}
              onChange={(e) => setCap(Math.max(1, Number(e.target.value) || DEFAULT_WEEKLY_HOURS))}
              className="w-16 text-xs font-bold bg-white border border-[#eceae4] rounded-lg px-2 py-1.5"
            />
            <span className="font-bold text-[#5f5f5d]">h</span>
          </div>
        }
      />

      {rows.length === 0 ? (
        <div className="bg-white border border-[#eceae4] rounded-2xl p-10 text-center text-[11px] font-bold uppercase tracking-widest text-[#5f5f5d]/50">
          No open assigned tasks
        </div>
      ) : (
        <div className="bg-white border border-[#eceae4] rounded-2xl divide-y divide-[#eceae4]">
          {rows.map((r) => {
            const over = r.pct > 100;
            return (
              <div key={r.uid} className="p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-[13px] font-bold text-[#1c1c1c] truncate">{r.name}</div>
                  <div className="text-[11px] font-bold flex-shrink-0">
                    <span className={cn(over ? "text-rose-600" : "text-[#1c1c1c]")}>{fmtH(r.mins)}</span>
                    <span className="text-[#5f5f5d]/60"> / {weeklyHours}h · {r.count} task{r.count === 1 ? "" : "s"}</span>
                  </div>
                </div>
                <div className="h-1.5 rounded-full bg-[#eceae4] overflow-hidden mt-2">
                  <div
                    className={cn("h-full rounded-full", over ? "bg-rose-500" : r.pct > 80 ? "bg-amber-500" : "bg-emerald-500")}
                    style={{ width: `${Math.min(100, r.pct)}%` }}
                  />
                </div>
                {r.noEstimate > 0 && (
                  <div className="text-[10px] font-bold text-[#5f5f5d]/50 mt-1">
                    {r.noEstimate} task{r.noEstimate === 1 ? "" : "s"} with no estimate — not counted in hours
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {unassigned > 0 && (
        <div className="text-[11px] font-bold text-[#5f5f5d]/70">
          {unassigned} open task{unassigned === 1 ? "" : "s"} unassigned.{" "}
          <Link href="/workspace" className="text-[#1c1c1c] hover:underline">Open the board →</Link>
        </div>
      )}
    </div>
  );
}
