"use client";
import { useState, useEffect, useCallback } from "react";
import { isDemoMode } from "@/lib/demo";
import {
  ChevronLeft, ChevronRight, CalendarDays, LayoutGrid,
  CheckCircle2, Clock, AlertTriangle, RefreshCw, X,
  Phone, MessageSquare, Zap, User
} from "lucide-react";
import {
  format, addMonths, subMonths, startOfMonth, endOfMonth,
  eachDayOfInterval, isSameMonth, addDays, startOfWeek, endOfWeek,
  isToday as isTodayFn, parseISO, isSameDay, addWeeks, subWeeks,
  startOfWeek as startOfWeekFn, endOfWeek as endOfWeekFn,
  eachHourOfInterval, setHours, setMinutes
} from "date-fns";
import { createClient } from "@/lib/supabase";
import { cn, TASK_TYPE_CONFIG } from "@/lib/utils";
import { PageHeader } from "@/components/ui";
import Link from "next/link";
import ClickToCallModal from "@/components/ClickToCallModal";
import { useCurrentProfile } from "@/hooks/useCurrentProfile";

// ─── task type colour config ──────────────────────────────────────────────────
// Was its own hand-picked map covering 6 of the app's 13 real task types -
// welcome_call/vip_followup/win_back/cod_verify/ndr/manager_audit all fell
// through to plain gray with no filter chip, on a calendar whose whole
// point is "click any day to drill down". Reuse the canonical map from
// lib/utils (same one TaskTypeBadge uses) instead of maintaining a second,
// incomplete one; derive a solid dot color from its border-l-* accent so
// there's only one place task-type colors are ever defined.
const TYPE_COLORS: Record<string, { bg: string; dot: string; label: string }> = Object.fromEntries(
  Object.entries(TASK_TYPE_CONFIG).map(([key, cfg]) => [
    key,
    { bg: `${cfg.bg} ${cfg.color}`, dot: cfg.accent.replace("border-l-", "bg-"), label: cfg.label },
  ])
);
TYPE_COLORS.done = { bg: "bg-gray-100 text-gray-500", dot: "bg-gray-400", label: "Done" };

const getTaskColor = (task: any) => {
  if (task.status === "done") return TYPE_COLORS.done;
  return TYPE_COLORS[task.task_type] || { bg: "bg-gray-100 text-gray-600", dot: "bg-gray-400", label: task.task_type };
};

// ─── safe date parse (fixes UTC→IST shift bug) ───────────────────────────────
const parseLocalDate = (dateStr: string): Date => {
  // "2026-05-01" → parse as local date (NOT UTC) to avoid IST -1day shift
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
};

type ViewMode = "month" | "week";

export default function CalendarPage() {
  const [currentDate, setCurrentDate]   = useState(new Date());
  const [tasks, setTasks]               = useState<any[]>([]);
  const [loading, setLoading]           = useState(true);
  const [view, setView]                 = useState<ViewMode>("month");
  const [selectedDay, setSelectedDay]   = useState<Date | null>(null);
  const [typeFilter, setTypeFilter]     = useState<string>("all");
  const [showClickToCall, setShowClickToCall] = useState(false);
  const [activeTaskForCall, setActiveTaskForCall] = useState<any>(null);
  const supabase = createClient();
  const { profile } = useCurrentProfile();

  // Same scoping Dashboard/Tasks apply - without it every agent saw every
  // other agent's assigned tasks, with real customer names/phones and
  // direct Call/WhatsApp buttons to contact customers not assigned to them.
  const applyAgentFilters = useCallback((query: any) => {
    if (profile?.role !== "agent") return query;
    const segs = profile.assigned_segments || [];
    const types = profile.assigned_task_types || [];
    let q = query.or(`assigned_to.eq.${profile.id},assigned_to.is.null`);
    if (segs.length > 0) q = q.filter("customer.segment", "in", `(${segs.join(",")})`);
    if (types.length > 0) q = q.in("task_type", types);
    return q;
  }, [profile]);

  // ── fetch window ─────────────────────────────────────────────────────────────
  const getWindow = useCallback(() => {
    if (view === "month") {
      return {
        start: format(startOfWeek(startOfMonth(currentDate)), "yyyy-MM-dd"),
        end:   format(endOfWeek(endOfMonth(currentDate)),     "yyyy-MM-dd"),
      };
    }
    return {
      start: format(startOfWeekFn(currentDate), "yyyy-MM-dd"),
      end:   format(endOfWeekFn(currentDate),   "yyyy-MM-dd"),
    };
  }, [currentDate, view]);

  const fetchTasks = useCallback(async (silent = false) => {
    const isDemo = isDemoMode();
    if (isDemo) {
      if (!silent) setLoading(true);
      const { MOCK_TASKS } = await import("@/lib/mockData");
      const { start, end } = getWindow();
      
      // Filter mock tasks to fit the current view range
      const filtered = MOCK_TASKS.filter(t => {
        const d = t.due_date;
        return d >= start && d <= end;
      });
      
      setTasks(filtered as any);
      setLoading(false);
      return;
    }

    if (!silent) setLoading(true);
    const { start, end } = getWindow();
    // PostgREST caps a single select at 1000 rows. A busy month can
    // genuinely exceed that (one day alone has shown 290+ tasks), and since
    // the query orders by priority_score DESC, a truncated fetch would
    // silently drop lower-priority tasks scattered across days - corrupting
    // both the day-cell counts and the heat map with no visible sign of it.
    // Page through with .range() so a month view always has every task.
    const PAGE = 1000;
    let allTasks: any[] = [];
    for (let from = 0; ; from += PAGE) {
      let query = supabase
        .from("tasks")
        .select("id, due_date, status, task_type, priority_score, assigned_to, customer:customers!inner(id, name, phone, segment)")
        .gte("due_date", start)
        .lte("due_date", end)
        .not("status", "in", '("cancelled","skipped")');
      query = applyAgentFilters(query);
      const { data } = await query
        .order("priority_score", { ascending: false })
        .range(from, from + PAGE - 1);
      if (!data || data.length === 0) break;
      allTasks = allTasks.concat(data);
      if (data.length < PAGE) break;
    }
    setTasks(allTasks);
    setLoading(false);
  }, [getWindow, supabase, applyAgentFilters]);

  useEffect(() => {
    fetchTasks();
  }, [currentDate, view, fetchTasks]);

  // ── Supabase real-time ────────────────────────────────────────────────────────
  useEffect(() => {
    const channel = supabase
      .channel("calendar-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" },
        () => fetchTasks(true))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [supabase, fetchTasks]);

  // ── filtered tasks ────────────────────────────────────────────────────────────
  const filteredTasks = typeFilter === "all"
    ? tasks
    : typeFilter === "done"
      ? tasks.filter(t => t.status === "done")
      : tasks.filter(t => t.task_type === typeFilter && t.status !== "done");

  // ── navigation ────────────────────────────────────────────────────────────────
  const prev = () => view === "month"
    ? setCurrentDate(subMonths(currentDate, 1))
    : setCurrentDate(subWeeks(currentDate, 1));

  const next = () => view === "month"
    ? setCurrentDate(addMonths(currentDate, 1))
    : setCurrentDate(addWeeks(currentDate, 1));

  // ── calendar grid ─────────────────────────────────────────────────────────────
  const monthStart  = startOfMonth(currentDate);
  const calDays     = view === "month"
    ? eachDayOfInterval({ start: startOfWeek(monthStart), end: endOfWeek(endOfMonth(currentDate)) })
    : eachDayOfInterval({ start: startOfWeekFn(currentDate), end: endOfWeekFn(currentDate) });

  const tasksOnDay = (day: Date) =>
    filteredTasks.filter(t => isSameDay(parseLocalDate(t.due_date), day));

  // ── heat-map shade ────────────────────────────────────────────────────────────
  const maxCount = Math.max(1, ...calDays.map(d => tasksOnDay(d).length));
  const heatBg = (count: number) => {
    const pct = count / maxCount;
    if (pct === 0)   return "";
    if (pct < 0.25)  return "bg-violet-50";
    if (pct < 0.5)   return "bg-violet-100";
    if (pct < 0.75)  return "bg-violet-200";
    return "bg-violet-300";
  };

  const selectedDayTasks = selectedDay ? tasksOnDay(selectedDay) : [];
  const headerLabel = view === "month"
    ? format(currentDate, "MMMM yyyy")
    : `${format(startOfWeekFn(currentDate), "d MMM")} – ${format(endOfWeekFn(currentDate), "d MMM yyyy")}`;

  return (
    <div className="flex flex-col h-[calc(100vh-2rem)] overflow-hidden animate-fade-in">
      <PageHeader
        title="Orchestration Calendar"
        subtitle="Live task schedule — click any day to drill down"
        actions={
          <div className="flex items-center gap-2">
            {/* Today button */}
            <button
              onClick={() => { setCurrentDate(new Date()); setSelectedDay(new Date()); }}
              className="btn-secondary text-xs py-1.5 px-3"
            >
              Today
            </button>

            {/* View toggle */}
            <div className="flex items-center bg-[#eceae4]/40 rounded-xl border border-[#eceae4] p-1">
              <button
                onClick={() => setView("month")}
                className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all",
                  view === "month" ? "bg-[#1c1c1c] text-white shadow" : "text-[#5f5f5d]")}
              >
                <LayoutGrid className="w-3 h-3" /> Month
              </button>
              <button
                onClick={() => setView("week")}
                className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all",
                  view === "week" ? "bg-[#1c1c1c] text-white shadow" : "text-[#5f5f5d]")}
              >
                <CalendarDays className="w-3 h-3" /> Week
              </button>
            </div>

            {/* Navigation */}
            <div className="flex items-center gap-1 bg-white/60 rounded-xl border border-gray-100 shadow-sm p-1">
              <button onClick={prev} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-sm font-bold text-[#1c1c1c] min-w-[160px] text-center">{headerLabel}</span>
              <button onClick={next} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <button onClick={() => fetchTasks()} className="p-2 hover:bg-gray-100 rounded-xl border border-gray-100 transition-colors">
              <RefreshCw className={cn("w-4 h-4 text-gray-400", loading && "animate-spin")} />
            </button>
          </div>
        }
      />

      {/* ── Type filter legend ───────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <button
          onClick={() => setTypeFilter("all")}
          className={cn("px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest border transition-all",
            typeFilter === "all" ? "bg-[#1c1c1c] text-white border-[#1c1c1c]" : "bg-white text-gray-500 border-gray-200")}
        >
          All Types
        </button>
        {Object.entries(TYPE_COLORS).map(([key, cfg]) => (
          <button
            key={key}
            onClick={() => setTypeFilter(key)}
            className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold border transition-all",
              typeFilter === key ? `${cfg.bg} border-transparent shadow` : "bg-white text-gray-500 border-gray-200")}
          >
            <span className={cn("w-2 h-2 rounded-full", cfg.dot)} />
            {cfg.label}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-1.5 text-[10px] text-gray-400 font-bold">
          <span className="w-2 h-2 rounded-sm bg-violet-100 border border-violet-200" />
          Low
          <span className="w-2 h-2 rounded-sm bg-violet-200 border border-violet-300" />
          Med
          <span className="w-2 h-2 rounded-sm bg-violet-300 border border-violet-400" />
          High
          <span className="ml-1 opacity-60">Heat map</span>
        </div>
      </div>

      <div className="flex-1 flex gap-4 overflow-hidden min-h-0">
        {/* ── Main calendar ────────────────────────────────────────────────────── */}
        <div className={cn("flex flex-col bg-white rounded-2xl border border-gray-100 shadow-xl overflow-hidden transition-all duration-300",
          selectedDay ? "flex-[3]" : "flex-1")}>

          {/* Day headers */}
          <div className="grid grid-cols-7 border-b border-gray-100 bg-gray-50/50 flex-shrink-0">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(d => (
              <div key={d} className="py-2.5 text-center text-[10px] font-black uppercase tracking-widest text-gray-400">{d}</div>
            ))}
          </div>

          {/* Grid */}
          <div className={cn("flex-1 overflow-y-auto grid grid-cols-7",
            view === "month" ? "auto-rows-fr" : "")}>
            {calDays.map((day, i) => {
              const dayTasks   = tasksOnDay(day);
              const isToday    = isTodayFn(day);
              const inMonth    = isSameMonth(day, monthStart);
              const isSelected = selectedDay ? isSameDay(day, selectedDay) : false;
              const heat       = heatBg(dayTasks.length);
              const overdue    = dayTasks.filter(t => t.status !== "done" && parseLocalDate(t.due_date) < new Date()).length;

              return (
                <div
                  key={day.toString()}
                  onClick={() => setSelectedDay(isSelected ? null : day)}
                  className={cn(
                    "min-h-[100px] border-r border-b border-[#eceae4] p-1.5 flex flex-col gap-0.5 cursor-pointer transition-all duration-150 group",
                    !inMonth && "opacity-30",
                    (i + 1) % 7 === 0 && "border-r-0",
                    isSelected ? "ring-2 ring-inset ring-[#1c1c1c] bg-[#1c1c1c]/5" : `hover:bg-[#eceae4]/20 ${heat}`,
                  )}
                >
                  <div className="flex items-center justify-between mb-0.5">
                    <span className={cn(
                      "text-[11px] font-bold w-6 h-6 flex items-center justify-center rounded-full transition-all",
                      isToday ? "bg-[#1c1c1c] text-white" : isSelected ? "bg-[#1c1c1c]/20 text-[#1c1c1c]" : "text-gray-400"
                    )}>
                      {format(day, "d")}
                    </span>
                    <div className="flex items-center gap-1">
                      {overdue > 0 && (
                        <span className="text-[8px] font-black text-rose-500 bg-rose-50 px-1 rounded">
                          {overdue}⚠
                        </span>
                      )}
                      {dayTasks.length > 0 && (
                        <span className="text-[9px] font-bold text-[#1c1c1c]/40">
                          {dayTasks.length}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex-1 flex flex-col gap-0.5 overflow-hidden">
                    {dayTasks.slice(0, view === "week" ? 8 : 3).map(task => {
                      const c = getTaskColor(task);
                      return (
                        <div
                          key={task.id}
                          className={cn("px-1.5 py-0.5 rounded text-[8px] font-semibold truncate flex items-center gap-1", c.bg)}
                        >
                          <span className={cn("w-1 h-1 rounded-full flex-shrink-0", c.dot)} />
                          {task.customer?.name || "Unknown"}
                        </div>
                      );
                    })}
                    {dayTasks.length > (view === "week" ? 8 : 3) && (
                      <div className="text-[8px] font-bold text-gray-300 text-center">
                        +{dayTasks.length - (view === "week" ? 8 : 3)} more
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Day detail panel ──────────────────────────────────────────────────── */}
        {selectedDay && (
          <div className="w-[340px] flex-shrink-0 bg-white rounded-2xl border border-gray-100 shadow-xl overflow-hidden flex flex-col animate-in slide-in-from-right-4 duration-300">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50/50 flex-shrink-0">
              <div>
                <div className="text-xs font-black text-[#1c1c1c]">
                  {format(selectedDay, "EEEE, d MMMM")}
                </div>
                <div className="text-[10px] text-gray-400 font-medium mt-0.5">
                  {selectedDayTasks.length} task{selectedDayTasks.length !== 1 ? "s" : ""}
                  {selectedDayTasks.filter(t => t.status === "done").length > 0 &&
                    ` · ${selectedDayTasks.filter(t => t.status === "done").length} done`}
                </div>
              </div>
              <button
                onClick={() => setSelectedDay(null)}
                className="w-7 h-7 rounded-lg hover:bg-gray-100 flex items-center justify-center text-gray-400 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-[#eceae4]/60">
              {selectedDayTasks.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full gap-3 py-16 text-center px-4">
                  <CalendarDays className="w-10 h-10 text-gray-200" />
                  <p className="text-xs font-bold text-gray-400">No tasks on this day</p>
                  <p className="text-[10px] text-gray-300">Tasks due on {format(selectedDay, "d MMMM")} will appear here</p>
                </div>
              ) : (
                selectedDayTasks.map(task => {
                  const c = getTaskColor(task);
                  const isOverdue = task.status !== "done" && parseLocalDate(task.due_date) < new Date() && !isTodayFn(parseLocalDate(task.due_date));
                  return (
                    <div key={task.id} className="px-4 py-3 hover:bg-gray-50/50 transition-colors group">
                      <div className="flex items-start gap-2.5">
                        <div className={cn("w-2 h-2 rounded-full mt-1.5 flex-shrink-0", c.dot,
                          task.priority_score > 100 && "animate-pulse")} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-1">
                            <span className="text-[11px] font-black text-[#1c1c1c] truncate">
                              {task.customer?.name || "Unknown"}
                            </span>
                            {task.status === "done" ? (
                              <CheckCircle2 className="w-3 h-3 text-emerald-500 flex-shrink-0" />
                            ) : isOverdue ? (
                              <AlertTriangle className="w-3 h-3 text-rose-500 flex-shrink-0" />
                            ) : (
                              <Clock className="w-3 h-3 text-amber-400 flex-shrink-0" />
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 mt-1">
                            <span className={cn("px-1.5 py-0.5 rounded text-[9px] font-bold", c.bg)}>{c.label}</span>
                            {task.customer?.phone && (
                              <span className="text-[9px] text-gray-400 font-medium">{task.customer.phone}</span>
                            )}
                          </div>
                          {task.priority_score > 0 && (
                            <div className="mt-1.5 flex items-center gap-1">
                              <Zap className="w-2.5 h-2.5 text-amber-400" />
                              <span className="text-[9px] text-gray-400 font-bold">Priority {task.priority_score}</span>
                            </div>
                          )}
                        </div>
                      </div>
                      {/* Quick actions */}
                      <div className="flex items-center gap-1.5 mt-2.5 pl-4 opacity-0 group-hover:opacity-100 transition-opacity">
                        {task.customer?.phone && (
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setActiveTaskForCall(task);
                              setShowClickToCall(true);
                            }}
                            className="flex items-center gap-1 px-2 py-1 rounded-lg bg-[#eceae4]/60 text-[#1c1c1c] text-[9px] font-bold hover:bg-[#1c1c1c] hover:text-white transition-all"
                          >
                            <Phone className="w-2.5 h-2.5" /> Call
                          </button>
                        )}
                        {task.customer?.phone && (
                          <a href={`https://wa.me/${task.customer.phone.replace(/\D/g, "")}`} target="_blank"
                            className="flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-50 text-emerald-700 text-[9px] font-bold hover:bg-emerald-600 hover:text-white transition-all">
                            <MessageSquare className="w-2.5 h-2.5" /> WA
                          </a>
                        )}
                        <Link href={`/tasks?id=${task.id}`}
                          className="flex items-center gap-1 px-2 py-1 rounded-lg bg-blue-50 text-blue-700 text-[9px] font-bold hover:bg-blue-600 hover:text-white transition-all">
                          <User className="w-2.5 h-2.5" /> View Task
                        </Link>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Day summary footer */}
            {selectedDayTasks.length > 0 && (
              <div className="border-t border-gray-100 px-4 py-2.5 bg-gray-50/50 flex-shrink-0">
                <div className="grid grid-cols-3 gap-2 text-center">
                  {[
                    { label: "Pending", count: selectedDayTasks.filter(t => t.status !== "done").length, color: "text-amber-600" },
                    { label: "Done", count: selectedDayTasks.filter(t => t.status === "done").length, color: "text-emerald-600" },
                    { label: "Critical", count: selectedDayTasks.filter(t => t.priority_score > 100).length, color: "text-rose-600" },
                  ].map(s => (
                    <div key={s.label} className="flex flex-col">
                      <span className={cn("text-base font-black", s.color)}>{s.count}</span>
                      <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">{s.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {showClickToCall && activeTaskForCall && (
        <ClickToCallModal 
          open={showClickToCall}
          onClose={() => {
            setShowClickToCall(false);
            setActiveTaskForCall(null);
          }}
          customerName={activeTaskForCall.customer?.name || "Unknown"}
          customerPhone={activeTaskForCall.customer?.phone || ""}
          taskId={activeTaskForCall.id}
        />
      )}
    </div>
  );
}
