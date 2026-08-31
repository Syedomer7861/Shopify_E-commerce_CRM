"use client";
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  format,
  isSameMonth,
  isSameDay,
  addMonths,
  parseISO,
} from "date-fns";
import { cn } from "@/lib/utils";
import type { MktList, MktTask } from "@/types";

const PRIORITY_DOT: Record<string, string> = {
  urgent: "bg-rose-500",
  high: "bg-amber-500",
  normal: "bg-slate-300",
  low: "bg-slate-200",
};

type Props = {
  list: MktList;
  tasks: MktTask[];
  onOpenTask: (id: string) => void;
};

export default function MarketingCalendar({ list, tasks, onOpenTask }: Props) {
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()));

  const days = useMemo(() => {
    const gridStart = startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 });
    const gridEnd = endOfWeek(endOfMonth(cursor), { weekStartsOn: 1 });
    return eachDayOfInterval({ start: gridStart, end: gridEnd });
  }, [cursor]);

  const byDay = useMemo(() => {
    const map = new Map<string, MktTask[]>();
    for (const t of tasks) {
      if (!t.due_date) continue;
      const key = format(parseISO(t.due_date), "yyyy-MM-dd");
      (map.get(key) ?? map.set(key, []).get(key)!).push(t);
    }
    return map;
  }, [tasks]);

  const statusColor = (id: string) => list.statuses.find((s) => s.id === id)?.color ?? "#ccc";

  return (
    <div className="bg-white border border-[#eceae4] rounded-2xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#eceae4]">
        <div className="text-sm font-black uppercase tracking-widest text-[#1c1c1c]">
          {format(cursor, "MMMM yyyy")}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setCursor((c) => addMonths(c, -1))}
            className="w-7 h-7 rounded-lg hover:bg-[#f2efe8] flex items-center justify-center text-[#5f5f5d]"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => setCursor(startOfMonth(new Date()))}
            className="text-[10px] font-black uppercase tracking-widest text-[#5f5f5d] px-2 hover:text-[#1c1c1c]"
          >
            Today
          </button>
          <button
            onClick={() => setCursor((c) => addMonths(c, 1))}
            className="w-7 h-7 rounded-lg hover:bg-[#f2efe8] flex items-center justify-center text-[#5f5f5d]"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
      <div className="min-w-[560px]">
      <div className="grid grid-cols-7 text-[9px] font-black uppercase tracking-widest text-[#5f5f5d]/50 border-b border-[#eceae4]">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <div key={d} className="px-2 py-2 text-center">{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {days.map((day) => {
          const key = format(day, "yyyy-MM-dd");
          const dayTasks = byDay.get(key) ?? [];
          const inMonth = isSameMonth(day, cursor);
          const today = isSameDay(day, new Date());
          return (
            <div
              key={key}
              className={cn(
                "min-h-[104px] border-b border-r border-[#eceae4] p-1.5 space-y-1",
                !inMonth && "bg-[#faf8f3]"
              )}
            >
              <div
                className={cn(
                  "text-[10px] font-bold w-5 h-5 flex items-center justify-center rounded-full",
                  today ? "bg-[#1c1c1c] text-white" : inMonth ? "text-[#1c1c1c]" : "text-[#5f5f5d]/40"
                )}
              >
                {format(day, "d")}
              </div>
              {dayTasks.map((t) => (
                <button
                  key={t.id}
                  onClick={() => onOpenTask(t.id)}
                  className="w-full flex items-center gap-1 text-left px-1.5 py-1 rounded-md bg-[#f7f4ed] hover:bg-[#eceae4] transition-colors"
                >
                  <span className={cn("w-1.5 h-1.5 rounded-full flex-shrink-0", PRIORITY_DOT[t.priority] ?? PRIORITY_DOT.normal)} />
                  <span className="text-[10px] font-semibold text-[#1c1c1c] truncate flex-1">{t.title}</span>
                  <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: statusColor(t.status) }} />
                </button>
              ))}
            </div>
          );
        })}
      </div>
      </div>
      </div>
    </div>
  );
}
