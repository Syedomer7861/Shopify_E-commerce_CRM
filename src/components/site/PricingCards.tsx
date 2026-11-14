"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import type { Cycle } from "@/lib/billing-server";
import type { PricingPlan } from "@/lib/pricing-server";
import { money, priceOf } from "@/components/billing/PlanPicker";

/** Plan cards with a monthly/yearly switch. Each card starts sign-up on that plan. */
export default function PricingCards({ plans, signupOpen }: { plans: PricingPlan[]; signupOpen: boolean }) {
  const cycles = (["monthly", "yearly"] as Cycle[]).filter((c) => plans.some((p) => priceOf(p, c) > 0));
  const [cycle, setCycle] = useState<Cycle>(cycles[0] ?? "monthly");
  // Yearly saving vs twelve monthly payments, shown when every plan has both.
  const saving = plans.every((p) => p.monthly > 0 && p.yearly > 0)
    ? Math.round(Math.min(...plans.map((p) => 1 - p.yearly / (p.monthly * 12))) * 100) : 0;

  return (
    <div>
      {cycles.length > 1 && (
        <div className="flex justify-center">
          <div role="radiogroup" aria-label="Billing cycle" className="inline-flex p-1 rounded-full bg-white border border-black/[0.07]">
            {cycles.map((c) => (
              <button key={c} type="button" role="radio" aria-checked={c === cycle} onClick={() => setCycle(c)}
                className={`h-10 px-5 rounded-full text-[13px] font-semibold capitalize transition-colors ${c === cycle ? "bg-[#111113] text-white" : "text-[#111113]/70"}`}>
                {c}{c === "yearly" && saving > 0 && <span className={`ml-1.5 text-[11px] ${c === cycle ? "text-[var(--mint)]" : "text-emerald-700"}`}>save {saving}%</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className={`mt-10 grid gap-5 ${plans.length >= 3 ? "lg:grid-cols-3" : plans.length === 2 ? "md:grid-cols-2 max-w-4xl mx-auto" : "max-w-md mx-auto"}`}>
        {plans.map((p) => {
          const price = priceOf(p, cycle);
          const href = signupOpen && price > 0 ? `/signup?plan=${encodeURIComponent(p.code)}&cycle=${cycle}` : "/contact";
          return (
            <div key={p.code} className={`relative flex flex-col rounded-[2rem] p-7 border ${p.featured ? "bg-[#111113] text-white border-[#111113] shadow-2xl shadow-black/20" : "bg-white border-black/[0.07]"}`}>
              {p.featured && <span className="absolute -top-3 left-7 rounded-full bg-[var(--lemon)] text-[#111113] text-[11px] font-bold uppercase tracking-wider px-3 py-1">Most popular</span>}
              <h3 className="font-display font-bold text-2xl tracking-tight">{p.name}</h3>
              {p.description && <p className={`mt-2 text-[14px] leading-relaxed ${p.featured ? "text-white/65" : "text-[var(--dim)]"}`}>{p.description}</p>}
              <div className="mt-6">
                {price > 0 ? (
                  <>
                    <span className="font-display font-bold text-4xl tracking-tight tabular-nums">{money(price, p.currency)}</span>
                    <span className={`ml-1 text-[14px] ${p.featured ? "text-white/60" : "text-[var(--dim)]"}`}>/ {cycle === "monthly" ? "month" : "year"}</span>
                  </>
                ) : <span className="font-display font-bold text-2xl">Talk to us</span>}
              </div>
              {p.trialDays > 0 && price > 0 && <p className={`mt-2 text-[13px] font-semibold ${p.featured ? "text-[var(--mint)]" : "text-emerald-700"}`}>{p.trialDays}-day free trial, then auto-pay</p>}
              <Link href={href}
                className={`group mt-6 inline-flex items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-semibold transition-colors ${p.featured ? "bg-white text-[#111113] hover:bg-white/90" : "bg-[#111113] text-white hover:bg-black"}`}>
                {href === "/contact" ? "Talk to us" : p.trialDays > 0 ? "Start free trial" : "Get started"}
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </Link>
              <ul className="mt-7 space-y-3 text-[14px]">
                  {[p.maxUsers == null ? "Unlimited team members" : `Up to ${p.maxUsers} team members`, ...p.highlights].map((h) => (
                    <li key={h} className="flex gap-2.5">
                      <Check className={`w-4 h-4 mt-0.5 shrink-0 ${p.featured ? "text-[var(--mint)]" : "text-emerald-600"}`} aria-hidden />
                      <span className={p.featured ? "text-white/85" : ""}>{h}</span>
                    </li>
                  ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
