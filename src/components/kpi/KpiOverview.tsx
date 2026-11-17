"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { StatCard } from "@/components/ui";
import { createClient } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { can } from "@/lib/access";
import { recentPeriods } from "@/lib/kpi/periods";
import type { Band } from "@/lib/kpi/score";
import type { Profile } from "@/types";
import type { Named } from "./PlansTab";

/**
 * KPI overview for whoever holds kpi.view, scoped like the database scopes
 * it: organisation sees everyone, department/branch their unit, team their
 * reporting line (my_report_ids), own just themselves. Scores come from
 * saved evaluations only (draft or finalised), never estimated, so a person
 * nobody has evaluated shows as "not evaluated", not as a number.
 */
type Person = Named & { department_id: string | null; branch_id: string | null };
type Assignment = { id: string; employee_id: string; status: "active" | "suggested"; kpi_plans: { name: string; period: string } | null };
type Evaluation = { assignment_id: string; employee_id: string; period_start: string; period_end: string; overall: number | null; band: Band | null; status: string };

const BAND_LABEL: Record<Band, string> = { exceeds: "Exceeds", meets: "Meets", needs_improvement: "Needs improvement", below: "Below" };
const BAND_CLS: Record<Band, string> = { exceeds: "text-emerald-700", meets: "text-sky-700", needs_improvement: "text-amber-700", below: "text-rose-700" };
const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);

export function KpiOverview({ viewer, departments }: { viewer: Profile | null; departments: Named[] }) {
  const supabase = useMemo(() => createClient(), []);
  const [people, setPeople] = useState<Person[] | null>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);

  useEffect(() => {
    let live = true;
    const scope = viewer?.role === "admin" ? "organisation" : can(viewer, "kpi", "view");
    (async () => {
      const [p, a, e, reports] = await Promise.all([
        supabase.from("profiles").select("id, name, department_id, branch_id").eq("is_active", true).order("name"),
        supabase.from("kpi_assignments").select("id, employee_id, status, kpi_plans(name, period)").in("status", ["active", "suggested"]),
        supabase.from("kpi_evaluations").select("assignment_id, employee_id, period_start, period_end, overall, band, status").order("period_end", { ascending: false }).limit(5000),
        scope === "team" ? supabase.rpc("my_report_ids") : Promise.resolve({ data: null }),
      ]);
      if (!live) return;
      const all = (p.data || []) as Person[];
      const team = new Set(((reports.data as unknown as string[] | null) ?? []).map(String));
      const inScope = (x: Person) =>
        x.id === viewer?.id || scope === "organisation"
        || (scope === "department" && !!x.department_id && x.department_id === viewer?.department_id)
        || (scope === "branch" && !!x.branch_id && x.branch_id === viewer?.branch_id)
        || (scope === "team" && team.has(x.id));
      setPeople(all.filter(inScope));
      setAssignments((a.data || []) as unknown as Assignment[]);
      setEvaluations((e.data || []) as Evaluation[]);
    })();
    return () => { live = false; };
  }, [supabase, viewer]);

  if (!people) return <div className="py-12 text-center text-gray-400"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>;

  const ids = new Set(people.map(p => p.id));
  const active = new Map(assignments.filter(a => a.status === "active" && ids.has(a.employee_id)).map(a => [a.employee_id, a]));
  const waiting = assignments.filter(a => a.status === "suggested" && ids.has(a.employee_id)).length;
  // Latest saved evaluation per person (list is newest first).
  const latest = new Map<string, Evaluation>();
  for (const e of evaluations) if (ids.has(e.employee_id) && !latest.has(e.employee_id)) latest.set(e.employee_id, e);

  // Last completed period of each person's plan: finalised, draft or not started.
  const progress = { finalised: 0, draft: 0, missing: [] as Person[] };
  for (const p of people) {
    const a = active.get(p.id);
    if (!a?.kpi_plans) continue;
    const prev = recentPeriods(a.kpi_plans.period, 2)[1];
    const ev = evaluations.find(e => e.assignment_id === a.id && e.period_start === prev.from && e.period_end === prev.to);
    if (ev?.status === "finalised") progress.finalised++;
    else if (ev) progress.draft++;
    else progress.missing.push(p);
  }
  const noPlan = people.filter(p => !active.has(p.id));
  const finalisedScores = (list: Person[]) => list.map(p => latest.get(p.id)).filter((e): e is Evaluation => e?.status === "finalised" && e.overall != null);

  const deptRows = [...departments.map(d => ({ id: d.id as string | null, name: d.name })), { id: null, name: "No department" }]
    .map(d => {
      const members = people.filter(p => p.department_id === d.id);
      const scored = finalisedScores(members);
      return { ...d, members: members.length, planned: members.filter(p => active.has(p.id)).length, avg: avg(scored.map(e => Number(e.overall))), scored: scored.length };
    })
    .filter(d => d.members > 0);

  const bands = finalisedScores(people).reduce<Record<string, number>>((m, e) => ({ ...m, [e.band ?? "none"]: (m[e.band ?? "none"] ?? 0) + 1 }), {});
  const name = (id: string) => people.find(p => p.id === id)?.name ?? "—";
  const recent = Array.from(latest.values()).slice(0, 30);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="People in scope" value={people.length} sub={`${active.size} on a KPI plan`} />
        <StatCard label="Without a plan" value={noPlan.length} sub={waiting ? `${waiting} awaiting approval` : "None awaiting approval"} />
        <StatCard label="Last period finalised" value={progress.finalised} sub={`${progress.draft} in draft, ${progress.missing.length} not started`} />
        <StatCard label="Average score" value={(() => { const a = avg(finalisedScores(people).map(e => Number(e.overall))); return a == null ? "—" : `${a}%`; })()} sub="Latest finalised evaluations" />
      </div>

      {Object.keys(bands).length > 0 && (
        <div className="card p-4 flex flex-wrap gap-4 text-xs">
          {(Object.keys(BAND_LABEL) as Band[]).map(b => (
            <span key={b}><span className={cn("font-bold", BAND_CLS[b])}>{bands[b] ?? 0}</span> {BAND_LABEL[b]}</span>
          ))}
        </div>
      )}

      <div className="card overflow-x-auto">
        <table className="w-full text-xs">
          <thead><tr className="text-left text-[#5f5f5d] border-b border-[#ebece6]"><th className="p-3">Department</th><th>People</th><th>On a plan</th><th>Evaluated</th><th className="pr-3 text-right">Average score</th></tr></thead>
          <tbody>
            {deptRows.map(d => (
              <tr key={d.id ?? "none"} className="border-b border-[#ebece6] last:border-0">
                <td className="p-3 font-semibold text-[#1c1c1c]">{d.name}</td><td>{d.members}</td>
                <td className={d.planned < d.members ? "text-amber-700" : ""}>{d.planned}</td><td>{d.scored}</td>
                <td className="pr-3 text-right">{d.avg == null ? "—" : `${d.avg}%`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card p-4">
          <div className="text-xs font-bold text-[#1c1c1c] mb-2">Needs attention</div>
          {noPlan.length === 0 && progress.missing.length === 0 ? <p className="text-xs text-[#5f5f5d]">Everyone has a plan and last period is evaluated.</p> : (
            <ul className="text-xs space-y-1 max-h-72 overflow-y-auto">
              {noPlan.slice(0, 50).map(p => <li key={"n" + p.id}><span className="font-semibold">{p.name}</span> <span className="text-[#5f5f5d]">· no KPI plan</span></li>)}
              {progress.missing.slice(0, 50).map(p => <li key={"m" + p.id}><Link className="font-semibold underline" href="/performance">{p.name}</Link> <span className="text-[#5f5f5d]">· last period not evaluated</span></li>)}
            </ul>
          )}
        </div>
        <div className="card p-4">
          <div className="text-xs font-bold text-[#1c1c1c] mb-2">Latest evaluations</div>
          {recent.length === 0 ? <p className="text-xs text-[#5f5f5d]">No evaluations saved yet. Managers evaluate from the Performance page.</p> : (
            <table className="w-full text-xs">
              <tbody>
                {recent.map(e => (
                  <tr key={e.assignment_id + e.period_start} className="border-t border-[#ebece6] first:border-0">
                    <td className="py-1 font-semibold">{name(e.employee_id)}</td>
                    <td className="text-[#5f5f5d]">{e.period_start} to {e.period_end}</td>
                    <td>{e.overall == null ? "—" : `${e.overall}%`}</td>
                    <td className={e.band ? BAND_CLS[e.band] : ""}>{e.band ? BAND_LABEL[e.band] : ""}</td>
                    <td className="text-[#5f5f5d]">{e.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
