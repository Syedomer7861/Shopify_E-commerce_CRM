"use client";

import { Check } from "lucide-react";
import type { Cycle, PublicPlan } from "@/lib/billing-server";

export const money = (minor: number, currency: string) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: minor % 100 ? 2 : 0 }).format(minor / 100);

export const priceOf = (p: PublicPlan, c: Cycle) => (c === "monthly" ? p.monthly : p.yearly);

/** Plan cards plus a monthly/yearly switch. Cycles a plan doesn't offer are hidden. */
export function PlanPicker({ plans, versionId, cycle, onChange }: {
  plans: PublicPlan[]; versionId: string; cycle: Cycle; onChange: (versionId: string, cycle: Cycle) => void;
}) {
  const cycles = (["monthly", "yearly"] as Cycle[]).filter((c) => plans.some((p) => priceOf(p, c) > 0));
  const shown = plans.filter((p) => priceOf(p, cycle) > 0);
  return (
    <div className="space-y-4">
      {cycles.length > 1 && (
        <div role="radiogroup" aria-label="Billing cycle" className="inline-flex p-1 rounded-2xl bg-[#f2efe7]">
          {cycles.map((c) => (
            <button key={c} type="button" role="radio" aria-checked={c === cycle}
              onClick={() => onChange(plans.find((p) => p.versionId === versionId && priceOf(p, c) > 0)?.versionId
                ?? plans.find((p) => priceOf(p, c) > 0)!.versionId, c)}
              className={`h-10 px-5 rounded-xl text-xs font-bold capitalize transition-colors ${c === cycle ? "bg-white text-[#1c1c1c] shadow-sm" : "text-[#5f5f5d]"}`}>
              {c}
            </button>
          ))}
        </div>
      )}
      <div role="radiogroup" aria-label="Plan" className="grid gap-3">
        {shown.map((p) => {
          const on = p.versionId === versionId;
          return (
            <button key={p.versionId} type="button" role="radio" aria-checked={on} onClick={() => onChange(p.versionId, cycle)}
              className={`text-left rounded-2xl border p-4 transition-colors ${on ? "border-[#1c1c1c] bg-[#fcfbf8]" : "border-[#eceae4] hover:border-[#1c1c1c]/30"}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 font-bold text-[#1c1c1c]">
                    {p.name}
                    {on && <Check className="w-4 h-4" aria-hidden />}
                  </div>
                  {p.description && <p className="text-xs text-[#5f5f5d] mt-1 line-clamp-2">{p.description}</p>}
                </div>
                <div className="text-right shrink-0">
                  <div className="font-black text-[#1c1c1c] tabular-nums">{money(priceOf(p, cycle), p.currency)}</div>
                  <div className="text-[11px] text-[#5f5f5d]">per {cycle === "monthly" ? "month" : "year"}</div>
                </div>
              </div>
              {p.trialDays > 0 && <div className="mt-2 text-[11px] font-bold text-emerald-700">{p.trialDays}-day free trial</div>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
