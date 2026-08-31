"use client";
import { useMemo } from "react";
import { cn } from "@/lib/utils";
import type { MktList, MktTask } from "@/types";

type Props = {
  list: MktList;
  tasks: MktTask[];
  onOpenTask: (id: string) => void;
};

const DAY = 86_400_000;
const COL_W = 34; // px per day

const parse = (d?: string | null) => (d ? new Date(`${d}T00:00:00`).getTime() : null);
const short = (ms: number) => new Date(ms).toLocaleDateString("en-IN", { day: "numeric", month: "short" });

// Read-only timeline: one bar per task from start_date → due_date (a single
// day when only one is set). Tasks with neither date are listed as "unscheduled".
// Dependency lines are intentionally left out of this first pass.
export default function MarketingGantt({ list, tasks, onOpenTask }: Props) {
  const model = useMemo(() => {
    const scheduled = tasks
      .map((t) => {
        const s = parse(t.start_date);
        const e = parse(t.due_date);
        if (s == null && e == null) return null;
        const start = s ?? (e as number);
        const end = e ?? (s as number);
        return { task: t, start: Math.min(start, end), end: Math.max(start, end) };
      })
      .filter(Boolean) as { task: MktTask; start: number; end: number }[];

    if (scheduled.length === 0) return null;

    const minMs = Math.min(...scheduled.map((x) => x.start)) - 2 * DAY;
    const maxMs = Math.max(...scheduled.map((x) => x.end)) + 2 * DAY;
    const days = Math.max(1, Math.round((maxMs - minMs) / DAY));
    scheduled.sort((a, b) => a.start - b.start || a.end - b.end);

    // Weekly tick marks.
    const ticks: { left: number; label: string }[] = [];
    for (let i = 0; i <= days; i += 7) {
      ticks.push({ left: i * COL_W, label: short(minMs + i * DAY) });
    }

    const todayLeft = ((Date.now() - minMs) / DAY) * COL_W;

    return { scheduled, minMs, days, ticks, todayLeft, width: days * COL_W };
  }, [tasks]);

  const unscheduled = tasks.filter((t) => !t.start_date && !t.due_date);
  const statusColor = (id: string) => list.statuses.find((s) => s.id === id)?.color ?? "#9c9a94";

  if (!model) {
    return (
      <div className="bg-white border border-[#eceae4] rounded-2xl p-10 text-center text-[11px] font-bold uppercase tracking-widest text-[#5f5f5d]/50">
        No tasks with a start or due date
      </div>
    );
  }

  return (
    <div className="bg-white border border-[#eceae4] rounded-2xl overflow-hidden">
      <div className="overflow-x-auto">
        <div style={{ width: model.width + 220 }}>
          {/* Header */}
          <div className="flex border-b border-[#eceae4] bg-[#faf9f6] sticky top-0">
            <div className="w-[220px] flex-shrink-0 px-3 py-2 text-[9px] font-black uppercase tracking-widest text-[#5f5f5d]/50">
              Task
            </div>
            <div className="relative flex-1" style={{ height: 28 }}>
              {model.ticks.map((tk, i) => (
                <div key={i} className="absolute top-0 h-full border-l border-[#eceae4] pl-1 text-[9px] font-bold text-[#5f5f5d]/60" style={{ left: tk.left }}>
                  {tk.label}
                </div>
              ))}
            </div>
          </div>

          {/* Rows */}
          <div className="relative">
            {model.todayLeft >= 0 && model.todayLeft <= model.width && (
              <div className="absolute top-0 bottom-0 w-px bg-rose-400 z-10" style={{ left: 220 + model.todayLeft }} />
            )}
            {model.scheduled.map(({ task, start, end }) => {
              const left = ((start - model.minMs) / DAY) * COL_W;
              const width = Math.max(COL_W * 0.7, ((end - start) / DAY + 1) * COL_W);
              return (
                <div key={task.id} className="flex items-center border-b border-[#f2efe8] hover:bg-[#f7f4ed]">
                  <button
                    onClick={() => onOpenTask(task.id)}
                    className="w-[220px] flex-shrink-0 px-3 py-2 text-left text-[12px] font-semibold text-[#1c1c1c] truncate"
                  >
                    {task.title}
                  </button>
                  <div className="relative flex-1" style={{ height: 32 }}>
                    <button
                      onClick={() => onOpenTask(task.id)}
                      title={`${short(start)} → ${short(end)}`}
                      className={cn(
                        "absolute top-1/2 -translate-y-1/2 h-4 rounded-md",
                        (task.priority === "urgent" || task.priority === "high") && "ring-1 ring-rose-400"
                      )}
                      style={{ left, width, backgroundColor: statusColor(task.status) }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {unscheduled.length > 0 && (
        <div className="border-t border-[#eceae4] px-3 py-2.5 flex flex-wrap gap-1.5">
          <span className="text-[9px] font-black uppercase tracking-widest text-[#5f5f5d]/50 mr-1 py-1">Unscheduled</span>
          {unscheduled.map((t) => (
            <button
              key={t.id}
              onClick={() => onOpenTask(t.id)}
              className="text-[10px] font-bold px-2 py-1 rounded-lg bg-[#f7f4ed] border border-[#eceae4] text-[#5f5f5d]"
            >
              {t.title}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
