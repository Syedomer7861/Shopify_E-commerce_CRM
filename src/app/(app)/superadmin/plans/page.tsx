"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Tag } from "lucide-react";
import toast from "react-hot-toast";
import { PageHeader, EmptyState } from "@/components/ui";
import { createClient } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { formatMinor, toMinor } from "@/lib/money";

type Version = { id: string; plan_id: string; version: number; currency: string; price_monthly_minor: number; price_yearly_minor: number; trial_days: number; published_at: string };
type Plan = { id: string; code: string; name: string; description: string; is_public: boolean; is_active: boolean; sort_order: number; max_users: number | null };

const input = "h-9 px-3 bg-white border border-[#eceae4] rounded-lg text-sm focus:outline-none focus:border-[#1c1c1c]/30";
const btn = "inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg bg-[#1c1c1c] text-white disabled:opacity-50";

function SeatLimit({ plan, onDone }: { plan: Plan; onDone: () => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [value, setValue] = useState(plan.max_users == null ? "" : String(plan.max_users));
  const [busy, setBusy] = useState(false);
  async function save() {
    const n = value.trim() === "" ? null : Number(value);
    if (n !== null && (!Number.isInteger(n) || n < 1 || n > 100000)) return toast.error("Seats must be a whole number from 1, or empty for unlimited");
    setBusy(true);
    const { error } = await supabase.rpc("platform_set_plan_limits", { p_plan: plan.id, p_max_users: n });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(`${plan.name}: ${n == null ? "unlimited" : n} team members`);
    onDone();
  }
  return (
    <label className="text-[10px] text-[#5f5f5d]">Team members (empty = unlimited)<br />
      <span className="inline-flex gap-1">
        <input className={cn(input, "w-24")} value={value} onChange={e => setValue(e.target.value)} inputMode="numeric" placeholder="Unlimited" />
        <button onClick={save} disabled={busy} className="text-xs font-semibold px-2 rounded-lg border border-[#eceae4] disabled:opacity-50">Save</button>
      </span>
    </label>
  );
}

function PriceForm({ plan, onDone }: { plan: Plan; onDone: () => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [currency, setCurrency] = useState("INR");
  const [monthly, setMonthly] = useState("");
  const [yearly, setYearly] = useState("");
  const [trial, setTrial] = useState("0");
  const [busy, setBusy] = useState(false);

  async function publish() {
    const m = toMinor(monthly), y = toMinor(yearly), t = Number(trial);
    if (m == null || y == null) return toast.error("Enter prices like 1499 or 1499.50");
    if (!Number.isInteger(t) || t < 0 || t > 365) return toast.error("Trial must be 0 to 365 days");
    if (!/^[A-Z]{3}$/.test(currency)) return toast.error("Currency is a 3-letter code, e.g. INR");
    if (!window.confirm(`Publish ${formatMinor(m, currency)}/month and ${formatMinor(y, currency)}/year for ${plan.name}? Existing subscriptions keep their current price.`)) return;
    setBusy(true);
    const { error } = await supabase.rpc("platform_publish_plan_version", { p_plan: plan.id, p_currency: currency, p_monthly: m, p_yearly: y, p_trial_days: t });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("New price published");
    setMonthly(""); setYearly("");
    onDone();
  }

  return (
    <div className="flex flex-wrap items-end gap-2 mt-3 pt-3 border-t border-[#eceae4]">
      <label className="text-[10px] text-[#5f5f5d]">Currency<br /><input className={cn(input, "w-20")} value={currency} onChange={e => setCurrency(e.target.value.toUpperCase())} maxLength={3} /></label>
      <label className="text-[10px] text-[#5f5f5d]">Monthly<br /><input className={cn(input, "w-28")} value={monthly} onChange={e => setMonthly(e.target.value)} inputMode="decimal" placeholder="0.00" /></label>
      <label className="text-[10px] text-[#5f5f5d]">Yearly<br /><input className={cn(input, "w-28")} value={yearly} onChange={e => setYearly(e.target.value)} inputMode="decimal" placeholder="0.00" /></label>
      <label className="text-[10px] text-[#5f5f5d]">Trial days<br /><input className={cn(input, "w-20")} value={trial} onChange={e => setTrial(e.target.value)} inputMode="numeric" /></label>
      <button onClick={publish} disabled={busy} className={btn}>{busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Tag className="w-3.5 h-3.5" />} Publish price</button>
    </div>
  );
}

export default function SuperAdminPlans() {
  const supabase = useMemo(() => createClient(), []);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [versions, setVersions] = useState<Version[]>([]);
  const [loading, setLoading] = useState(true);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [p, v] = await Promise.all([
      supabase.from("subscription_plans").select("*").order("sort_order").order("created_at"),
      supabase.from("plan_versions").select("*").order("version", { ascending: false }),
    ]);
    if (p.error) toast.error(p.error.message);
    setPlans((p.data || []) as Plan[]);
    setVersions((v.data || []) as Version[]);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { load(); }, [load]);

  async function save(plan: Plan | null, patch: Partial<Plan> = {}) {
    setBusy(true);
    const next = plan ? { ...plan, ...patch } : null;
    const { error } = await supabase.rpc("platform_save_plan", next ? {
      p_id: next.id, p_code: next.code, p_name: next.name, p_description: next.description,
      p_is_public: next.is_public, p_is_active: next.is_active, p_sort: next.sort_order,
    } : { p_id: null, p_code: code, p_name: name, p_description: "", p_is_public: false, p_is_active: true, p_sort: plans.length });
    setBusy(false);
    if (error) return toast.error(error.message);
    if (!plan) { setCode(""); setName(""); toast.success("Plan created. Publish a price next."); }
    load();
  }

  if (loading) return <div className="py-12 text-center text-gray-400"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>;

  return (
    <div>
      <PageHeader title="Plans" subtitle="Plans and their prices. A price change publishes a new version; organisations already on a plan keep the price they signed up at." />

      <div className="card p-4 mb-4 flex flex-wrap items-end gap-2">
        <label className="text-[10px] text-[#5f5f5d]">Code (fixed once created)<br />
          <input className={cn(input, "w-40")} value={code} onChange={e => setCode(e.target.value.toLowerCase())} placeholder="growth" maxLength={20} /></label>
        <label className="text-[10px] text-[#5f5f5d] flex-1 min-w-[160px]">Name<br />
          <input className={cn(input, "w-full")} value={name} onChange={e => setName(e.target.value)} placeholder="Growth" maxLength={80} /></label>
        <button onClick={() => save(null)} disabled={busy || !code.trim() || !name.trim()} className={btn}><Plus className="w-3.5 h-3.5" /> New plan</button>
      </div>

      {plans.length === 0 ? (
        <EmptyState icon={<Tag className="w-6 h-6" />} title="No plans yet" desc="Create one above, then publish its price." />
      ) : (
        <div className="space-y-3">
          {plans.map(p => {
            const vs = versions.filter(v => v.plan_id === p.id);
            const cur = vs[0];
            return (
              <div key={p.id} className={cn("card p-4", !p.is_active && "opacity-60")}>
                <div className="flex flex-wrap items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-[#1c1c1c]">{p.name} <span className="text-[11px] font-normal text-[#5f5f5d]">{p.code}</span></div>
                    <div className="text-xs text-[#5f5f5d] mt-1">
                      {cur ? <>v{cur.version}: {formatMinor(cur.price_monthly_minor, cur.currency)}/month · {formatMinor(cur.price_yearly_minor, cur.currency)}/year{cur.trial_days ? ` · ${cur.trial_days}-day trial` : ""}</> : "No price published yet"}
                    </div>
                    {vs.length > 1 && <div className="text-[10px] text-[#5f5f5d] mt-1">{vs.length - 1} earlier version(s) kept for existing subscriptions</div>}
                  </div>
                  <label className="flex items-center gap-1.5 text-xs text-[#5f5f5d]">
                    <input type="checkbox" checked={p.is_public} disabled={busy} onChange={e => save(p, { is_public: e.target.checked })} /> Public
                  </label>
                  <label className="flex items-center gap-1.5 text-xs text-[#5f5f5d]">
                    <input type="checkbox" checked={p.is_active} disabled={busy} onChange={e => save(p, { is_active: e.target.checked })} /> Can be sold
                  </label>
                </div>
                <div className="mt-3"><SeatLimit plan={p} onDone={load} /></div>
                <PriceForm plan={p} onDone={load} />
              </div>
            );
          })}
        </div>
      )}
      <p className="text-[11px] text-[#5f5f5d] mt-4">&quot;Public&quot; plans with a price show on /pricing and can be bought by sign-up. Card text and comparison rows are in Pricing page; modules per plan are in Modules.</p>
    </div>
  );
}
