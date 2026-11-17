"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Gauge, Loader2, Lock } from "lucide-react";
import toast from "react-hot-toast";
import { createClient } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { can } from "@/lib/access";
import { SOURCE_BY_KEY, computeActuals } from "@/lib/kpi/sources";
import { scorePlan, type Band, type KpiRule, type Measurement } from "@/lib/kpi/score";
import { recentPeriods, periodRange } from "@/lib/kpi/periods";
import type { Profile } from "@/types";

/**
 * The employee's active KPI plan for one review period: target vs actual,
 * achievement, weights, overall score. Automatic KPIs are read from real
 * records as the viewer (RLS applies); for someone else's plan the viewer
 * also needs that module's view grant beyond own/assigned, otherwise the KPI
 * shows "No access" instead of a misleading zero. Manual KPIs are entered by
 * a manager. A finalised evaluation is shown exactly as it was frozen.
 */
type Item = {
  id: string; name: string; source_key: string | null; measurement: Measurement; direction: "higher" | "lower"; unit: string;
  target: number | null; weight: number; cap: number | null; threshold: number | null; missing_rule: "exclude" | "zero"; sort_order: number;
};
type Assignment = {
  id: string; effective_from: string; target_overrides: Record<string, number>;
  kpi_plans: { id: string; name: string; period: string; kpi_plan_items: Item[] } | null;
};
type Evaluation = { id: string; status: "draft" | "submitted" | "finalised"; overall: number | null; band: string | null; comments: string; snapshot: Snapshot; finalised_at: string | null };
type Line = { id: string; name: string; unit: string; target: number | null; weight: number; actual: number | null; achievement: number | null; weighted: number | null; note: string | null };
type Snapshot = { lines?: Line[]; overall?: number | null; band?: Band | null; coverage?: number };

const BAND: Record<Band, { label: string; cls: string }> = {
  exceeds: { label: "Exceeds", cls: "bg-emerald-50 text-emerald-700" },
  meets: { label: "Meets", cls: "bg-sky-50 text-sky-700" },
  needs_improvement: { label: "Needs improvement", cls: "bg-amber-50 text-amber-700" },
  below: { label: "Below expectations", cls: "bg-rose-50 text-rose-700" },
};
const fmt = (n: number | null | undefined, unit = "") => (n == null ? "—" : `${unit === "₹" ? "₹" : ""}${Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 })}${unit && unit !== "₹" ? ` ${unit}` : ""}`);
const input = "h-8 px-2 bg-white border border-[#ebece6] rounded-lg text-xs w-24 focus:outline-none focus:border-[#1c1c1c]/30";

export function KpiScorecard({ employeeId, viewer }: { employeeId: string; viewer: Profile | null }) {
  const supabase = useMemo(() => createClient(), []);
  const [assignment, setAssignment] = useState<Assignment | null | undefined>(undefined);
  const [periodIdx, setPeriodIdx] = useState(0);
  const [actuals, setActuals] = useState<Record<string, number | null>>({});
  const [manual, setManual] = useState<Record<string, number | null>>({});
  const [draftManual, setDraftManual] = useState<Record<string, string>>({});
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
  const [comments, setComments] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<{ period_start: string; period_end: string; overall: number | null; band: Band | null }[]>([]);

  const isSelf = viewer?.id === employeeId;
  const isAdmin = viewer?.role === "admin";
  const canEnter = !isSelf && can(viewer, "kpi", "manage") !== null;
  const canFinalise = !isSelf && can(viewer, "kpi", "approve") !== null;
  const sourceAllowed = useCallback((grant: string) => {
    if (isSelf || isAdmin) return true;
    const s = can(viewer, grant, "view");
    return s !== null && s !== "own" && s !== "assigned";
  }, [isSelf, isAdmin, viewer]);

  useEffect(() => {
    let live = true;
    setAssignment(undefined);
    setPeriodIdx(0);
    supabase.from("kpi_assignments")
      .select("id, effective_from, target_overrides, kpi_plans(id, name, period, kpi_plan_items(id, name, source_key, measurement, direction, unit, target, weight, cap, threshold, missing_rule, sort_order))")
      .eq("employee_id", employeeId).eq("status", "active").maybeSingle()
      .then(({ data }) => { if (live) setAssignment((data as unknown as Assignment) ?? null); });
    return () => { live = false; };
  }, [supabase, employeeId]);

  const plan = assignment?.kpi_plans ?? null;
  const items = useMemo(() => [...(plan?.kpi_plan_items ?? [])].sort((a, b) => a.sort_order - b.sort_order), [plan]);
  const periods = useMemo(() => recentPeriods(plan?.period ?? "monthly"), [plan?.period]);
  const period = periods[periodIdx];

  const load = useCallback(async () => {
    if (!assignment || !plan) return;
    setLoading(true);
    const r = periodRange(period);
    const keys = items.filter(i => i.source_key && SOURCE_BY_KEY.has(i.source_key) && sourceAllowed(SOURCE_BY_KEY.get(i.source_key)!.grant)).map(i => i.source_key!);
    const [a, mv, ev, hist] = await Promise.all([
      computeActuals(supabase, employeeId, keys, r),
      supabase.from("kpi_manual_values").select("plan_item_id, value").eq("employee_id", employeeId).eq("period_start", period.from).eq("period_end", period.to).in("plan_item_id", items.map(i => i.id)),
      supabase.from("kpi_evaluations").select("id, status, overall, band, comments, snapshot, finalised_at").eq("assignment_id", assignment.id).eq("period_start", period.from).eq("period_end", period.to).maybeSingle(),
      supabase.from("kpi_evaluations").select("period_start, period_end, overall, band").eq("employee_id", employeeId).eq("status", "finalised").order("period_end", { ascending: false }).limit(12),
    ]);
    setHistory((hist.data || []) as typeof history);
    setActuals(a);
    const m = Object.fromEntries(((mv.data || []) as { plan_item_id: string; value: number }[]).map(x => [x.plan_item_id, Number(x.value)]));
    setManual(m);
    setDraftManual(Object.fromEntries(Object.entries(m).map(([k, v]) => [k, String(v)])));
    setEvaluation((ev.data as Evaluation) ?? null);
    setComments((ev.data as Evaluation | null)?.comments ?? "");
    setLoading(false);
  }, [assignment, plan, period, items, supabase, employeeId, sourceAllowed]);
  useEffect(() => { load(); }, [load]);

  if (assignment === undefined) return null;
  if (!assignment || !plan) {
    return canEnter ? (
      <div className="card p-4 mb-6 text-xs text-[#5f5f5d] flex items-center gap-2">
        <Gauge className="w-4 h-4" /> No KPI plan assigned. <Link href="/kpi" className="font-semibold underline text-[#1c1c1c]">Assign one on KPI Plans</Link>
      </div>
    ) : null;
  }

  // Live lines: one rule per plan item, keyed by item id.
  const rules: KpiRule[] = items.map(i => ({
    key: i.id, name: i.name, measurement: i.measurement, direction: i.direction, weight: Number(i.weight),
    target: assignment.target_overrides?.[i.id] ?? i.target, cap: i.cap, threshold: i.threshold, missing: i.missing_rule,
  }));
  const values: Record<string, number | null> = {};
  const notes: Record<string, string | null> = {};
  for (const i of items) {
    const src = i.source_key ? SOURCE_BY_KEY.get(i.source_key) : null;
    if (!i.source_key) { values[i.id] = manual[i.id] ?? null; notes[i.id] = manual[i.id] == null ? "Manual evaluation required" : "Manual"; }
    else if (!src) { values[i.id] = null; notes[i.id] = "Data source not configured"; }
    else if (!sourceAllowed(src.grant)) { values[i.id] = null; notes[i.id] = "No access to this data"; }
    else { values[i.id] = actuals[i.source_key] ?? null; notes[i.id] = values[i.id] == null ? "No data" : null; }
  }
  const result = scorePlan(rules, values);
  const liveLines: Line[] = items.map((i, n) => ({
    id: i.id, name: i.name, unit: i.unit, target: rules[n].target, weight: Number(i.weight),
    actual: result.items[n].actual, achievement: result.items[n].achievement, weighted: result.items[n].weighted,
    note: result.items[n].status === "no_target" ? "No target" : notes[i.id],
  }));
  const frozen = evaluation?.status === "finalised";
  const lines = frozen ? evaluation.snapshot.lines ?? [] : liveLines;
  const overall = frozen ? evaluation.overall : result.overall;
  const band = (frozen ? evaluation.band : result.band) as Band | null;
  const coverage = frozen ? evaluation.snapshot.coverage : result.coverage;

  async function saveManual() {
    const rows = items.filter(i => !i.source_key && draftManual[i.id] !== undefined && draftManual[i.id].trim() !== "")
      .map(i => ({ plan_item_id: i.id, employee_id: employeeId, period_start: period.from, period_end: period.to, value: Number(draftManual[i.id]) }));
    if (rows.some(r => !Number.isFinite(r.value))) return toast.error("Values must be numbers");
    if (rows.length === 0) return toast.error("Enter at least one value");
    setBusy(true);
    const { error } = await supabase.from("kpi_manual_values").upsert(rows, { onConflict: "plan_item_id,employee_id,period_start,period_end" });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Values saved");
    load();
  }
  async function saveEvaluation(status: "draft" | "finalised") {
    if (status === "finalised" && !window.confirm(`Finalise ${period.label}? The score is frozen and can't be changed afterwards.`)) return;
    setBusy(true);
    const row = {
      assignment_id: assignment!.id, employee_id: employeeId, period_start: period.from, period_end: period.to,
      snapshot: { lines: liveLines, overall: result.overall, band: result.band, coverage: result.coverage, plan: plan!.name, computed_at: new Date().toISOString() },
      overall: result.overall, band: result.band, comments: comments.trim(), status,
    };
    const { error } = await supabase.from("kpi_evaluations").upsert(row, { onConflict: "assignment_id,period_start,period_end" });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(status === "finalised" ? "Evaluation finalised" : "Evaluation saved");
    load();
  }

  const manualItems = items.filter(i => !i.source_key);
  return (
    <div className="card p-4 mb-6">
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <Gauge className="w-4 h-4 text-[#1c1c1c]" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold text-[#1c1c1c]">{plan.name}</div>
          <div className="text-[10px] text-[#5f5f5d]">KPI plan since {new Date(assignment.effective_from + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</div>
        </div>
        <select className="h-8 px-2 bg-white border border-[#ebece6] rounded-lg text-xs" value={periodIdx} onChange={e => setPeriodIdx(Number(e.target.value))} aria-label="Review period">
          {periods.map((p, i) => <option key={p.from} value={i}>{p.label}</option>)}
        </select>
      </div>

      {loading ? <div className="py-6 text-center text-gray-400"><Loader2 className="w-4 h-4 animate-spin mx-auto" /></div> : (
        <>
          <div className="flex flex-wrap items-end gap-4 mb-3">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-[#5f5f5d]">Overall score</div>
              <div className="text-3xl font-bold text-[#1c1c1c]">{overall == null ? "—" : `${overall}%`}</div>
            </div>
            {band && <span className={cn("text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full", BAND[band].cls)}>{BAND[band].label}</span>}
            <div className="text-[10px] text-[#5f5f5d]">
              {coverage != null && coverage < 100 ? `Based on ${coverage}% of the plan's weight; KPIs without data are left out, not counted as zero.` : overall == null ? "No KPI has data for this period yet." : "Every KPI has data."}
            </div>
            {frozen && <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase text-[#5f5f5d]"><Lock className="w-3 h-3" /> Finalised</span>}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr className="text-left text-[#5f5f5d]"><th className="py-1">KPI</th><th>Target</th><th>Actual</th><th>Achievement</th><th className="text-right">Weight</th><th className="text-right">Score</th></tr></thead>
              <tbody>
                {lines.map(l => (
                  <tr key={l.id} className="border-t border-[#ebece6]">
                    <td className="py-1.5 pr-2 font-semibold text-[#1c1c1c]">{l.name}</td>
                    <td className="pr-2">{fmt(l.target, l.unit)}</td>
                    <td className="pr-2">{l.actual != null ? fmt(l.actual, l.unit) : <span className="text-amber-700">{l.note ?? "No data"}</span>}</td>
                    <td className="pr-2">{l.achievement == null ? "—" : `${l.achievement}%`}</td>
                    <td className="text-right">{l.weight}</td>
                    <td className="text-right">{l.weighted ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {!frozen && canEnter && manualItems.length > 0 && (
            <div className="mt-4 border-t border-[#ebece6] pt-3">
              <div className="text-xs font-bold text-[#1c1c1c] mb-2">Manual KPIs for {period.label}</div>
              <div className="flex flex-wrap gap-3">
                {manualItems.map(i => (
                  <label key={i.id} className="text-[10px] text-[#5f5f5d]">{i.name}{i.unit ? ` (${i.unit})` : ""}<br />
                    {i.measurement === "boolean" ? (
                      <select className={input} value={draftManual[i.id] ?? ""} onChange={e => setDraftManual({ ...draftManual, [i.id]: e.target.value })}>
                        <option value="">—</option><option value="1">Yes</option><option value="0">No</option>
                      </select>
                    ) : (
                      <input className={input} inputMode="decimal" value={draftManual[i.id] ?? ""} onChange={e => setDraftManual({ ...draftManual, [i.id]: e.target.value })} />
                    )}
                  </label>
                ))}
              </div>
              <button onClick={saveManual} disabled={busy} className="mt-2 text-xs px-3 py-1.5 rounded-lg border border-[#ebece6] disabled:opacity-50">Save values</button>
            </div>
          )}

          {history.length > 0 && (
            <div className="mt-4 border-t border-[#ebece6] pt-3">
              <div className="text-xs font-bold text-[#1c1c1c] mb-2">Finalised history</div>
              <div className="flex flex-wrap gap-2">
                {history.map(h => (
                  <span key={h.period_start + h.period_end} className="text-[10px] px-2 py-1 rounded-lg border border-[#ebece6]">
                    {h.period_start} to {h.period_end}: <b>{h.overall == null ? "—" : `${h.overall}%`}</b>{h.band ? ` · ${BAND[h.band].label}` : ""}
                  </span>
                ))}
              </div>
            </div>
          )}

          {(canEnter || evaluation) && (
            <div className="mt-4 border-t border-[#ebece6] pt-3">
              <div className="text-xs font-bold text-[#1c1c1c] mb-2">Evaluation {evaluation ? `(${evaluation.status})` : ""}</div>
              {frozen || !canEnter ? (
                <p className="text-xs text-[#5f5f5d] whitespace-pre-wrap">{evaluation?.comments || "No comments."}</p>
              ) : (
                <>
                  <textarea className="w-full h-16 p-2 bg-white border border-[#ebece6] rounded-lg text-xs" maxLength={2000} placeholder="Manager comments" value={comments} onChange={e => setComments(e.target.value)} />
                  <div className="flex gap-2 mt-2">
                    <button onClick={() => saveEvaluation("draft")} disabled={busy} className="text-xs px-3 py-1.5 rounded-lg border border-[#ebece6] disabled:opacity-50">Save draft</button>
                    {canFinalise && <button onClick={() => saveEvaluation("finalised")} disabled={busy || result.overall == null} className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-[#1c1c1c] text-white disabled:opacity-50">Finalise</button>}
                  </div>
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
