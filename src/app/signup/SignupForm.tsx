"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase";
import type { Cycle, PublicPlan } from "@/lib/billing-server";
import { PlanPicker, priceOf } from "@/components/billing/PlanPicker";

const input = "w-full h-12 bg-[#fcfbf8] border border-[#eceae4] rounded-2xl px-4 text-sm text-[#1c1c1c] placeholder:text-[#1c1c1c]/35 focus:outline-none focus:ring-2 focus:ring-[#1c1c1c]/15 focus:border-[#1c1c1c]/40";
const label = "text-[10px] font-black text-[#1c1c1c] uppercase tracking-widest ml-1";

export default function SignupForm({ plans }: { plans: PublicPlan[] }) {
  const firstCycle: Cycle = plans.some((p) => p.monthly > 0) ? "monthly" : "yearly";
  const [cycle, setCycle] = useState<Cycle>(firstCycle);
  const [versionId, setVersionId] = useState(plans.find((p) => priceOf(p, firstCycle) > 0)!.versionId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    const res = await fetch("/api/billing/signup", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...f, versionId, cycle }),
    }).catch(() => null);
    const data = await res?.json().catch(() => ({}));
    if (!res?.ok) {
      setError(data?.error || "Something went wrong. Please try again.");
      setBusy(false);
      return;
    }
    const { error: signInError } = await createClient().auth.signInWithPassword({ email: f.email, password: f.password });
    window.location.href = signInError ? "/login" : "/billing";
  }

  return (
    <div className="min-h-screen bg-[#f7f4ed] flex items-center justify-center p-4 py-10">
      <div className="w-full max-w-[520px]">
        <div className="text-center mb-8">
          <img src="/logo-mark.png" alt="" className="w-12 h-12 rounded-full mx-auto mb-4" />
          <h1 className="text-2xl font-black text-[#1c1c1c] tracking-tight">Start your CodeCrest workspace</h1>
          <p className="text-sm text-[#5f5f5d] mt-2">Pick a plan, create your admin account, then set up auto-pay.</p>
        </div>
        <form onSubmit={submit} className="bg-white rounded-[2rem] p-6 sm:p-8 border border-[#eceae4] space-y-6">
          <PlanPicker plans={plans} versionId={versionId} cycle={cycle} onChange={(v, c) => { setVersionId(v); setCycle(c); }} />
          <div className="grid gap-4">
            <div className="space-y-2">
              <label htmlFor="su-org" className={label}>Company name</label>
              <input id="su-org" name="orgName" required minLength={2} maxLength={120} autoComplete="organization" className={input} />
            </div>
            <div className="space-y-2">
              <label htmlFor="su-name" className={label}>Your name</label>
              <input id="su-name" name="name" required maxLength={120} autoComplete="name" className={input} />
            </div>
            <div className="space-y-2">
              <label htmlFor="su-email" className={label}>Work email</label>
              <input id="su-email" name="email" type="email" required autoComplete="email" inputMode="email" className={input} />
            </div>
            <div className="space-y-2">
              <label htmlFor="su-password" className={label}>Password</label>
              <input id="su-password" name="password" type="password" required minLength={8} maxLength={72} autoComplete="new-password" className={input} />
              <p className="text-[11px] text-[#5f5f5d] ml-1">At least 8 characters.</p>
            </div>
            {/* Honeypot: hidden from people and screen readers. */}
            <input name="website" tabIndex={-1} autoComplete="off" aria-hidden className="hidden" />
          </div>
          {error && <p role="alert" className="text-sm text-red-700 bg-red-50 rounded-xl px-4 py-3">{error}</p>}
          <button type="submit" disabled={busy}
            className="w-full h-12 bg-[#1c1c1c] text-[#f7f4ed] font-black uppercase tracking-widest text-xs rounded-2xl disabled:opacity-50">
            {busy ? "Creating workspace…" : "Continue to payment"}
          </button>
          <p className="text-[11px] text-center text-[#5f5f5d]">
            Already have an account? <a href="/login" className="font-bold text-[#1c1c1c] underline underline-offset-2">Sign in</a>
          </p>
        </form>
      </div>
    </div>
  );
}
