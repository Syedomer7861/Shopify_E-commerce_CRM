"use client";
import { useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Cell } from "recharts";
import { cn } from "@/lib/utils";
import type { MktList, MktTask, Profile } from "@/types";

type Props = {
  lists: MktList[];
  tasks: MktTask[]; // cross-list, top-level
  members: Profile[];
};

const TYPE_COLOR: Record<string, string> = {
  not_started: "#8b8b8b",
  active: "#3b82f6",
  done: "#10b981",
};

export default function MarketingDashboard({ lists, tasks, members }: Props) {
  const typeOf = useMemo(() => {
    const m = new Map<string, string>(); // `${listId}:${statusId}` -> type
    for (const l of lists) for (const s of l.statuses) m.set(`${l.id}:${s.id}`, s.type);
    return m;
  }, [lists]);

  const today = new Date().toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() - 7 * 864e5).toISOString();

  const isDone = (t: MktTask) => typeOf.get(`${t.list_id}:${t.status}`) === "done";

  const stats = useMemo(() => {
    const open = tasks.filter((t) => !isDone(t));
    return {
      open: open.length,
      overdue: open.filter((t) => t.due_date && t.due_date < today).length,
      unassigned: open.filter((t) => !t.assignees?.length).length,
      doneThisWeek: tasks.filter((t) => t.completed_at && t.completed_at >= weekAgo).length,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, typeOf]);

  const byAssignee = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const t of tasks) {
      if (isDone(t)) continue;
      if (!t.assignees?.length) {
        counts.__unassigned = (counts.__unassigned ?? 0) + 1;
        continue;
      }
      for (const a of t.assignees) counts[a] = (counts[a] ?? 0) + 1;
    }
    return Object.entries(counts)
      .map(([id, value]) => ({
        name: id === "__unassigned" ? "Unassigned" : members.find((m) => m.id === id)?.name || members.find((m) => m.id === id)?.email || "?",
        value,
      }))
      .sort((a, b) => b.value - a.value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, members, typeOf]);

  const byType = useMemo(() => {
    const counts: Record<string, number> = { not_started: 0, active: 0, done: 0 };
    for (const t of tasks) {
      const ty = typeOf.get(`${t.list_id}:${t.status}`) ?? "active";
      counts[ty] = (counts[ty] ?? 0) + 1;
    }
    return [
      { name: "Not started", key: "not_started", value: counts.not_started },
      { name: "Active", key: "active", value: counts.active },
      { name: "Done", key: "done", value: counts.done },
    ];
  }, [tasks, typeOf]);

  const tiles = [
    { label: "Open tasks", value: stats.open },
    { label: "Overdue", value: stats.overdue, alert: stats.overdue > 0 },
    { label: "Unassigned", value: stats.unassigned, alert: stats.unassigned > 0 },
    { label: "Done this week", value: stats.doneThisWeek },
  ];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {tiles.map((t) => (
          <div key={t.label} className="bg-white border border-[#eceae4] rounded-2xl p-4">
            <div className="text-[10px] font-black uppercase tracking-widest text-[#5f5f5d]/60">{t.label}</div>
            <div className={cn("text-3xl font-black mt-1", t.alert ? "text-rose-500" : "text-[#1c1c1c]")}>{t.value}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-white border border-[#eceae4] rounded-2xl p-4">
          <div className="text-[10px] font-black uppercase tracking-widest text-[#5f5f5d]/60 mb-3">Open tasks by assignee</div>
          {byAssignee.length === 0 ? (
            <p className="text-[11px] font-bold uppercase tracking-widest text-[#5f5f5d]/40 py-8 text-center">No open tasks</p>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(120, byAssignee.length * 36)}>
              <BarChart data={byAssignee} layout="vertical" margin={{ left: 8, right: 16 }}>
                <XAxis type="number" allowDecimals={false} hide />
                <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 11, fontWeight: 600 }} axisLine={false} tickLine={false} />
                <Tooltip cursor={{ fill: "#f2efe8" }} />
                <Bar dataKey="value" fill="#1c1c1c" radius={[0, 4, 4, 0]} barSize={16} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="bg-white border border-[#eceae4] rounded-2xl p-4">
          <div className="text-[10px] font-black uppercase tracking-widest text-[#5f5f5d]/60 mb-3">All tasks by stage</div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={byType} margin={{ left: -20, right: 8 }}>
              <XAxis dataKey="name" tick={{ fontSize: 11, fontWeight: 600 }} axisLine={false} tickLine={false} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip cursor={{ fill: "#f2efe8" }} />
              <Bar dataKey="value" radius={[4, 4, 0, 0]} barSize={48}>
                {byType.map((d) => (
                  <Cell key={d.key} fill={TYPE_COLOR[d.key]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
