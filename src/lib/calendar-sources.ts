import { addDays, format } from "date-fns";

/**
 * Non-call items shown on the Calendar. Every query runs as the signed-in
 * user, so RLS decides what each role sees (agents: own leave / own visits;
 * HR and admins: everyone's leave; workspace tasks: spaces the user can
 * open). "mine" only narrows further; it never widens.
 */
export type CalKind = "work" | "visit" | "leave" | "holiday";
export type CalEvent = { id: string; kind: CalKind; start: string; end: string; title: string; sub?: string; href?: string; done?: boolean };

export const CAL_KINDS: { key: CalKind; label: string; dot: string; bg: string }[] = [
  { key: "work", label: "Work tasks", dot: "bg-[#6f9bdd]", bg: "bg-[#eef4fc] text-[#3d66a6]" },
  { key: "visit", label: "Field visits", dot: "bg-amber-500", bg: "bg-amber-50 text-amber-700" },
  { key: "leave", label: "Leave", dot: "bg-rose-400", bg: "bg-rose-50 text-rose-700" },
  { key: "holiday", label: "Holidays", dot: "bg-[#55c08f]", bg: "bg-[#ecf8f1] text-[#2f8a5f]" },
];

const day = (v: string) => format(new Date(v), "yyyy-MM-dd");
const localDay = (d: string) => { const [y, m, dd] = d.split("-").map(Number); return new Date(y, m - 1, dd); };

// One failing source (module off, table missing, no access) must not blank the calendar.
async function safe<T>(p: PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  try { const { data, error } = await p; return error ? [] : data ?? []; } catch { return []; }
}

export async function loadCalendarEvents(
  supabase: any,
  { start, end, userId, mine, kinds }: { start: string; end: string; userId: string; mine: boolean; kinds: Set<CalKind> },
): Promise<CalEvent[]> {
  const endEx = format(addDays(localDay(end), 1), "yyyy-MM-dd");
  const startIso = localDay(start).toISOString();
  const endIso = localDay(endEx).toISOString();
  const jobs: Promise<CalEvent[]>[] = [];

  if (kinds.has("work")) {
    let q = supabase.from("mkt_tasks").select("id, title, due_date, completed_at")
      .gte("due_date", start).lt("due_date", endEx).order("due_date").limit(1000);
    if (mine) q = q.contains("assignees", [userId]);
    jobs.push(safe<any>(q).then(rows => rows.map(r => ({
      id: `w-${r.id}`, kind: "work" as const, start: day(r.due_date), end: day(r.due_date),
      title: r.title || "Untitled task", href: `/workspace?task=${r.id}`, done: Boolean(r.completed_at),
    }))));
  }

  if (kinds.has("visit")) {
    let q = supabase.from("visits").select("id, party_name, purpose, planned_at, status, check_out_at")
      .gte("planned_at", startIso).lt("planned_at", endIso).order("planned_at").limit(1000);
    if (mine) q = q.eq("owner_id", userId);
    jobs.push(safe<any>(q).then(rows => rows.map(r => ({
      id: `v-${r.id}`, kind: "visit" as const, start: day(r.planned_at), end: day(r.planned_at),
      title: r.party_name || "Visit", sub: [format(new Date(r.planned_at), "HH:mm"), r.purpose].filter(Boolean).join(" · "),
      href: "/field", done: r.status === "completed" || Boolean(r.check_out_at),
    }))));
  }

  if (kinds.has("leave")) {
    let q = supabase.from("leaves").select("id, agent_id, start_date, end_date, status, reason")
      .lte("start_date", end).gte("end_date", start).neq("status", "rejected").limit(1000);
    if (mine) q = q.eq("agent_id", userId);
    jobs.push(safe<any>(q).then(async rows => {
      const ids = Array.from(new Set(rows.map(r => r.agent_id).filter(Boolean)));
      const people = ids.length ? await safe<any>(supabase.from("profiles").select("id, name").in("id", ids)) : [];
      const name = (id: string) => people.find(p => p.id === id)?.name || "Team member";
      return rows.map(r => ({
        id: `l-${r.id}`, kind: "leave" as const, start: r.start_date, end: r.end_date,
        title: r.agent_id === userId ? "You — leave" : `${name(r.agent_id)} — leave`, sub: r.status === "approved" ? "Approved" : "Pending approval",
        href: "/my-hub",
      }));
    }));
  }

  if (kinds.has("holiday")) {
    jobs.push(safe<any>(supabase.from("holidays").select("id, date, name").gte("date", start).lte("date", end)).then(rows => rows.map(r => ({
      id: `h-${r.id}`, kind: "holiday" as const, start: r.date, end: r.date, title: r.name || "Holiday",
    }))));
  }

  return (await Promise.all(jobs)).flat();
}

/** Events touching `d` (yyyy-MM-dd); multi-day leave covers every day in its range. */
export const eventsOn = (events: CalEvent[], d: string) => events.filter(e => e.start <= d && d <= e.end);
