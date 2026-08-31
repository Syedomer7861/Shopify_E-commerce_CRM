"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { RefreshCw, Sparkles } from "lucide-react";
import toast from "react-hot-toast";
import { PageHeader } from "@/components/ui";
import { cn } from "@/lib/utils";
import { useCurrentProfile } from "@/hooks/useCurrentProfile";
import { marketingApi } from "@/lib/marketing-client";
import type { MktTask, MktList } from "@/types";

const PRIORITY_ORDER: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 };
const startOfWeekEnd = () => {
  const d = new Date();
  d.setDate(d.getDate() + (7 - d.getDay()));
  return d.toISOString().slice(0, 10);
};

// Every workspace task assigned to me, across every Space I can see.
export default function MyWorkPage() {
  const { profile, loading: profileLoading } = useCurrentProfile();
  const [tasks, setTasks] = useState<MktTask[]>([]);
  const [lists, setLists] = useState<MktList[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (profileLoading || !profile) return;
    (async () => {
      setLoading(true);
      try {
        const [t, l] = await Promise.all([
          marketingApi.listTasks({ assignee: profile.id }),
          marketingApi.listLists(),
        ]);
        setTasks(t);
        setLists(l);
      } catch (e: any) {
        toast.error(e.message || "Could not load your work");
      } finally {
        setLoading(false);
      }
    })();
  }, [profileLoading, profile]);

  const listById = useMemo(() => new Map(lists.map((l) => [l.id, l])), [lists]);
  const today = new Date().toISOString().slice(0, 10);
  const weekEnd = startOfWeekEnd();

  const buckets = useMemo(() => {
    const done = new Set(
      lists.flatMap((l) => (l.statuses ?? []).filter((s) => s.type === "done").map((s) => `${l.id}:${s.id}`))
    );
    const open = tasks.filter((t) => !done.has(`${t.list_id}:${t.status}`));
    const g: Record<string, MktTask[]> = { Overdue: [], Today: [], "This week": [], Later: [], "No date": [] };
    for (const t of open) {
      if (!t.due_date) g["No date"].push(t);
      else if (t.due_date < today) g["Overdue"].push(t);
      else if (t.due_date === today) g["Today"].push(t);
      else if (t.due_date <= weekEnd) g["This week"].push(t);
      else g["Later"].push(t);
    }
    for (const k of Object.keys(g)) {
      g[k].sort(
        (a, b) =>
          (PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9) ||
          (a.due_date ?? "9").localeCompare(b.due_date ?? "9")
      );
    }
    return g;
  }, [tasks, lists, today, weekEnd]);

  if (profileLoading || loading) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-[#5f5f5d] gap-3">
        <RefreshCw className="w-8 h-8 animate-spin" />
        <p className="text-[10px] font-bold uppercase tracking-widest opacity-60">Loading your work…</p>
      </div>
    );
  }

  const total = Object.values(buckets).reduce((n, a) => n + a.length, 0);

  return (
    <div className="space-y-5 max-w-3xl">
      <PageHeader
        title={<span className="flex items-center gap-2"><Sparkles className="w-5 h-5" /> My Work</span>}
        subtitle={`${total} open task${total === 1 ? "" : "s"} assigned to you across all Spaces.`}
      />

      {total === 0 && (
        <div className="bg-white border border-[#eceae4] rounded-2xl p-10 text-center text-[11px] font-bold uppercase tracking-widest text-[#5f5f5d]/50">
          Nothing on your plate
        </div>
      )}

      {(["Overdue", "Today", "This week", "Later", "No date"] as const).map((label) => {
        const items = buckets[label];
        if (items.length === 0) return null;
        return (
          <div key={label}>
            <div className={cn("text-[10px] font-black uppercase tracking-widest mb-2", label === "Overdue" ? "text-rose-500" : "text-[#5f5f5d]/60")}>
              {label} · {items.length}
            </div>
            <div className="bg-white border border-[#eceae4] rounded-2xl divide-y divide-[#eceae4]">
              {items.map((t) => {
                const l = listById.get(t.list_id);
                const col = l?.statuses?.find((s) => s.id === t.status);
                return (
                  <Link
                    key={t.id}
                    href={`/workspace?space=${l?.space_id ?? ""}&list=${t.list_id}&task=${t.id}`}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-[#f7f4ed]"
                  >
                    <span
                      className={cn(
                        "w-2 h-2 rounded-full flex-shrink-0",
                        t.priority === "urgent" ? "bg-rose-500" : t.priority === "high" ? "bg-amber-500" : "bg-slate-300"
                      )}
                    />
                    <span className="text-[13px] font-semibold text-[#1c1c1c] flex-1 truncate">{t.title}</span>
                    <span className="text-[10px] font-bold text-[#5f5f5d]/70 truncate max-w-[120px]">{l?.name ?? "—"}</span>
                    <span className="text-[9px] font-black uppercase tracking-widest text-[#5f5f5d]">{col?.name ?? t.status}</span>
                    {t.due_date && (
                      <span className="text-[10px] font-bold text-[#5f5f5d] w-14 text-right">
                        {new Date(t.due_date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
