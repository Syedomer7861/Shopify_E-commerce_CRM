"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckSquare, Clock, AlertTriangle } from "lucide-react";
import { marketingApi } from "@/lib/marketing-client";
import { EmptyState } from "@/components/ui";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase";
import toast from "react-hot-toast";
import type { MktTask, MktList } from "@/types";

const PRIORITY_STYLE: Record<string, string> = {
  urgent: "bg-rose-50 text-rose-700 border-rose-200",
  high: "bg-amber-50 text-amber-700 border-amber-200",
  normal: "bg-gray-50 text-gray-600 border-gray-200",
  low: "bg-blue-50 text-blue-600 border-blue-200",
};

function formatDue(due?: string | null) {
  if (!due) return null;
  const date = new Date(due + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.round((date.getTime() - today.getTime()) / 86400000);
  if (diffDays < 0) return { label: `${Math.abs(diffDays)}d overdue`, overdue: true };
  if (diffDays === 0) return { label: "Due today", overdue: false };
  if (diffDays === 1) return { label: "Due tomorrow", overdue: false };
  return { label: date.toLocaleDateString(undefined, { month: "short", day: "numeric" }), overdue: false };
}

/**
 * Work assigned to the current user across every Workspace Space they're a
 * member of - not personal My Hub todos, which are a separate, private
 * table. `compact` shows the top 5 (due-soonest, non-done) for a dashboard
 * card; the full view is My Hub's "Assigned Tasks" tab. Opening a task
 * deep-links into the real Workspace task panel (status/comments/time) -
 * reused rather than rebuilt here.
 */
export function AssignedTasksPanel({ userId, compact = false }: { userId?: string; compact?: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState<MktTask[]>([]);
  const [lists, setLists] = useState<MktList[]>([]);
  const [forbidden, setForbidden] = useState(false);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    (async () => {
      setLoading(true);
      setForbidden(false);
      try {
        const [taskData, listData] = await Promise.all([
          marketingApi.listTasks({ assignee: userId }),
          marketingApi.listLists(),
        ]);
        if (!active) return;
        setTasks(taskData);
        setLists(listData);
      } catch (e: any) {
        if (!active) return;
        // Not a member of any Space yet - a real empty state, not an error.
        if (String(e?.message || "").toLowerCase().includes("forbidden")) setForbidden(true);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [userId]);

  const listById = useMemo(() => new Map(lists.map(l => [l.id, l])), [lists]);

  const openTasks = useMemo(() => {
    return tasks
      .filter(t => {
        const list = listById.get(t.list_id);
        const doneStatus = list?.statuses?.find(s => s.type === "done");
        return !doneStatus || t.status !== doneStatus.id;
      })
      .sort((a, b) => (a.due_date || "9999").localeCompare(b.due_date || "9999"));
  }, [tasks, listById]);

  const visible = compact ? openTasks.slice(0, 5) : openTasks;

  // Opens a row in the approvals inbox (20261111d). The DB routes it to the
  // task's reviewer, else the sender's manager, and stamps the task pending.
  async function sendForReview(t: MktTask) {
    const { error } = await createClient().from("approvals").insert({ entity_type: "task", entity_id: t.id, title: `Review: ${t.title}` });
    if (error) return toast.error(error.code === "23505" ? "Already waiting for review" : error.message);
    toast.success("Sent for review");
    setTasks(prev => prev.map(x => x.id === t.id ? { ...x, approval_status: "pending" } : x));
  }

  function openTask(t: MktTask) {
    const list = listById.get(t.list_id);
    router.push(`/workspace?space=${list?.space_id || ""}&list=${t.list_id}&task=${t.id}`);
  }

  if (loading) {
    return <div className="py-8 text-center text-xs text-gray-400">Loading assigned work...</div>;
  }

  if (forbidden || visible.length === 0) {
    return (
      <EmptyState
        icon={<CheckSquare className="w-5 h-5" />}
        title="No assigned tasks"
        desc={forbidden ? "You haven't been added to a Workspace yet - a manager assigns tasks from there." : "Nothing on your plate right now."}
      />
    );
  }

  return (
    <div className="space-y-2.5">
      {visible.map(t => {
        const list = listById.get(t.list_id);
        const statusDef = list?.statuses?.find(s => s.id === t.status);
        const due = formatDue(t.due_date);
        const review = t.approval_status;
        return (
          <div key={t.id}>
          <button
            onClick={() => openTask(t)}
            className="w-full text-left p-3.5 rounded-xl border border-[#eceae4] bg-white hover:border-[#1c1c1c]/20 transition-colors"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-bold text-[#1c1c1c] truncate">{t.title}</div>
                {!compact && t.description && (
                  <p className="text-xs text-[#5f5f5d] mt-1 line-clamp-2">{t.description}</p>
                )}
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  <span className="text-[9px] font-bold uppercase tracking-widest text-gray-400">
                    {list?.name || "Workspace"} &middot; {statusDef?.name || t.status}
                  </span>
                  {due && (
                    <span className={cn(
                      "inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded",
                      due.overdue ? "bg-rose-50 text-rose-600" : "bg-gray-50 text-gray-500"
                    )}>
                      {due.overdue ? <AlertTriangle className="w-2.5 h-2.5" /> : <Clock className="w-2.5 h-2.5" />}
                      {due.label}
                    </span>
                  )}
                </div>
              </div>
              <span className={cn("shrink-0 text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-full border", PRIORITY_STYLE[t.priority] || PRIORITY_STYLE.normal)}>
                {t.priority}
              </span>
            </div>
          </button>
          {!compact && (
            <div className="flex justify-end px-1 pt-1">
              {review ? (
                <span className={cn("text-[9px] font-black uppercase tracking-widest", review === "approved" ? "text-emerald-600" : review === "rejected" ? "text-rose-600" : "text-amber-600")}>Review {review}</span>
              ) : (
                <button onClick={() => sendForReview(t)} className="text-[10px] font-bold text-[#5f5f5d] underline hover:text-[#1c1c1c]">Send for review</button>
              )}
            </div>
          )}
          </div>
        );
      })}
    </div>
  );
}
