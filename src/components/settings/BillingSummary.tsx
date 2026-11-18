"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { money } from "@/components/billing/PlanPicker";

type Status = {
  isAdmin: boolean; hold: boolean; state: string | null;
  current: { plan: string; status: string; cycle: "monthly" | "yearly"; currency: string; price: number; trialEndsAt: string | null; periodEnd: string; source: string } | null;
  seats: { limit: number | null; used: number } | null;
  payments: { id: string; amount: number; currency: string; status: string; paidAt: string }[];
};

const day = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

/** Settings > Plan & Billing: what the workspace is on, seats used, recent payments. Changes happen on /billing. */
export function BillingSummary() {
  const [s, setS] = useState<Status | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/billing/status", { cache: "no-store" })
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then(setS)
      .catch(() => setError("Could not load billing details. Please refresh."));
  }, []);

  if (error) return <div className="card p-6 text-sm text-red-700">{error}</div>;
  if (!s) return <div className="card p-6 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-[#5f5f5d]" aria-label="Loading" /></div>;

  const c = s.current;
  const statusText = !c ? "" : c.status === "trialing" && c.trialEndsAt ? `Free trial until ${day(c.trialEndsAt)}`
    : s.state === "past_due" ? "Payment failed, Razorpay is retrying" : `Renews ${day(c.periodEnd)}`;

  return (
    <div className="space-y-6">
      <div className="card p-6 space-y-4">
        <h3 className="text-[10px] font-bold text-[#1c1c1c] uppercase tracking-wider">Current plan</h3>
        {c ? (
          <div className="space-y-1 text-sm">
            <div className="text-xl font-bold text-[#1c1c1c]">{c.plan} <span className="text-sm font-medium text-[#5f5f5d] capitalize">· {c.cycle}</span></div>
            <div className="text-[#5f5f5d]">{money(c.price, c.currency)} per {c.cycle === "monthly" ? "month" : "year"}</div>
            <div className="text-[#5f5f5d]">{statusText}</div>
            <div className="text-[#5f5f5d]">{c.source === "razorpay" ? "Paid by auto-pay (Razorpay)" : "Billed by CodeCrest directly"}</div>
          </div>
        ) : (
          <p className="text-sm text-[#5f5f5d]">No subscription on file. Your workspace is set up by CodeCrest directly, so there is nothing to pay online.</p>
        )}
        {s.seats && (
          <div className="text-sm text-[#5f5f5d]">
            Team members: <span className="font-bold text-[#1c1c1c]">{s.seats.used}</span>{s.seats.limit != null ? ` of ${s.seats.limit}` : " (no limit)"}
          </div>
        )}
        {s.isAdmin && (
          <Link href="/billing" className="btn-primary inline-flex py-2.5 px-6 text-[10px] font-bold uppercase tracking-wider">
            {c ? "Manage billing" : "See plans"}
          </Link>
        )}
      </div>

      {s.isAdmin && (
        <div className="card p-6">
          <h3 className="text-[10px] font-bold text-[#1c1c1c] uppercase tracking-wider mb-3">Payments</h3>
          {s.payments.length === 0 ? <p className="text-sm text-[#5f5f5d]">No online payments yet.</p> : (
            <ul className="divide-y divide-[#ebece6] text-sm">
              {s.payments.map(p => (
                <li key={p.id} className="flex items-center justify-between py-2.5 gap-3">
                  <span className="text-[#5f5f5d]">{day(p.paidAt)}</span>
                  <span className="capitalize text-[#5f5f5d]">{p.status}</span>
                  <span className="font-bold text-[#1c1c1c] tabular-nums">{money(p.amount, p.currency)}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="text-[11px] text-[#9a9a94] mt-3">Razorpay emails a receipt for every payment.</p>
        </div>
      )}
    </div>
  );
}
