"use client";
import { useState, useEffect } from "react";
import { 
  ChevronLeft, ChevronRight, Calendar as CalIcon, 
  CheckCircle2, Clock, AlertCircle, Loader2
} from "lucide-react";
import { format, addMonths, subMonths, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, addDays, startOfWeek, endOfWeek } from "date-fns";
import { createClient } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/ui";

export default function CalendarPage() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    fetchTasks();
  }, [currentDate]);

  async function fetchTasks() {
    setLoading(true);
    const start = startOfWeek(startOfMonth(currentDate)).toISOString().split("T")[0];
    const end = endOfWeek(endOfMonth(currentDate)).toISOString().split("T")[0];

    const { data } = await supabase
      .from("tasks")
      .select("*, customer:customers(name, phone)")
      .gte("due_date", start)
      .lte("due_date", end)
      .neq("status", "cancelled");

    setTasks(data || []);
    setLoading(false);
  }

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const startDate = startOfWeek(monthStart);
  const endDate = endOfWeek(monthEnd);
  const calendarDays = eachDayOfInterval({ start: startDate, end: endDate });

  return (
    <div className="flex flex-col h-screen max-h-[calc(100vh-2rem)] overflow-hidden">
      <PageHeader
        title="Orchestration Calendar"
        subtitle="Manage your follow-up capacity visually"
        actions={
          <div className="flex items-center gap-4 bg-white/50 p-1.5 rounded-xl border border-gray-100 shadow-sm">
            <button onClick={() => setCurrentDate(subMonths(currentDate, 1))} className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-[#2D1E6F]">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm font-bold text-[#2D1E6F] min-w-[120px] text-center">
              {format(currentDate, "MMMM yyyy")}
            </span>
            <button onClick={() => setCurrentDate(addMonths(currentDate, 1))} className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-[#2D1E6F]">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        }
      />

      <div className="flex-1 bg-white rounded-2xl border border-gray-100 shadow-xl overflow-hidden flex flex-col mb-4">
        {/* Days Header */}
        <div className="grid grid-cols-7 border-b border-gray-100 bg-gray-50/50">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(d => (
            <div key={d} className="py-3 text-center text-[10px] font-black uppercase tracking-widest text-gray-400">
              {d}
            </div>
          ))}
        </div>

        {/* Calendar Grid */}
        <div className="flex-1 overflow-y-auto grid grid-cols-7 auto-rows-fr">
          {calendarDays.map((day, i) => {
            const dayTasks = tasks.filter(t => isSameDay(new Date(t.due_date), day));
            const isToday = isSameDay(day, new Date());
            const isCurrentMonth = isSameMonth(day, monthStart);

            return (
              <div 
                key={day.toString()} 
                className={cn(
                  "min-h-[120px] border-r border-b border-gray-100 p-2 flex flex-col gap-1 transition-colors hover:bg-blue-50/10",
                  !isCurrentMonth && "bg-gray-50/20 opacity-40",
                  (i + 1) % 7 === 0 && "border-r-0"
                )}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className={cn(
                    "text-[11px] font-bold w-6 h-6 flex items-center justify-center rounded-full transition-all",
                    isToday ? "bg-[#2D1E6F] text-white" : "text-gray-400"
                  )}>
                    {format(day, "d")}
                  </span>
                  {dayTasks.length > 0 && (
                    <span className="text-[10px] font-black text-[#2D1E6F]/60">
                      {dayTasks.length} {dayTasks.length === 1 ? "task" : "tasks"}
                    </span>
                  )}
                </div>

                <div className="flex-1 flex flex-col gap-1 overflow-y-auto pr-1 no-scrollbar">
                  {dayTasks.slice(0, 4).map(task => (
                    <div 
                      key={task.id}
                      className={cn(
                        "px-1.5 py-1 rounded-md text-[9px] font-semibold truncate flex items-center gap-1.5",
                        task.status === "done" ? "bg-blue-50 text-blue-700 opacity-60" :
                        task.task_type === "recovery" ? "bg-blue-50 text-blue-700" :
                        task.task_type === "issue_resolution" ? "bg-rose-50 text-rose-700" :
                        "bg-gray-50 text-gray-700"
                      )}
                    >
                      <div className={cn(
                        "w-1.5 h-1.5 rounded-full flex-shrink-0",
                        task.priority_score > 100 ? "bg-rose-500 animate-pulse" : 
                        task.status === "done" ? "bg-blue-500" : "bg-[#2D1E6F]/40"
                      )} />
                      {task.customer?.name}
                    </div>
                  ))}
                  {dayTasks.length > 4 && (
                    <div className="text-[8px] font-bold text-gray-300 text-center py-1">
                      + {dayTasks.length - 4} more
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
