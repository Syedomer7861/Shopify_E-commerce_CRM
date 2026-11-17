"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, Circle, FolderKanban, CalendarClock, AlertTriangle, Activity, Clock, Target, ListChecks, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase";
import { marketingApi } from "@/lib/marketing-client";
import type { MktList, MktTask, Profile } from "@/types";
import { applyDateRange, inDateRange, rangeLabel, type DateRange } from "@/components/DateRangeFilter";

/**
 * Home overview built only from the person's own Workspace tasks and logged
 * time. Everything shown is real; empty states say so instead of padding.
 */
const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const PRIO: Record<string, { label: string; cls: string; rank: number }> = {
  urgent: { label: "Urgent", cls: "bg-rose-50 text-rose-600", rank: 0 },
  high: { label: "High", cls: "bg-amber-50 text-amber-700", rank: 1 },
  normal: { label: "Normal", cls: "bg-slate-100 text-slate-600", rank: 2 },
  low: { label: "Low", cls: "bg-emerald-50 text-emerald-700", rank: 3 },
};
const CAP_KEY = "mkt-workload-weekly-hours"; // shared with the Workload page

function ago(ts: string) {
  const s = Math.max(0, (Date.now() - new Date(ts).getTime()) / 1000);
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}

function Card({ title, icon: Icon, href, cta, children, className }: { title: string; icon: typeof Target; href?: string; cta?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("card p-5", className)}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-[#1c1c1c] flex items-center gap-2"><Icon className="w-4 h-4" /> {title}</h3>
        {href && <Link href={href} className="text-xs font-medium text-[#5f5f5d] hover:text-[#1c1c1c] flex items-center gap-1">{cta || "View all"} <ArrowRight className="w-3 h-3" /></Link>}
      </div>
      {children}
    </section>
  );
}

const Empty = ({ children }: { children: React.ReactNode }) => <div className="text-xs text-[#6b6b67] py-6 text-center">{children}</div>;

export function MyWorkOverview({ profile, range }: { profile: Profile; range: DateRange }) {
  const [tasks, setTasks] = useState<MktTask[] | null>(null);
  const [lists, setLists] = useState<MktList[]>([]);
  const [minutes, setMinutes] = useState<{ minutes: number; spent_on: string }[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [rangeMins, setRangeMins] = useState<number | null>(null);

  const now = new Date();
  const today = iso(now);
  const monday = addDays(now, -((now.getDay() + 6) % 7));

  useEffect(() => {
    let alive = true;
    Promise.all([marketingApi.listTasks({ assignee: profile.id }), marketingApi.listLists()])
      .then(([t, l]) => { if (alive) { setTasks(t); setLists(l); } })
      .catch(() => { if (alive) { setFailed(true); setTasks([]); } });
    // Own time entries this week; RLS keeps it to rows this user may read. Hidden if the table isn't there.
    createClient().from("mkt_time_entries").select("minutes, spent_on").eq("user_id", profile.id).gte("spent_on", iso(monday))
      .then(({ data, error }) => { if (alive) setMinutes(error ? null : data ?? []); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.id]);

  // Hours logged inside the chosen period (own rows; RLS scoped).
  useEffect(() => {
    let alive = true;
    applyDateRange(createClient().from("mkt_time_entries").select("minutes").eq("user_id", profile.id), "spent_on", range, true).limit(5000)
      .then(({ data, error }) => { if (alive) setRangeMins(error ? null : (data ?? []).reduce((s, m: any) => s + (m.minutes || 0), 0)); });
    return () => { alive = false; };
  }, [profile.id, range]);

  const listById = useMemo(() => new Map(lists.map(l => [l.id, l])), [lists]);
  const doneIds = useMemo(() => new Set(lists.flatMap(l => (l.statuses ?? []).filter(s => s.type === "done").map(s => `${l.id}:${s.id}`))), [lists]);
  const activeIds = useMemo(() => new Set(lists.flatMap(l => (l.statuses ?? []).filter(s => s.type === "active").map(s => `${l.id}:${s.id}`))), [lists]);

  const view = useMemo(() => {
    const all = tasks ?? [];
    const isDone = (t: MktTask) => doneIds.has(`${t.list_id}:${t.status}`) || !!t.completed_at;
    const open = all.filter(t => !isDone(t));
    const weekEnd = iso(addDays(monday, 6));
    const soon = iso(addDays(now, 14));
    const byDue = (a: MktTask, b: MktTask) => (a.due_date || "9999").localeCompare(b.due_date || "9999") || (PRIO[a.priority]?.rank ?? 2) - (PRIO[b.priority]?.rank ?? 2);

    const projects = new Map<string, { list: MktList | undefined; total: number; done: number }>();
    for (const t of all) {
      const p = projects.get(t.list_id) ?? { list: listById.get(t.list_id), total: 0, done: 0 };
      p.total += 1; if (isDone(t)) p.done += 1;
      projects.set(t.list_id, p);
    }
    return {
      open,
      inProgress: open.filter(t => activeIds.has(`${t.list_id}:${t.status}`)).length,
      overdue: open.filter(t => t.due_date && t.due_date < today),
      dueToday: open.filter(t => t.due_date === today).length,
      dueWeek: open.filter(t => t.due_date && t.due_date >= today && t.due_date <= weekEnd).length,
      focus: [...open].sort(byDue).slice(0, 5),
      deadlines: open.filter(t => t.due_date && t.due_date >= today && t.due_date <= soon).sort(byDue).slice(0, 5),
      projects: [...projects.entries()].filter(([, p]) => p.total > p.done).sort((a, b) => b[1].total - a[1].total).slice(0, 4),
      activeProjects: [...projects.values()].filter(p => p.total > p.done).length,
      period: (() => {
        const done = all.filter(t => t.completed_at && inDateRange(t.completed_at, range));
        const dated = done.filter(t => t.due_date);
        const onTime = dated.filter(t => (t.completed_at || "").slice(0, 10) <= (t.due_date || ""));
        return {
          completed: done.length,
          added: all.filter(t => inDateRange(t.created_at, range)).length,
          onTimePct: dated.length ? Math.round((onTime.length / dated.length) * 100) : null,
          dueInPeriod: all.filter(t => t.due_date && (range.from || range.to) && inDateRange(t.due_date, range)).length,
        };
      })(),
      recent: [...all].sort((a, b) => (b.updated_at || "").localeCompare(a.updated_at || "")).slice(0, 5).map(t => ({ t, done: isDone(t) })),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, listById, doneIds, activeIds, today, range]);

  const linkFor = (t: MktTask) => `/workspace?space=${listById.get(t.list_id)?.space_id ?? ""}&list=${t.list_id}&task=${t.id}`;

  const capHours = (() => {
    try { const raw = localStorage.getItem(CAP_KEY); return raw ? Math.max(1, Number(raw)) || 40 : 40; } catch { return 40; }
  })();
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri"].map((label, i) => {
    const d = iso(addDays(monday, i));
    return { label, d, mins: (minutes ?? []).filter(m => m.spent_on === d).reduce((s, m) => s + (m.minutes || 0), 0) };
  });
  const weekMins = (minutes ?? []).reduce((s, m) => s + (m.minutes || 0), 0);
  const maxDay = Math.max(60, ...days.map(d => d.mins));
  const hm = (m: number) => `${Math.floor(m / 60)}h ${m % 60 ? `${m % 60}m` : ""}`.trim();

  if (tasks === null) return <div className="py-10 text-center text-[#6b6b67]"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>;
  // Not in any Space and nothing assigned: this overview has nothing real to show.
  if (!failed && lists.length === 0 && tasks.length === 0) return null;

  const fmtDue = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short" });

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-3 rounded-2xl p-7 text-white bg-gradient-to-br from-[#0f3d2a] via-[#145a3b] to-[#0b2a1d] relative overflow-hidden">
          <div className="absolute -right-10 -top-10 w-56 h-56 rounded-full bg-emerald-400/10 blur-2xl" />
          <h2 className="text-2xl md:text-3xl font-semibold tracking-tight font-display">Continue your work</h2>
          <p className="text-sm text-white/70 mt-1.5">
            {view.open.length === 0 ? "Nothing open right now." : `${view.open.length} open ${view.open.length === 1 ? "task" : "tasks"}${view.overdue.length ? `, ${view.overdue.length} overdue` : ""}.`}
          </p>
          <Link href="/workspace/my" className="inline-flex items-center gap-2 mt-6 px-4 py-2.5 rounded-lg bg-white text-[#1c1c1c] text-sm font-semibold hover:bg-white/90">
            Open my tasks <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
        <Card title="Today's focus" icon={Target} className="lg:col-span-2 bg-emerald-50/40">
          {view.focus.length === 0 ? <Empty>{failed ? "Couldn't load your tasks." : "No open tasks. Enjoy the calm."}</Empty> : (
            <ul className="space-y-2.5">
              {view.focus.map(t => (
                <li key={t.id}>
                  <Link href={linkFor(t)} className="flex items-start gap-2.5 text-sm text-[#1c1c1c] hover:underline">
                    <Circle className={cn("w-4 h-4 mt-0.5 shrink-0", t.due_date && t.due_date < today ? "text-rose-500" : "text-gray-300")} />
                    <span className="flex-1 truncate">{t.title}</span>
                    {t.due_date && <span className={cn("text-xs shrink-0", t.due_date < today ? "text-rose-500" : "text-[#6b6b67]")}>{t.due_date === today ? "Today" : fmtDue(t.due_date)}</span>}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "My tasks", value: view.open.length, sub: `${view.inProgress} in progress`, icon: ListChecks, href: "/workspace/my" },
          { label: "Active projects", value: view.activeProjects, sub: "Lists with my open tasks", icon: FolderKanban, href: "/workspace" },
          { label: "Due this week", value: view.dueWeek, sub: `${view.dueToday} due today`, icon: CalendarClock, href: "/workspace/my" },
          { label: "Overdue", value: view.overdue.length, sub: view.overdue.length ? "Needs attention" : "All on time", icon: AlertTriangle, href: "/workspace/my", alert: view.overdue.length > 0 },
        ].map(s => (
          <Link key={s.label} href={s.href} className="card p-5 hover:border-[#1c1c1c]/20 transition-colors">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-[#1c1c1c]">{s.label}</span>
              <s.icon className={cn("w-5 h-5", s.alert ? "text-rose-500" : "text-emerald-600")} />
            </div>
            <div className={cn("text-3xl font-bold mt-2", s.alert && "text-rose-600")}>{s.value}</div>
            <div className="text-xs text-[#6b6b67] mt-0.5">{s.sub}</div>
          </Link>
        ))}
      </div>

      <section className="card p-5">
        <h3 className="text-sm font-bold text-[#1c1c1c] mb-4">My delivery · {rangeLabel(range)}</h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: "Tasks completed", value: view.period.completed },
            { label: "Tasks assigned", value: view.period.added, sub: "Created in this period" },
            { label: "On-time delivery", value: view.period.onTimePct === null ? "—" : `${view.period.onTimePct}%`, sub: "Done by due date" },
            { label: "Hours logged", value: rangeMins === null ? "—" : hm(rangeMins) || "0h" },
          ].map(s => (
            <div key={s.label}>
              <div className="text-[10px] font-black uppercase tracking-widest text-[#6b6b67]">{s.label}</div>
              <div className="text-2xl font-bold mt-1">{s.value}</div>
              {s.sub && <div className="text-[11px] text-[#6b6b67]">{s.sub}</div>}
            </div>
          ))}
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title="My active projects" icon={FolderKanban} href="/workspace">
          {view.projects.length === 0 ? <Empty>No projects with open tasks.</Empty> : (
            <ul className="space-y-4">
              {view.projects.map(([id, p]) => {
                const pct = Math.round((p.done / p.total) * 100);
                return (
                  <li key={id} className="flex items-center gap-3">
                    <span className="w-9 h-9 rounded-lg grid place-items-center text-sm font-bold text-white shrink-0" style={{ background: p.list?.color || "#1c1c1c" }}>
                      {(p.list?.name || "?").slice(0, 1).toUpperCase()}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-[#1c1c1c] truncate">{p.list?.name || "Untitled list"}</div>
                      <div className="text-xs text-[#6b6b67]">{p.done} of {p.total} done</div>
                    </div>
                    <div className="w-28 h-2 rounded-full bg-[#f0f0ec] overflow-hidden shrink-0"><div className="h-full bg-emerald-600 rounded-full" style={{ width: `${pct}%` }} /></div>
                    <span className="text-xs font-semibold w-9 text-right">{pct}%</span>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card title="Upcoming deadlines" icon={CalendarClock} href="/calendar" cta="View calendar">
          {view.deadlines.length === 0 ? <Empty>Nothing due in the next 2 weeks.</Empty> : (
            <ul className="space-y-2.5">
              {view.deadlines.map(t => (
                <li key={t.id}>
                  <Link href={linkFor(t)} className="flex items-center gap-3 hover:bg-[#f6f7f2] rounded-lg p-1 -m-1">
                    <span className="w-12 shrink-0 text-center rounded-lg bg-[#f0f0ec] py-1 leading-tight">
                      <span className="block text-[10px] text-[#6b6b67]">{new Date(`${t.due_date}T00:00:00`).toLocaleDateString(undefined, { month: "short" })}</span>
                      <span className="block text-sm font-bold">{new Date(`${t.due_date}T00:00:00`).getDate()}</span>
                    </span>
                    <span className="flex-1 text-sm text-[#1c1c1c] truncate">{t.title}</span>
                    <span className={cn("text-[11px] font-semibold px-2 py-0.5 rounded-full shrink-0", PRIO[t.priority]?.cls)}>{PRIO[t.priority]?.label ?? t.priority}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title="Recent activity" icon={Activity} href="/workspace/my">
          {view.recent.length === 0 ? <Empty>No activity yet.</Empty> : (
            <ul className="space-y-3">
              {view.recent.map(({ t, done }) => (
                <li key={t.id} className="flex items-center gap-3 text-sm">
                  {done ? <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" /> : <Circle className="w-4 h-4 text-gray-300 shrink-0" />}
                  <Link href={linkFor(t)} className="flex-1 truncate text-[#1c1c1c] hover:underline">{done ? "Completed" : "Updated"} &ldquo;{t.title}&rdquo;</Link>
                  {t.updated_at && <span className="text-xs text-[#6b6b67] shrink-0">{ago(t.updated_at)}</span>}
                </li>
              ))}
            </ul>
          )}
        </Card>

        {minutes !== null && (
          <Card title="My hours this week" icon={Clock}>
            <div className="flex items-end justify-between">
              <span className="text-3xl font-bold">{hm(weekMins) || "0h"}</span>
              <span className="text-xs text-[#6b6b67]">of {capHours}h · {Math.min(100, Math.round((weekMins / (capHours * 60)) * 100))}%</span>
            </div>
            <div className="h-2 rounded-full bg-[#f0f0ec] mt-3 overflow-hidden"><div className="h-full bg-emerald-600 rounded-full" style={{ width: `${Math.min(100, (weekMins / (capHours * 60)) * 100)}%` }} /></div>
            <div className="grid grid-cols-5 gap-3 mt-5 items-end h-28">
              {days.map(d => (
                <div key={d.label} className="flex flex-col items-center gap-1 h-full justify-end">
                  <div className={cn("w-full rounded-md", d.d === today ? "bg-emerald-700" : "bg-emerald-200")} style={{ height: `${d.mins ? Math.max(6, (d.mins / maxDay) * 80) : 2}%` }} />
                  <span className="text-[11px] text-[#6b6b67]">{d.label}</span>
                  <span className="text-[11px] font-semibold">{d.mins ? `${(d.mins / 60).toFixed(1)}h` : "—"}</span>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-[#6b6b67] mt-3">Logged with the timer on Workspace tasks.</p>
          </Card>
        )}
      </div>
    </div>
  );
}
