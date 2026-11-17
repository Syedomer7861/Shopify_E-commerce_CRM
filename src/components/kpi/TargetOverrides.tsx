"use client";
import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import { ActionButton } from "@/components/ui";
import { createClient } from "@/lib/supabase";

type Item = { id: string; name: string; unit: string; target: number | null; direction: "higher" | "lower" };

/**
 * Per-employee targets for one assignment. Stored in kpi_assignments.target_overrides
 * ({ plan_item_id: target }), which the scorecard already reads; blank means "use the
 * plan's target". RLS decides who may save (kpi managers in scope; approvers for active plans).
 */
export function TargetOverrides({ assignmentId, planId, person, initial, onDone }: {
  assignmentId: string; planId: string; person: string; initial: Record<string, number>; onDone: (saved: boolean) => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [items, setItems] = useState<Item[] | null>(null);
  const [vals, setVals] = useState<Record<string, string>>(() =>
    Object.fromEntries(Object.entries(initial || {}).map(([k, v]) => [k, String(v)])));

  useEffect(() => {
    supabase.from("kpi_plan_items").select("id, name, unit, target, direction").eq("plan_id", planId).order("sort_order")
      .then(({ data, error }) => {
        if (error) toast.error(error.message);
        setItems((data || []) as Item[]);
      });
  }, [supabase, planId]);

  const bad = Object.entries(vals).filter(([, v]) => v.trim() !== "" && !(Number.isFinite(Number(v)) && Number(v) >= 0)).map(([k]) => k);

  async function save() {
    if (bad.length) return toast.error("Targets must be numbers of 0 or more");
    // Only keep overrides for items still on the plan; blank clears the override.
    const next: Record<string, number> = {};
    for (const it of items || []) {
      const v = vals[it.id]?.trim();
      if (v) next[it.id] = Number(v);
    }
    const { error } = await supabase.from("kpi_assignments").update({ target_overrides: next }).eq("id", assignmentId);
    if (error) return toast.error(error.message);
    toast.success(Object.keys(next).length ? `Personal targets saved for ${person}` : `${person} now uses the plan's targets`);
    onDone(true);
  }

  return (
    <div className="card p-4 space-y-3">
      <div>
        <div className="text-sm font-bold text-[#1c1c1c]">Personal targets · {person}</div>
        <p className="text-xs text-[#6b6b67] mt-0.5">Leave a box empty to use the plan&apos;s target. Changes apply to scores not yet finalised.</p>
      </div>
      {!items ? (
        <div className="py-6 text-center text-[#9a9a94]"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>
      ) : items.length === 0 ? (
        <p className="text-xs text-[#6b6b67]">This plan has no KPIs.</p>
      ) : (
        <div className="divide-y divide-[#ebece6] border border-[#ebece6] rounded-xl">
          {items.map(it => (
            <label key={it.id} className="flex flex-wrap items-center gap-2 px-3 py-2.5">
              <span className="flex-1 min-w-[140px]">
                <span className="block text-sm font-semibold text-[#1c1c1c]">{it.name}</span>
                <span className="block text-xs text-[#6b6b67]">
                  Plan target: {it.target ?? "not set"}{it.unit ? ` ${it.unit}` : ""} · {it.direction === "lower" ? "lower is better" : "higher is better"}
                </span>
              </span>
              <input
                type="number" inputMode="decimal" min={0} step="any"
                aria-label={`Personal target for ${it.name}`}
                placeholder={it.target != null ? String(it.target) : "Plan target"}
                className={"input w-32 text-sm" + (bad.includes(it.id) ? " !border-[#e0604f]" : "")}
                value={vals[it.id] ?? ""}
                onChange={e => setVals(v => ({ ...v, [it.id]: e.target.value }))}
              />
            </label>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <ActionButton className="btn-primary text-xs" disabled={!items || items.length === 0} onClick={save}>Save targets</ActionButton>
        <button type="button" className="btn-secondary text-xs" onClick={() => onDone(false)}>Cancel</button>
      </div>
    </div>
  );
}
