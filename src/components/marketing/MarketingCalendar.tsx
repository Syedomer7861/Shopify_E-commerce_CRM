"use client";
import { useMemo, useState } from "react";
import {
  ChevronLeft, ChevronRight, SlidersHorizontal, Download, X,
  CalendarDays, FileText, Users as UsersIcon, Flag, Tag as TagIcon,
} from "lucide-react";
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval,
  format, isSameMonth, isSameDay, addMonths, addWeeks, addDays, parseISO, isWithinInterval,
} from "date-fns";
import { cn } from "@/lib/utils";
import type { MktList, MktTask, Profile } from "@/types";

type CalView = "month" | "week" | "agenda";

const PRIORITY_DOT: Record<string, string> = {
  urgent: "bg-rose-500",
  high: "bg-amber-500",
  normal: "bg-slate-300",
  low: "bg-slate-200",
};

type Props = {
  list: MktList;
  tasks: MktTask[];
  members?: Profile[];
  onOpenTask: (id: string) => void;
};

// ── helpers ──────────────────────────────────────────────────────────────
const dkey = (d: Date | string) => format(typeof d === "string" ? parseISO(d) : d, "yyyy-MM-dd");
const initials = (name?: string | null, email?: string | null) =>
  (name || email || "?").trim().slice(0, 2).toUpperCase();

// iCalendar export — one all-day VEVENT per task with a due date. Imports
// straight into Google / Outlook / Apple Calendar.
function buildICS(tasks: MktTask[], listName: string): string {
  const esc = (s: string) => (s || "").replace(/[\\;,]/g, (m) => "\\" + m).replace(/\n/g, "\\n");
  const stamp = format(new Date(), "yyyyMMdd'T'HHmmss");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//CodeCrest CRM//Workspace Calendar//EN",
    `X-WR-CALNAME:${esc(listName)}`,
  ];
  for (const t of tasks) {
    if (!t.due_date) continue;
    const start = (t.start_date || t.due_date).replace(/-/g, "");
    // DTEND is exclusive for all-day events → +1 day on the due date
    const endExclusive = format(addDays(parseISO(t.due_date), 1), "yyyyMMdd");
    lines.push(
      "BEGIN:VEVENT",
      `UID:${t.id}@codecrest-crm`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${start}`,
      `DTEND;VALUE=DATE:${endExclusive}`,
      `SUMMARY:${esc(t.title)}`,
      t.description ? `DESCRIPTION:${esc(t.description)}` : "",
      `CATEGORIES:${esc(t.priority)}`,
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.filter(Boolean).join("\r\n");
}

function download(name: string, mime: string, body: string) {
  const url = URL.createObjectURL(new Blob([body], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function MarketingCalendar({ list, tasks, members = [], onOpenTask }: Props) {
  const [view, setView] = useState<CalView>("month");
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()));
  const [showFilters, setShowFilters] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [hiddenStatuses, setHiddenStatuses] = useState<Set<string>>(new Set());
  const [hideDone, setHideDone] = useState(false);
  const [selected, setSelected] = useState<MktTask | null>(null);

  const statusMeta = (id: string) => list.statuses.find((s) => s.id === id);
  const statusColor = (id: string) => statusMeta(id)?.color ?? "#9c9a94";
  const doneIds = useMemo(
    () => new Set(list.statuses.filter((s) => s.type === "done").map((s) => s.id)),
    [list.statuses]
  );
  const memberById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);

  // Visible date range for the current view (used by tiles + export).
  const range = useMemo(() => {
    if (view === "month") {
      return { start: startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 }), end: endOfWeek(endOfMonth(cursor), { weekStartsOn: 1 }) };
    }
    if (view === "week") {
      const s = startOfWeek(cursor, { weekStartsOn: 1 });
      return { start: s, end: addDays(s, 6) };
    }
    return { start: cursor, end: addDays(cursor, 30) }; // agenda: next 30 days
  }, [view, cursor]);

  const scoped = useMemo(() => {
    return tasks.filter((t) => {
      if (!t.due_date) return false;
      if (hiddenStatuses.has(t.status)) return false;
      if (hideDone && doneIds.has(t.status)) return false;
      const d = parseISO(t.due_date);
      return isWithinInterval(d, { start: range.start, end: range.end });
    });
  }, [tasks, hiddenStatuses, hideDone, doneIds, range]);

  const byDay = useMemo(() => {
    const map = new Map<string, MktTask[]>();
    for (const t of scoped) {
      const k = dkey(t.due_date!);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(t);
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => (a.priority < b.priority ? -1 : 1) || a.title.localeCompare(b.title));
    }
    return map;
  }, [scoped]);

  // Tiles: count per status within the visible range.
  const tiles = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of scoped) counts.set(t.status, (counts.get(t.status) ?? 0) + 1);
    return list.statuses.map((s) => ({ ...s, count: counts.get(s.id) ?? 0 }));
  }, [scoped, list.statuses]);

  const label =
    view === "week"
      ? `${format(range.start, "d MMM")} – ${format(range.end, "d MMM yyyy")}`
      : view === "agenda"
      ? `${format(cursor, "d MMM")} → ${format(range.end, "d MMM")}`
      : format(cursor, "MMMM yyyy");

  const step = (dir: -1 | 1) =>
    setCursor((c) =>
      view === "month" ? addMonths(c, dir) : view === "week" ? addWeeks(c, dir) : addDays(c, dir * 7)
    );

  const doExport = (kind: "ics" | "csv") => {
    setExportOpen(false);
    const rows = [...scoped].sort((a, b) => a.due_date!.localeCompare(b.due_date!));
    const base = `${list.name.replace(/[^a-z0-9]+/gi, "_")}_${dkey(range.start)}_${dkey(range.end)}`;
    if (kind === "ics") {
      download(`${base}.ics`, "text/calendar", buildICS(rows, list.name));
      return;
    }
    const head = ["Title", "Status", "Priority", "Start", "Due", "Assignees", "Tags"];
    const csv = [
      head.join(","),
      ...rows.map((t) =>
        [
          `"${t.title.replace(/"/g, '""')}"`,
          statusMeta(t.status)?.name ?? t.status,
          t.priority,
          t.start_date ?? "",
          t.due_date ?? "",
          `"${(t.assignees ?? []).map((id) => memberById.get(id)?.name || memberById.get(id)?.email || id).join("; ")}"`,
          `"${(t.tags ?? []).join("; ")}"`,
        ].join(",")
      ),
    ].join("\n");
    download(`${base}.csv`, "text/csv", csv);
  };

  // ── event pill ─────────────────────────────────────────────────────────
  const Pill = ({ t, compact = false }: { t: MktTask; compact?: boolean }) => {
    const color = statusColor(t.status);
    const who = (t.assignees ?? []).slice(0, 3);
    return (
      <button
        onClick={() => setSelected(t)}
        className="w-full text-left rounded-md pl-1.5 pr-1 py-1 transition-colors hover:brightness-95"
        style={{ backgroundColor: color + "1f", borderLeft: `3px solid ${color}` }}
      >
        <div className="flex items-center gap-1">
          <span className={cn("w-1.5 h-1.5 rounded-full flex-shrink-0", PRIORITY_DOT[t.priority] ?? PRIORITY_DOT.normal)} />
          <span className="text-[10px] font-semibold text-[#1c1c1c] truncate flex-1">{t.title}</span>
        </div>
        {!compact && who.length > 0 && (
          <div className="flex items-center gap-0.5 mt-1 pl-2.5">
            {who.map((id) => (
              <span
                key={id}
                className="w-3.5 h-3.5 rounded-full bg-[#1c1c1c] text-white text-[6px] font-black flex items-center justify-center border border-white"
                title={memberById.get(id)?.name || memberById.get(id)?.email || ""}
              >
                {initials(memberById.get(id)?.name, memberById.get(id)?.email)}
              </span>
            ))}
            {(t.assignees?.length ?? 0) > 3 && (
              <span className="text-[7px] font-bold text-[#5f5f5d]/60 ml-0.5">
                +{(t.assignees!.length) - 3}
              </span>
            )}
          </div>
        )}
      </button>
    );
  };

  // ── grids ──────────────────────────────────────────────────────────────
  const monthDays = useMemo(
    () => eachDayOfInterval({ start: range.start, end: range.end }),
    [range]
  );

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-4">
      <div className="space-y-4 min-w-0">
        {/* Stat tiles */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {tiles.map((s) => (
            <button
              key={s.id}
              onClick={() =>
                setHiddenStatuses((prev) => {
                  const n = new Set(prev);
                  n.has(s.id) ? n.delete(s.id) : n.add(s.id);
                  return n;
                })
              }
              className={cn(
                "flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-all",
                hiddenStatuses.has(s.id) ? "opacity-40 border-[#eceae4] bg-white" : "border-[#eceae4] bg-white hover:shadow-sm"
              )}
            >
              <span className="w-8 h-8 rounded-lg flex-shrink-0" style={{ backgroundColor: s.color + "26" }}>
                <span className="w-full h-full flex items-center justify-center">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.color }} />
                </span>
              </span>
              <div className="min-w-0">
                <div className="text-[9px] font-black uppercase tracking-widest text-[#5f5f5d]/60 truncate">Total {s.name}</div>
                <div className="text-lg font-black text-[#1c1c1c] leading-none">{s.count}</div>
              </div>
            </button>
          ))}
        </div>

        {/* Toolbar */}
        <div className="bg-white border border-[#eceae4] rounded-2xl">
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-[#eceae4]">
            <div className="flex items-center gap-1">
              <button onClick={() => step(-1)} className="w-7 h-7 rounded-lg hover:bg-[#f2efe8] flex items-center justify-center text-[#5f5f5d]">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setCursor(view === "month" ? startOfMonth(new Date()) : new Date())}
                className="text-[10px] font-black uppercase tracking-widest text-[#5f5f5d] px-2 hover:text-[#1c1c1c]"
              >
                Today
              </button>
              <button onClick={() => step(1)} className="w-7 h-7 rounded-lg hover:bg-[#f2efe8] flex items-center justify-center text-[#5f5f5d]">
                <ChevronRight className="w-4 h-4" />
              </button>
              <span className="text-sm font-black uppercase tracking-widest text-[#1c1c1c] ml-2">{label}</span>
            </div>

            <div className="flex items-center gap-1.5">
              <div className="flex bg-[#f2efe8] rounded-lg p-0.5">
                {(["month", "week", "agenda"] as CalView[]).map((v) => (
                  <button
                    key={v}
                    onClick={() => setView(v)}
                    className={cn(
                      "px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-widest",
                      view === v ? "bg-white text-[#1c1c1c] shadow-sm" : "text-[#5f5f5d]"
                    )}
                  >
                    {v === "agenda" ? "Day" : v}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setShowFilters((s) => !s)}
                className={cn(
                  "px-2.5 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest border flex items-center gap-1.5",
                  showFilters || hiddenStatuses.size || hideDone ? "bg-[#1c1c1c] text-white border-[#1c1c1c]" : "bg-white text-[#5f5f5d] border-[#eceae4]"
                )}
              >
                <SlidersHorizontal className="w-3 h-3" /> Filters
              </button>
              <div className="relative">
                <button
                  onClick={() => setExportOpen((o) => !o)}
                  className="px-2.5 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest bg-white text-[#5f5f5d] border border-[#eceae4] flex items-center gap-1.5"
                >
                  <Download className="w-3 h-3" /> Export
                </button>
                {exportOpen && (
                  <div className="absolute right-0 mt-1 w-44 bg-white border border-[#eceae4] rounded-xl shadow-lg z-20 overflow-hidden">
                    <button onClick={() => doExport("ics")} className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs font-bold hover:bg-[#f7f4ed]">
                      <CalendarDays className="w-3.5 h-3.5" /> iCalendar (.ics)
                    </button>
                    <button onClick={() => doExport("csv")} className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs font-bold hover:bg-[#f7f4ed] border-t border-[#eceae4]">
                      <FileText className="w-3.5 h-3.5" /> Spreadsheet (.csv)
                    </button>
                    <div className="px-3 py-1.5 text-[9px] font-bold text-[#5f5f5d]/50 border-t border-[#eceae4]">
                      {scoped.length} event{scoped.length === 1 ? "" : "s"} in view
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {showFilters && (
            <div className="px-4 py-3 border-b border-[#eceae4] bg-[#faf8f3] flex flex-wrap items-center gap-2">
              <span className="text-[9px] font-black uppercase tracking-widest text-[#5f5f5d]/50">Show</span>
              {list.statuses.map((s) => {
                const on = !hiddenStatuses.has(s.id);
                return (
                  <button
                    key={s.id}
                    onClick={() =>
                      setHiddenStatuses((prev) => {
                        const n = new Set(prev);
                        n.has(s.id) ? n.delete(s.id) : n.add(s.id);
                        return n;
                      })
                    }
                    className={cn(
                      "flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] font-bold border transition-all",
                      on ? "bg-white border-[#eceae4] text-[#1c1c1c]" : "bg-transparent border-[#eceae4] text-[#5f5f5d]/40 line-through"
                    )}
                  >
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
                    {s.name}
                  </button>
                );
              })}
              <label className="flex items-center gap-1.5 text-[10px] font-bold text-[#5f5f5d] ml-2 cursor-pointer">
                <input type="checkbox" checked={hideDone} onChange={(e) => setHideDone(e.target.checked)} />
                Hide completed
              </label>
              {(hiddenStatuses.size > 0 || hideDone) && (
                <button
                  onClick={() => { setHiddenStatuses(new Set()); setHideDone(false); }}
                  className="text-[10px] font-black text-rose-500 uppercase tracking-widest hover:underline"
                >
                  Reset
                </button>
              )}
            </div>
          )}

          {/* Views */}
          {view === "month" && (
            <div className="overflow-x-auto">
              <div className="min-w-[620px]">
                <div className="grid grid-cols-7 text-[9px] font-black uppercase tracking-widest text-[#5f5f5d]/50 border-b border-[#eceae4]">
                  {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
                    <div key={d} className="px-2 py-2 text-center">{d}</div>
                  ))}
                </div>
                <div className="grid grid-cols-7">
                  {monthDays.map((day) => {
                    const k = dkey(day);
                    const list_ = byDay.get(k) ?? [];
                    const inMonth = isSameMonth(day, cursor);
                    const today = isSameDay(day, new Date());
                    return (
                      <div key={k} className={cn("min-h-[116px] border-b border-r border-[#eceae4] p-1.5 space-y-1", !inMonth && "bg-[#faf8f3]")}>
                        <div className={cn(
                          "text-[10px] font-bold w-5 h-5 flex items-center justify-center rounded-full",
                          today ? "bg-[#1c1c1c] text-white" : inMonth ? "text-[#1c1c1c]" : "text-[#5f5f5d]/40"
                        )}>
                          {format(day, "d")}
                        </div>
                        {list_.slice(0, 4).map((t) => <Pill key={t.id} t={t} />)}
                        {list_.length > 4 && (
                          <button onClick={() => { setView("agenda"); setCursor(day); }} className="text-[9px] font-black text-[#5f5f5d]/60 pl-1 hover:text-[#1c1c1c]">
                            +{list_.length - 4} more
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {view === "week" && (
            <div className="overflow-x-auto">
              <div className="grid grid-cols-7 min-w-[760px]">
                {monthDays.map((day) => {
                  const k = dkey(day);
                  const list_ = byDay.get(k) ?? [];
                  const today = isSameDay(day, new Date());
                  return (
                    <div key={k} className="border-r border-[#eceae4] min-h-[420px]">
                      <div className={cn("px-2 py-2 border-b border-[#eceae4] text-center", today && "bg-[#1c1c1c] text-white")}>
                        <div className="text-[8px] font-black uppercase tracking-widest opacity-60">{format(day, "EEE")}</div>
                        <div className="text-sm font-black">{format(day, "d")}</div>
                      </div>
                      <div className="p-1.5 space-y-1">
                        {list_.map((t) => <Pill key={t.id} t={t} />)}
                        {list_.length === 0 && <div className="text-[9px] text-[#5f5f5d]/30 text-center pt-4 font-bold uppercase tracking-widest">—</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {view === "agenda" && (
            <div className="divide-y divide-[#eceae4] max-h-[560px] overflow-y-auto">
              {[...byDay.keys()].sort().length === 0 && (
                <div className="px-4 py-12 text-center text-[11px] font-bold uppercase tracking-widest text-[#5f5f5d]/40">
                  Nothing scheduled in this window
                </div>
              )}
              {[...byDay.keys()].sort().map((k) => (
                <div key={k} className="px-4 py-3">
                  <div className="text-[10px] font-black uppercase tracking-widest text-[#5f5f5d]/60 mb-2">
                    {format(parseISO(k), "EEEE, d MMM")}
                  </div>
                  <div className="space-y-1.5">
                    {byDay.get(k)!.map((t) => <Pill key={t.id} t={t} />)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Details drawer */}
      <div className={cn(
        "bg-white border border-[#eceae4] rounded-2xl p-4 h-fit xl:sticky xl:top-4",
        !selected && "hidden xl:block"
      )}>
        {!selected ? (
          <div className="text-center py-16 text-[11px] font-bold uppercase tracking-widest text-[#5f5f5d]/40">
            Pick an event
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-2">
              <span
                className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full"
                style={{ backgroundColor: statusColor(selected.status) + "26", color: statusColor(selected.status) }}
              >
                {statusMeta(selected.status)?.name ?? selected.status}
              </span>
              <button onClick={() => setSelected(null)} className="text-[#5f5f5d]/50 hover:text-[#1c1c1c]">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="text-[15px] font-black text-[#1c1c1c] leading-tight">{selected.title}</div>

            <div className="space-y-1.5 text-[11px] font-medium text-[#5f5f5d]">
              <div className="flex items-center gap-2">
                <CalendarDays className="w-3.5 h-3.5 flex-shrink-0" />
                {selected.start_date ? `${format(parseISO(selected.start_date), "d MMM")} → ` : ""}
                {selected.due_date ? format(parseISO(selected.due_date), "d MMM yyyy") : "No date"}
              </div>
              <div className="flex items-center gap-2 capitalize">
                <Flag className="w-3.5 h-3.5 flex-shrink-0" />
                {selected.priority} priority
              </div>
            </div>

            {selected.description && (
              <p className="text-[11px] text-[#5f5f5d] whitespace-pre-wrap border-t border-[#eceae4] pt-3">{selected.description}</p>
            )}

            {(selected.assignees?.length ?? 0) > 0 && (
              <div className="border-t border-[#eceae4] pt-3">
                <div className="text-[9px] font-black uppercase tracking-widest text-[#5f5f5d]/50 mb-2 flex items-center gap-1.5">
                  <UsersIcon className="w-3 h-3" /> Team
                </div>
                <div className="space-y-1.5">
                  {selected.assignees!.map((id) => {
                    const m = memberById.get(id);
                    return (
                      <div key={id} className="flex items-center gap-2 text-[11px] font-medium text-[#1c1c1c]">
                        <span className="w-5 h-5 rounded-full bg-[#1c1c1c] text-white text-[7px] font-black flex items-center justify-center flex-shrink-0">
                          {initials(m?.name, m?.email)}
                        </span>
                        <span className="truncate">{m?.name || m?.email || id}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {(selected.tags?.length ?? 0) > 0 && (
              <div className="border-t border-[#eceae4] pt-3 flex flex-wrap gap-1.5">
                {selected.tags!.map((tag) => (
                  <span key={tag} className="text-[9px] font-bold px-2 py-0.5 rounded-lg bg-[#f7f4ed] border border-[#eceae4] text-[#5f5f5d] flex items-center gap-1">
                    <TagIcon className="w-2.5 h-2.5" /> {tag}
                  </span>
                ))}
              </div>
            )}

            <button
              onClick={() => onOpenTask(selected.id)}
              className="w-full py-2 rounded-lg bg-[#1c1c1c] text-white text-[10px] font-black uppercase tracking-widest"
            >
              Open full task
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
