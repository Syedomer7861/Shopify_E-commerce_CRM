"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import { createClient } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { formatMinor } from "@/lib/money";

type Sub = {
  id: string; status: "trialing" | "active" | "cancelled"; billing_cycle: "monthly" | "yearly"; currency: string;
  list_price_minor: number; discount_minor: number; price_minor: number; trial_ends_at: string | null;
  current_period_start: string; current_period_end: string; created_at: string; source: "manual" | "razorpay"; cancelled_at: string | null; cancel_reason: string | null;
  plan_version: { version: number; plan: { name: string; code: string } | null } | null;
};
type Option = { id: string; label: string; trial_days: number };

const input = "h-9 px-3 bg-white border border-[#eceae4] rounded-lg text-sm focus:outline-none focus:border-[#1c1c1c]/30";
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString() : "—");

/** One organisation's subscription: current, history, assign, cancel. Self-serve (Razorpay) ones have their auto-debit stopped first. */
export function SubscriptionPanel({ orgId }: { orgId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [subs, setSubs] = useState<Sub[] | null>(null);
  const [options, setOptions] = useState<Option[]>([]);
  const [form, setForm] = useState({ version: "", cycle: "monthly", trial: "", coupon: "", notes: "" });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [s, v] = await Promise.all([
      supabase.from("org_subscriptions")
        .select("*, plan_version:plan_versions(version, plan:subscription_plans(name, code))")
        .eq("org_id", orgId).order("created_at", { ascending: false }),
      supabase.from("plan_versions")
        .select("id, plan_id, version, currency, price_monthly_minor, price_yearly_minor, trial_days, plan:subscription_plans!inner(name, is_active)")
        .eq("plan.is_active", true).order("version", { ascending: false }),
    ]);
    if (s.error) toast.error(s.error.message);
    setSubs((s.data || []) as unknown as Sub[]);
    // Latest version of each plan only.
    const seen = new Set<string>();
    const opts: Option[] = [];
    for (const r of (v.data || []) as unknown as { id: string; plan_id: string; version: number; currency: string; price_monthly_minor: number; price_yearly_minor: number; trial_days: number; plan: { name: string } }[]) {
      if (seen.has(r.plan_id)) continue;
      seen.add(r.plan_id);
      opts.push({ id: r.id, trial_days: r.trial_days, label: `${r.plan.name} v${r.version}: ${formatMinor(r.price_monthly_minor, r.currency)}/mo, ${formatMinor(r.price_yearly_minor, r.currency)}/yr` });
    }
    setOptions(opts);
  }, [supabase, orgId]);

  useEffect(() => { load(); }, [load]);

  const current = subs?.find(s => s.status !== "cancelled");

  /** Stops a self-serve subscription's Razorpay auto-debit. False if the owner should not continue. */
  async function stopAutoDebit(sub: Sub) {
    if (sub.source !== "razorpay") return true;
    const res = await fetch("/api/superadmin/billing/stop-autodebit", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subscriptionId: sub.id }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) { toast.error(d.error || "Could not stop auto-debit"); return false; }
    return true;
  }
  const history = subs?.filter(s => s !== current) || [];

  async function assign() {
    if (!form.version) return toast.error("Pick a plan");
    const trial = form.trial === "" ? null : Number(form.trial);
    if (trial != null && !(Number.isInteger(trial) && trial >= 0 && trial <= 365)) return toast.error("Trial must be 0 to 365 days");
    if (!window.confirm(current ? `Replace the current subscription? It will be cancelled${current.source === "razorpay" ? " and its Razorpay auto-debit stopped" : ""}.` : "Put this organisation on the selected plan?")) return;
    setBusy(true);
    if (current && !(await stopAutoDebit(current))) { setBusy(false); return; }
    const { error } = await supabase.rpc("platform_assign_subscription", {
      p_org: orgId, p_version: form.version, p_cycle: form.cycle, p_trial_days: trial, p_coupon: form.coupon || null, p_notes: form.notes,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Subscription saved");
    setForm({ version: "", cycle: "monthly", trial: "", coupon: "", notes: "" });
    load();
  }

  async function cancel() {
    if (!current) return;
    const reason = window.prompt(current.source === "razorpay"
      ? "This stops the customer's Razorpay auto-debit now and pauses their workspace. Reason (kept in the record):"
      : "Reason for cancelling (kept in the record):");
    if (reason === null) return;
    setBusy(true);
    if (!(await stopAutoDebit(current))) { setBusy(false); return; }
    const { error } = await supabase.rpc("platform_cancel_subscription", { p_subscription: current.id, p_reason: reason });
    setBusy(false);
    // Razorpay's "cancelled" webhook can close a self-serve row first; that is not a failure.
    if (error && !(current.source === "razorpay" && error.code === "P0002")) return toast.error(error.message);
    toast.success("Subscription cancelled");
    load();
  }

  if (!subs) return <div className="card p-4"><Loader2 className="w-4 h-4 animate-spin text-gray-400" /></div>;

  const trialOver = current?.status === "trialing" && current.trial_ends_at && new Date(current.trial_ends_at) < new Date();

  return (
    <div className="card p-4 space-y-4">
      <div className="text-[10px] font-bold uppercase tracking-widest text-[#5f5f5d]">Subscription</div>
      {current ? (
        <div className="flex flex-wrap items-start gap-4">
          <div className="flex-1 min-w-0 text-sm">
            <div className="font-bold text-[#1c1c1c]">
              {current.plan_version?.plan?.name} <span className="font-normal text-xs text-[#5f5f5d]">v{current.plan_version?.version} · {current.billing_cycle}{current.source === "razorpay" ? " · Razorpay auto-pay" : ""}</span>
            </div>
            <div className="text-xs text-[#5f5f5d] mt-1">
              {formatMinor(current.price_minor, current.currency)} per {current.billing_cycle === "monthly" ? "month" : "year"}
              {current.discount_minor > 0 && ` (list ${formatMinor(current.list_price_minor, current.currency)}, coupon ${formatMinor(current.discount_minor, current.currency)} off)`}
            </div>
            <div className="text-xs text-[#5f5f5d] mt-1">
              {current.status === "trialing" ? `Trial ends ${day(current.trial_ends_at)}` : `Period ${day(current.current_period_start)} to ${day(current.current_period_end)}`}
            </div>
          </div>
          <span className={cn("text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full",
            trialOver ? "bg-amber-50 text-amber-700" : current.status === "trialing" ? "bg-blue-50 text-blue-700" : "bg-emerald-50 text-emerald-700")}>
            {trialOver ? "Trial ended" : current.status === "trialing" ? "Trial" : "Active"}
          </span>
          <button onClick={cancel} disabled={busy} className="text-xs px-3 py-1.5 rounded-lg border border-rose-100 text-rose-600 hover:bg-rose-50">Cancel</button>
        </div>
      ) : <p className="text-sm text-[#5f5f5d]">No subscription.</p>}

      <div className="border-t border-[#eceae4] pt-3 flex flex-wrap items-end gap-2">
        {options.length === 0 ? <p className="text-xs text-[#5f5f5d]">Publish a price on the Plans page first.</p> : (
          <>
            <label className="text-[10px] text-[#5f5f5d] flex-1 min-w-[220px]">{current ? "Change plan" : "Put on plan"}<br />
              <select className={cn(input, "w-full")} value={form.version}
                onChange={e => setForm({ ...form, version: e.target.value, trial: String(options.find(o => o.id === e.target.value)?.trial_days ?? "") })}>
                <option value="">Choose...</option>
                {options.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
            </label>
            <label className="text-[10px] text-[#5f5f5d]">Billing<br />
              <select className={cn(input, "w-28")} value={form.cycle} onChange={e => setForm({ ...form, cycle: e.target.value })}>
                <option value="monthly">Monthly</option>
                <option value="yearly">Yearly</option>
              </select>
            </label>
            <label className="text-[10px] text-[#5f5f5d]">Trial days<br /><input className={cn(input, "w-20")} value={form.trial} onChange={e => setForm({ ...form, trial: e.target.value })} inputMode="numeric" /></label>
            <label className="text-[10px] text-[#5f5f5d]">Coupon<br /><input className={cn(input, "w-28")} value={form.coupon} onChange={e => setForm({ ...form, coupon: e.target.value.toUpperCase() })} /></label>
            <label className="text-[10px] text-[#5f5f5d] w-full">Note<br /><input className={cn(input, "w-full")} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} maxLength={2000} /></label>
            <button onClick={assign} disabled={busy} className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg bg-[#1c1c1c] text-white disabled:opacity-50">
              {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Save subscription
            </button>
          </>
        )}
      </div>

      {history.length > 0 && (
        <div className="border-t border-[#eceae4] pt-3">
          <div className="text-[10px] font-bold uppercase tracking-widest text-[#5f5f5d] mb-2">History</div>
          {history.map(h => (
            <div key={h.id} className="text-xs text-[#5f5f5d] py-1">
              {day(h.created_at)} to {day(h.cancelled_at)}: {h.plan_version?.plan?.name} v{h.plan_version?.version}, {formatMinor(h.price_minor, h.currency)}/{h.billing_cycle === "monthly" ? "mo" : "yr"}{h.cancel_reason ? ` · ${h.cancel_reason}` : ""}
            </div>
          ))}
        </div>
      )}
      <p className="text-[10px] text-[#5f5f5d]">Recorded only. Nothing is charged and access is not limited until payments are connected.</p>
    </div>
  );
}
