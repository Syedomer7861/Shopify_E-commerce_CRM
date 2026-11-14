"use client";

import { useCallback, useEffect, useState } from "react";
import { CreditCard, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase";
import type { Cycle, PublicPlan } from "@/lib/billing-server";
import { PlanPicker, money, priceOf } from "@/components/billing/PlanPicker";

// Outside the (app) layout on purpose: a held workspace's members are locked
// out of every app page, and this is where they come to pay.

type Status = {
  enabled: boolean; isAdmin: boolean; orgName: string; hold: boolean; state: string | null;
  current: { plan: string; status: string; cycle: Cycle; currency: string; price: number; trialEndsAt: string | null; periodEnd: string; source: string } | null;
  picked: { code: string | null; cycle: Cycle } | null;
  plans: PublicPlan[];
};

type RazorpayResponse = { razorpay_payment_id: string; razorpay_subscription_id: string; razorpay_signature: string };
declare global { interface Window { Razorpay?: new (o: Record<string, unknown>) => { open: () => void } } }

const day = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

function loadCheckout() {
  return new Promise<void>((resolve, reject) => {
    if (window.Razorpay) return resolve();
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Could not load the payment window. Check your connection."));
    document.body.appendChild(s);
  });
}

const HOLD_TEXT: Record<string, string> = {
  pending: "Finish setting up auto-pay to open your workspace.",
  halted: "Your last payments failed, so your workspace is paused. Set up auto-pay again to restore access. Your data is safe.",
  cancelled: "Your subscription has ended. Subscribe again to restore access. Your data is safe.",
};

export default function BillingPage() {
  const [s, setS] = useState<Status | null>(null);
  const [loadError, setLoadError] = useState("");
  const [versionId, setVersionId] = useState("");
  const [cycle, setCycle] = useState<Cycle>("monthly");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [orgName, setOrgName] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/billing/status", { cache: "no-store" }).catch(() => null);
    if (!res?.ok) { setLoadError("Could not load billing. Please refresh."); return; }
    const data: Status = await res.json();
    setS(data);
    setOrgName(data.orgName);
    // A plan chosen on /pricing (Google sign-up) wins over the stored pick.
    const q = new URLSearchParams(window.location.search);
    const picked = q.get("plan") ? { code: q.get("plan"), cycle: (q.get("cycle") === "yearly" ? "yearly" : "monthly") as Cycle } : data.picked;
    const want = data.plans.find((p) => p.code === picked?.code && priceOf(p, picked!.cycle) > 0);
    const c = want ? picked!.cycle : data.plans.some((p) => p.monthly > 0) ? "monthly" : "yearly";
    setCycle(c);
    setVersionId(want?.versionId ?? data.plans.find((p) => priceOf(p, c) > 0)?.versionId ?? "");
  }, []);
  useEffect(() => { load(); }, [load]);

  async function pay() {
    setBusy(true); setMsg("");
    try {
      const res = await fetch("/api/billing/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ versionId, cycle, orgName: orgName.trim() }) });
      const ck = await res.json();
      if (!res.ok) throw new Error(ck.error || "Could not start the payment.");
      await loadCheckout();
      new window.Razorpay!({
        key: ck.keyId, subscription_id: ck.subscriptionId, name: "CodeCrest",
        description: ck.trialDays > 0 ? `${ck.planName}: ${ck.trialDays}-day free trial, then auto-pay` : `${ck.planName} subscription`,
        prefill: { email: ck.email }, notes: { org: ck.orgName }, theme: { color: "#1c1c1c" },
        modal: { ondismiss: () => setBusy(false) },
        handler: async (r: RazorpayResponse) => {
          setMsg("Confirming your payment…");
          const v = await fetch("/api/billing/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(r) });
          const vd = await v.json().catch(() => ({}));
          if (v.ok && vd.ok) { window.location.href = "/"; return; }
          setMsg(vd.error || "Payment received. Activation can take a minute; refresh this page shortly.");
          setBusy(false);
        },
      }).open();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Could not start the payment.");
      setBusy(false);
    }
  }

  async function cancel() {
    if (!confirm("Stop auto-pay? A paid period runs to its end; a free trial ends now.")) return;
    setBusy(true); setMsg("");
    const res = await fetch("/api/billing/cancel", { method: "POST" });
    const d = await res.json().catch(() => ({}));
    setMsg(res.ok ? (d.endsAt ? `Auto-pay stopped. Access continues until ${day(d.endsAt)}.` : "Auto-pay stopped.") : d.error || "Could not cancel.");
    setBusy(false);
    load();
  }

  async function signOut() { await createClient().auth.signOut(); window.location.href = "/login"; }

  const shell = (body: React.ReactNode) => (
    <div className="min-h-screen bg-[#f7f4ed] flex items-center justify-center p-4 py-10">
      <div className="w-full max-w-[520px] bg-white rounded-[2rem] p-6 sm:p-8 border border-[#eceae4] space-y-6">
        <div className="flex items-center gap-3">
          <CreditCard className="w-6 h-6 text-[#1c1c1c]" aria-hidden />
          <div className="min-w-0">
            <h1 className="text-lg font-black text-[#1c1c1c]">Billing</h1>
            {s?.orgName && <p className="text-xs text-[#5f5f5d] truncate">{s.orgName}</p>}
          </div>
        </div>
        {body}
        {msg && <p role="status" className="text-sm text-[#1c1c1c] bg-[#f7f4ed] rounded-xl px-4 py-3">{msg}</p>}
        <div className="flex justify-between text-xs">
          {!s?.hold ? <a href="/" className="font-bold text-[#1c1c1c] underline underline-offset-2 py-2">Back to workspace</a> : <span />}
          <button onClick={signOut} className="font-bold text-[#5f5f5d] hover:text-[#1c1c1c] py-2">Sign out</button>
        </div>
      </div>
    </div>
  );

  if (loadError) return shell(<p className="text-sm text-red-700">{loadError}</p>);
  if (!s) return shell(<div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-[#5f5f5d]" aria-label="Loading" /></div>);

  const live = s.current && !s.hold;
  return shell(
    <>
      {s.hold && <p className="text-sm text-[#1c1c1c] bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">{HOLD_TEXT[s.state ?? "pending"] ?? HOLD_TEXT.pending}</p>}
      {s.state === "past_due" && !s.hold && <p className="text-sm bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">A payment failed. Razorpay will retry automatically; please make sure your payment method has funds.</p>}

      {live && s.current && (
        <div className="rounded-2xl border border-[#eceae4] p-4 text-sm space-y-1">
          <div className="font-bold text-[#1c1c1c]">{s.current.plan} · <span className="capitalize">{s.current.cycle}</span></div>
          <div className="text-[#5f5f5d]">{money(s.current.price, s.current.currency)} per {s.current.cycle === "monthly" ? "month" : "year"}</div>
          <div className="text-[#5f5f5d]">
            {s.current.status === "trialing" && s.current.trialEndsAt ? `Free trial until ${day(s.current.trialEndsAt)}` : `Current period ends ${day(s.current.periodEnd)}`}
          </div>
          {s.current.source === "manual" && <div className="text-[#5f5f5d]">Billed by CodeCrest directly. Contact us to change your plan.</div>}
        </div>
      )}

      {!s.isAdmin ? (
        s.hold && <p className="text-sm text-[#5f5f5d]">Ask your organisation&apos;s admin to set up payment.</p>
      ) : !s.enabled ? (
        !live && <p className="text-sm text-[#5f5f5d]">Online payments are not open yet. <a href="/contact" className="font-bold underline">Contact us</a> to activate your workspace.</p>
      ) : live ? (
        s.current?.source === "razorpay" && (
          <button onClick={cancel} disabled={busy} className="h-11 px-5 rounded-xl border border-[#eceae4] text-sm font-bold text-[#1c1c1c] disabled:opacity-50">
            Stop auto-pay
          </button>
        )
      ) : s.plans.length === 0 ? (
        <p className="text-sm text-[#5f5f5d]">No plans are on offer right now. <a href="/contact" className="font-bold underline">Contact us</a>.</p>
      ) : (
        <>
          <PlanPicker plans={s.plans} versionId={versionId} cycle={cycle} onChange={(v, c) => { setVersionId(v); setCycle(c); }} />
          {s.state === "pending" && (
            <label className="block space-y-2">
              <span className="text-[10px] font-black text-[#1c1c1c] uppercase tracking-widest ml-1">Company name</span>
              <input value={orgName} onChange={(e) => setOrgName(e.target.value)} maxLength={120} autoComplete="organization"
                className="w-full h-12 bg-[#fcfbf8] border border-[#eceae4] rounded-2xl px-4 text-sm text-[#1c1c1c] focus:outline-none focus:ring-2 focus:ring-[#1c1c1c]/15" />
            </label>
          )}
          <button onClick={pay} disabled={busy || !versionId || (s.state === "pending" && orgName.trim().length < 2)}
            className="w-full h-12 bg-[#1c1c1c] text-[#f7f4ed] font-black uppercase tracking-widest text-xs rounded-2xl disabled:opacity-50">
            {busy ? "Opening payment…" : "Set up auto-pay"}
          </button>
          <p className="text-[11px] text-[#5f5f5d] text-center">Secure payment by Razorpay. You can stop auto-pay any time from this page.</p>
        </>
      )}
    </>
  );
}
