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
import { allowedNavModules, isAdmin } from "@/lib/permissions";
import { can } from "@/lib/access";
import { CAL_KINDS, eventsOn, loadCalendarEvents, type CalEvent, type CalKind } from "@/lib/calendar-sources";

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
TYPE_COLORS.done = { bg: "bg-[#f0f0ec] text-[#6b6b67]", dot: "bg-[#9a9a94]", label: "Done" };

const getTaskColor = (task: any) => {
  if (task.status === "done") return TYPE_COLORS.done;
  return TYPE_COLORS[task.task_type] || { bg: "bg-[#f0f0ec] text-[#55554f]", dot: "bg-[#9a9a94]", label: task.task_type };
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
  const [events, setEvents]             = useState<CalEvent[]>([]);
  const [scopePick, setScopePick]       = useState<"mine" | "all" | null>(null);
  const [hidden, setHidden]             = useState<Set<string>>(new Set());

  // What the calendar shows follows the role. Calls only when the user has the
  // Tasks module; admins, managers and HR start on everything they can see,
  // everyone else on their own items. RLS still bounds both choices.
  const navAllowed = allowedNavModules(profile);
  // Call tasks follow the Tasks page (which needs the customers grant); field
  // visits follow the visits grant. Work tasks, leave and holidays apply to all.
  const canSeeCalls = !navAllowed || navAllowed.includes("tasks");
  const sources = CAL_KINDS.filter(k => k.key !== "visit" || can(profile, "visits", "view") !== null);
  const broadRole = isAdmin(profile) || profile?.role === "manager" || profile?.role === "hr";
  const scope = scopePick ?? (broadRole ? "all" : "mine");
  const toggleSource = (k: string) => setHidden(h => { const n = new Set(h); if (n.has(k)) n.delete(k); else n.add(k); return n; });

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
    const kinds = new Set(sources.map(k => k.key).filter(k => !hidden.has(k)) as CalKind[]);
    const eventsJob = profile?.id
      ? loadCalendarEvents(supabase, { start, end, userId: profile.id, mine: scope === "mine", kinds })
      : Promise.resolve([] as CalEvent[]);
    if (!canSeeCalls || hidden.has("calls")) {
      setTasks([]);
      setEvents(await eventsJob);
      setLoading(false);
      return;
    }
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
      if (scope === "mine" && profile?.id) query = query.eq("assigned_to", profile.id);
      const { data } = await query
        .order("priority_score", { ascending: false })
        .range(from, from + PAGE - 1);
      if (!data || data.length === 0) break;
      allTasks = allTasks.concat(data);
      if (data.length < PAGE) break;
    }
    setTasks(allTasks);
    setEvents(await eventsJob);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `sources` is derived from profile
  }, [getWindow, supabase, applyAgentFilters, profile?.id, scope, hidden, canSeeCalls, sources.length]);

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
  const eventsOnDay = (day: Date) => eventsOn(events, format(day, "yyyy-MM-dd"));
  const kindCfg = (k: CalKind) => CAL_KINDS.find(c => c.key === k)!;

  // ── heat-map shade ────────────────────────────────────────────────────────────
  const maxCount = Math.max(1, ...calDays.map(d => tasksOnDay(d).length + eventsOnDay(d).length));
  const heatBg = (count: number) => {
    const pct = count / maxCount;
    if (pct === 0)   return "";
    if (pct < 0.25)  return "bg-[#eef4fc]";
    if (pct < 0.5)   return "bg-[#dfeafa]";
    if (pct < 0.75)  return "bg-[#c7dbf5]";
    return "bg-[#a9c6ef]";
  };

  const selectedDayTasks = selectedDay ? tasksOnDay(selectedDay) : [];
  const selectedDayEvents = selectedDay ? eventsOnDay(selectedDay) : [];
  const headerLabel = view === "month"
    ? format(currentDate, "MMMM yyyy")
    : `${format(startOfWeekFn(currentDate), "d MMM")} – ${format(endOfWeekFn(currentDate), "d MMM yyyy")}`;

  return (
    <div className="flex flex-col lg:h-[calc(100vh-2rem)] lg:overflow-hidden animate-fade-in">
      <PageHeader
        title="Orchestration Calendar"
        subtitle="Live task schedule — click any day to drill down"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {/* Today button */}
            <button
              onClick={() => { setCurrentDate(new Date()); setSelectedDay(new Date()); }}
              className="btn-secondary text-xs py-1.5 px-3"
            >
              Today
            </button>

            {/* Scope: own items or everything this role can see */}
            <div className="flex items-center bg-[#ebece6]/40 rounded-xl border border-[#ebece6] p-1" role="group" aria-label="Whose items">
              {(["mine", "all"] as const).map(s => (
                <button key={s} onClick={() => setScopePick(s)} aria-pressed={scope === s}
                  className={cn("px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all",
                    scope === s ? "bg-[#1c1c1c] text-white shadow" : "text-[#5f5f5d]")}>
                  {s === "mine" ? "Mine" : broadRole ? "Team" : "All I can see"}
                </button>
              ))}
            </div>

            {/* View toggle */}
            <div className="flex items-center bg-[#ebece6]/40 rounded-xl border border-[#ebece6] p-1">
              <button
                onClick={() => setView("month")}
                className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all",
                  view === "month" ? "bg-[#1c1c1c] text-white shadow" : "text-[#5f5f5d]")}
              >
                <LayoutGrid className="w-3 h-3" /> Month
              </button>
              <button
                onClick={() => setView("week")}
                className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all",
                  view === "week" ? "bg-[#1c1c1c] text-white shadow" : "text-[#5f5f5d]")}
              >
                <CalendarDays className="w-3 h-3" /> Week
              </button>
            </div>

            {/* Navigation */}
            <div className="flex items-center gap-1 bg-white/60 rounded-xl border border-[#ebece6] shadow-sm p-1">
              <button onClick={prev} aria-label="Previous" className="p-2 hover:bg-[#f0f0ec] rounded-lg transition-colors">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-sm font-bold text-[#1c1c1c] min-w-[110px] lg:min-w-[160px] text-center">{headerLabel}</span>
              <button onClick={next} aria-label="Next" className="p-2 hover:bg-[#f0f0ec] rounded-lg transition-colors">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <button aria-label="Refresh" onClick={() => fetchTasks()} className="p-2 hover:bg-[#f0f0ec] rounded-xl border border-[#ebece6] transition-colors">
              <RefreshCw className={cn("w-4 h-4 text-[#9a9a94]", loading && "animate-spin")} />
            </button>
          </div>
        }
      />

      {/* ── Sources ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <span className="text-[9px] font-bold uppercase tracking-wider text-[#9a9a94] mr-1">Show</span>
        {[...(canSeeCalls ? [{ key: "calls", label: "Call tasks", dot: "bg-[#6f9bdd]" }] : []), ...sources].map(src => (
          <button key={src.key} onClick={() => toggleSource(src.key)} aria-pressed={!hidden.has(src.key)}
            className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold border transition-all",
              hidden.has(src.key) ? "bg-white text-[#d4d5cd] border-[#ebece6] line-through" : "bg-white text-[#1c1c1c] border-[#1c1c1c]/30")}>
            <span className={cn("w-2 h-2 rounded-full", src.dot, hidden.has(src.key) && "opacity-30")} />
            {src.label}
          </button>
        ))}
      </div>

      {/* ── Type filter legend ───────────────────────────────────────────────── */}
      <div className={cn("flex items-center gap-2 mb-3 flex-wrap", (!canSeeCalls || hidden.has("calls")) && "hidden")}>
        <button
          onClick={() => setTypeFilter("all")}
          className={cn("px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider border transition-all",
            typeFilter === "all" ? "bg-[#1c1c1c] text-white border-[#1c1c1c]" : "bg-white text-[#6b6b67] border-[#ebece6]")}
        >
          All Types
        </button>
        {Object.entries(TYPE_COLORS).map(([key, cfg]) => (
          <button
            key={key}
            onClick={() => setTypeFilter(key)}
            className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold border transition-all",
              typeFilter === key ? `${cfg.bg} border-transparent shadow` : "bg-white text-[#6b6b67] border-[#ebece6]")}
          >
            <span className={cn("w-2 h-2 rounded-full", cfg.dot)} />
            {cfg.label}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-1.5 text-[10px] text-[#9a9a94] font-bold">
          <span className="w-2 h-2 rounded-sm bg-[#dfeafa] border border-[#c7dbf5]" />
          Low
          <span className="w-2 h-2 rounded-sm bg-[#c7dbf5] border border-[#a9c6ef]" />
          Med
          <span className="w-2 h-2 rounded-sm bg-[#a9c6ef] border border-[#8fb3e8]" />
          High
          <span className="ml-1 opacity-60">Heat map</span>
        </div>
      </div>

      <div className="flex-1 flex flex-col lg:flex-row gap-4 lg:overflow-hidden min-h-0">
        {/* ── Main calendar ────────────────────────────────────────────────────── */}
        <div className={cn("flex flex-col min-h-[460px] lg:min-h-0 bg-white rounded-2xl border border-[#ebece6] shadow-xl overflow-hidden transition-all duration-300",
          selectedDay ? "flex-[3]" : "flex-1")}>

          {/* Day headers */}
          <div className="grid grid-cols-7 border-b border-[#ebece6] bg-[#f6f7f2]/50 flex-shrink-0">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(d => (
              <div key={d} className="py-2.5 text-center text-[10px] font-bold uppercase tracking-wider text-[#9a9a94]">{d}</div>
            ))}
          </div>

          {/* Grid */}
          <div className={cn("flex-1 overflow-y-auto grid grid-cols-7",
            view === "month" ? "auto-rows-fr" : "")}>
            {calDays.map((day, i) => {
              const dayTasks   = tasksOnDay(day);
              const dayEvents  = eventsOnDay(day);
              const isToday    = isTodayFn(day);
              const inMonth    = isSameMonth(day, monthStart);
              const isSelected = selectedDay ? isSameDay(day, selectedDay) : false;
              const heat       = heatBg(dayTasks.length + dayEvents.length);
              const overdue    = dayTasks.filter(t => t.status !== "done" && parseLocalDate(t.due_date) < new Date()).length;

              return (
                <div
                  key={day.toString()}
                  onClick={() => setSelectedDay(isSelected ? null : day)}
                  className={cn(
                    "min-h-[100px] border-r border-b border-[#ebece6] p-1.5 flex flex-col gap-0.5 cursor-pointer transition-all duration-150 group",
                    !inMonth && "opacity-30",
                    (i + 1) % 7 === 0 && "border-r-0",
                    isSelected ? "ring-2 ring-inset ring-[#1c1c1c] bg-[#1c1c1c]/5" : `hover:bg-[#ebece6]/20 ${heat}`,
                  )}
                >
                  <div className="flex items-center justify-between mb-0.5">
                    <span className={cn(
                      "text-[11px] font-bold w-6 h-6 flex items-center justify-center rounded-full transition-all",
                      isToday ? "bg-[#1c1c1c] text-white" : isSelected ? "bg-[#1c1c1c]/20 text-[#1c1c1c]" : "text-[#9a9a94]"
                    )}>
                      {format(day, "d")}
                    </span>
                    <div className="flex items-center gap-1">
                      {overdue > 0 && (
                        <span className="text-[8px] font-bold text-rose-500 bg-rose-50 px-1 rounded">
                          {overdue}⚠
                        </span>
                      )}
                      {dayTasks.length + dayEvents.length > 0 && (
                        <span className="text-[9px] font-bold text-[#1c1c1c]/40">
                          {dayTasks.length + dayEvents.length}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex-1 flex flex-col gap-0.5 overflow-hidden">
                    {dayEvents.slice(0, view === "week" ? 4 : 2).map(ev => (
                      <div key={ev.id} className={cn("px-1.5 py-0.5 rounded text-[8px] font-semibold truncate flex items-center gap-1", kindCfg(ev.kind).bg, ev.done && "line-through opacity-60")}>
                        <span className={cn("w-1 h-1 rounded-full flex-shrink-0", kindCfg(ev.kind).dot)} />
                        {ev.title}
                      </div>
                    ))}
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
                    {(() => {
                      const more = Math.max(0, dayTasks.length - (view === "week" ? 8 : 3)) + Math.max(0, dayEvents.length - (view === "week" ? 4 : 2));
                      return more > 0 && <div className="text-[8px] font-bold text-[#d4d5cd] text-center">+{more} more</div>;
                    })()}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Day detail panel ──────────────────────────────────────────────────── */}
        {selectedDay && (
          <div className="w-full lg:w-[340px] flex-shrink-0 bg-white rounded-2xl border border-[#ebece6] shadow-xl overflow-hidden flex flex-col animate-in slide-in-from-right-4 duration-300">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#ebece6] bg-[#f6f7f2]/50 flex-shrink-0">
              <div>
                <div className="text-xs font-bold text-[#1c1c1c]">
                  {format(selectedDay, "EEEE, d MMMM")}
                </div>
                <div className="text-[10px] text-[#9a9a94] font-medium mt-0.5">
                  {selectedDayTasks.length} task{selectedDayTasks.length !== 1 ? "s" : ""}
                  {selectedDayEvents.length > 0 && ` · ${selectedDayEvents.length} other`}
                  {selectedDayTasks.filter(t => t.status === "done").length > 0 &&
                    ` · ${selectedDayTasks.filter(t => t.status === "done").length} done`}
                </div>
              </div>
              <button aria-label="Close"
                onClick={() => setSelectedDay(null)}
                className="w-7 h-7 rounded-lg hover:bg-[#f0f0ec] flex items-center justify-center text-[#9a9a94] transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-[#ebece6]/60">
              {selectedDayEvents.map(ev => {
                const c = kindCfg(ev.kind);
                const body = (
                  <div className="flex items-start gap-2.5">
                    <div className={cn("w-2 h-2 rounded-full mt-1.5 flex-shrink-0", c.dot)} />
                    <div className="flex-1 min-w-0">
                      <div className={cn("text-[11px] font-bold text-[#1c1c1c] truncate", ev.done && "line-through opacity-60")}>{ev.title}</div>
                      <div className="flex items-center gap-1.5 mt-1">
                        <span className={cn("px-1.5 py-0.5 rounded text-[9px] font-bold", c.bg)}>{c.label}</span>
                        {ev.sub && <span className="text-[9px] text-[#9a9a94] font-medium truncate">{ev.sub}</span>}
                      </div>
                    </div>
                  </div>
                );
                return ev.href
                  ? <Link key={ev.id} href={ev.href} className="block px-4 py-3 hover:bg-[#f6f7f2]/50 transition-colors">{body}</Link>
                  : <div key={ev.id} className="px-4 py-3">{body}</div>;
              })}
              {selectedDayTasks.length === 0 && selectedDayEvents.length > 0 ? null : selectedDayTasks.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full gap-3 py-16 text-center px-4">
                  <CalendarDays className="w-10 h-10 text-[#e6e7e0]" />
                  <p className="text-xs font-bold text-[#9a9a94]">No tasks on this day</p>
                  <p className="text-[10px] text-[#d4d5cd]">Tasks due on {format(selectedDay, "d MMMM")} will appear here</p>
                </div>
              ) : (
                selectedDayTasks.map(task => {
                  const c = getTaskColor(task);
                  const isOverdue = task.status !== "done" && parseLocalDate(task.due_date) < new Date() && !isTodayFn(parseLocalDate(task.due_date));
                  return (
                    <div key={task.id} className="px-4 py-3 hover:bg-[#f6f7f2]/50 transition-colors group">
                      <div className="flex items-start gap-2.5">
                        <div className={cn("w-2 h-2 rounded-full mt-1.5 flex-shrink-0", c.dot,
                          task.priority_score > 100 && "animate-pulse")} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-1">
                            <span className="text-[11px] font-bold text-[#1c1c1c] truncate">
                              {task.customer?.name || "Unknown"}
                            </span>
                            {task.status === "done" ? (
                              <CheckCircle2 className="w-3 h-3 text-[#55c08f] flex-shrink-0" />
                            ) : isOverdue ? (
                              <AlertTriangle className="w-3 h-3 text-rose-500 flex-shrink-0" />
                            ) : (
                              <Clock className="w-3 h-3 text-amber-400 flex-shrink-0" />
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 mt-1">
                            <span className={cn("px-1.5 py-0.5 rounded text-[9px] font-bold", c.bg)}>{c.label}</span>
                            {task.customer?.phone && (
                              <span className="text-[9px] text-[#9a9a94] font-medium">{task.customer.phone}</span>
                            )}
                          </div>
                          {task.priority_score > 0 && (
                            <div className="mt-1.5 flex items-center gap-1">
                              <Zap className="w-2.5 h-2.5 text-amber-400" />
                              <span className="text-[9px] text-[#9a9a94] font-bold">Priority {task.priority_score}</span>
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
                            className="flex items-center gap-1 px-2 py-1 rounded-lg bg-[#ebece6]/60 text-[#1c1c1c] text-[9px] font-bold hover:bg-[#1c1c1c] hover:text-white transition-all"
                          >
                            <Phone className="w-2.5 h-2.5" /> Call
                          </button>
                        )}
                        {task.customer?.phone && (
                          <a href={`https://wa.me/${task.customer.phone.replace(/\D/g, "")}`} target="_blank"
                            className="flex items-center gap-1 px-2 py-1 rounded-lg bg-[#ecf8f1] text-[#2f8a5f] text-[9px] font-bold hover:bg-[#3fa877] hover:text-white transition-all">
                            <MessageSquare className="w-2.5 h-2.5" /> WA
                          </a>
                        )}
                        <Link href={`/tasks?id=${task.id}`}
                          className="flex items-center gap-1 px-2 py-1 rounded-lg bg-[#eef4fc] text-[#3d66a6] text-[9px] font-bold hover:bg-[#1c1c1c] hover:text-white transition-all">
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
              <div className="border-t border-[#ebece6] px-4 py-2.5 bg-[#f6f7f2]/50 flex-shrink-0">
                <div className="grid grid-cols-3 gap-2 text-center">
                  {[
                    { label: "Pending", count: selectedDayTasks.filter(t => t.status !== "done").length, color: "text-amber-600" },
                    { label: "Done", count: selectedDayTasks.filter(t => t.status === "done").length, color: "text-[#3fa877]" },
                    { label: "Critical", count: selectedDayTasks.filter(t => t.priority_score > 100).length, color: "text-rose-600" },
                  ].map(s => (
                    <div key={s.label} className="flex flex-col">
                      <span className={cn("text-base font-bold", s.color)}>{s.count}</span>
                      <span className="text-[9px] font-bold text-[#9a9a94] uppercase tracking-wider">{s.label}</span>
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
