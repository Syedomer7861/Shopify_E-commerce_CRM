"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Ticket } from "lucide-react";
import toast from "react-hot-toast";
import { PageHeader, EmptyState } from "@/components/ui";
import { createClient } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { formatMinor, toMinor } from "@/lib/money";

type Coupon = {
  id: string; code: string; description: string; percent_off: number | null; amount_off_minor: number | null; currency: string | null;
  max_redemptions: number | null; redeemed_count: number; valid_until: string | null; is_active: boolean;
};

const input = "h-9 px-3 bg-white border border-[#eceae4] rounded-lg text-sm focus:outline-none focus:border-[#1c1c1c]/30";

export default function SuperAdminCoupons() {
  const supabase = useMemo(() => createClient(), []);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ code: "", description: "", kind: "percent", value: "", currency: "INR", max: "", until: "" });

  const load = useCallback(async () => {
    const { data, error } = await supabase.from("coupons").select("*").order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    setCoupons((data || []) as Coupon[]);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { load(); }, [load]);

  async function create() {
    const code = form.code.trim().toUpperCase();
    if (!/^[A-Z0-9][A-Z0-9_-]{1,39}$/.test(code)) return toast.error("Code: 2-40 letters, numbers, - or _");
    const percent = form.kind === "percent" ? Number(form.value) : null;
    const amount = form.kind === "amount" ? toMinor(form.value) : null;
    if (form.kind === "percent" && !(Number.isInteger(percent) && percent! >= 1 && percent! <= 100)) return toast.error("Percent must be 1 to 100");
    if (form.kind === "amount" && !amount) return toast.error("Enter an amount like 500 or 500.50");
    const max = form.max ? Number(form.max) : null;
    if (max != null && !(Number.isInteger(max) && max > 0)) return toast.error("Max uses must be a whole number");
    setBusy(true);
    const { error } = await supabase.rpc("platform_save_coupon", {
      p_code: code, p_description: form.description, p_percent: percent, p_amount: amount,
      p_currency: form.kind === "amount" ? form.currency : null, p_max: max,
      p_valid_until: form.until ? new Date(`${form.until}T23:59:59`).toISOString() : null, p_is_active: true,
    });
    setBusy(false);
    if (error) return toast.error(error.message.includes("duplicate") ? "That code exists" : error.message);
    toast.success("Coupon created");
    setForm({ ...form, code: "", description: "", value: "", max: "", until: "" });
    load();
  }

  async function toggle(c: Coupon) {
    const { error } = await supabase.rpc("platform_save_coupon", {
      p_code: c.code, p_description: null, p_percent: null, p_amount: null, p_currency: null, p_max: null, p_valid_until: null, p_is_active: !c.is_active,
    });
    if (error) return toast.error(error.message);
    setCoupons(prev => prev.map(x => (x.id === c.id ? { ...x, is_active: !c.is_active } : x)));
  }

  if (loading) return <div className="py-12 text-center text-gray-400"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>;

  return (
    <div>
      <PageHeader title="Coupons" subtitle="Discounts applied when you put an organisation on a plan. Terms can't be edited after creation; switch a coupon off and make a new one instead." />

      <div className="card p-4 mb-4 flex flex-wrap items-end gap-2">
        <label className="text-[10px] text-[#5f5f5d]">Code<br /><input className={cn(input, "w-36")} value={form.code} onChange={e => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="LAUNCH20" /></label>
        <label className="text-[10px] text-[#5f5f5d]">Type<br />
          <select className={cn(input, "w-32")} value={form.kind} onChange={e => setForm({ ...form, kind: e.target.value })}>
            <option value="percent">Percent off</option>
            <option value="amount">Amount off</option>
          </select>
        </label>
        <label className="text-[10px] text-[#5f5f5d]">{form.kind === "percent" ? "Percent" : "Amount"}<br /><input className={cn(input, "w-24")} value={form.value} onChange={e => setForm({ ...form, value: e.target.value })} inputMode="decimal" /></label>
        {form.kind === "amount" && <label className="text-[10px] text-[#5f5f5d]">Currency<br /><input className={cn(input, "w-20")} value={form.currency} onChange={e => setForm({ ...form, currency: e.target.value.toUpperCase() })} maxLength={3} /></label>}
        <label className="text-[10px] text-[#5f5f5d]">Max uses<br /><input className={cn(input, "w-24")} value={form.max} onChange={e => setForm({ ...form, max: e.target.value })} inputMode="numeric" placeholder="No limit" /></label>
        <label className="text-[10px] text-[#5f5f5d]">Valid until<br /><input type="date" className={cn(input, "w-40")} value={form.until} onChange={e => setForm({ ...form, until: e.target.value })} /></label>
        <label className="text-[10px] text-[#5f5f5d] flex-1 min-w-[160px]">Note<br /><input className={cn(input, "w-full")} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} maxLength={500} /></label>
        <button onClick={create} disabled={busy} className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg bg-[#1c1c1c] text-white disabled:opacity-50">
          <Plus className="w-3.5 h-3.5" /> Create
        </button>
      </div>

      {coupons.length === 0 ? (
        <EmptyState icon={<Ticket className="w-6 h-6" />} title="No coupons yet" desc="Create one above." />
      ) : (
        <div className="card divide-y divide-gray-50">
          {coupons.map(c => (
            <div key={c.id} className={cn("p-3 flex flex-wrap items-center gap-3 text-sm", !c.is_active && "opacity-60")}>
              <span className="font-mono font-bold text-[#1c1c1c] w-32">{c.code}</span>
              <span className="text-xs w-28">{c.percent_off ? `${c.percent_off}% off` : `${formatMinor(c.amount_off_minor, c.currency || "INR")} off`}</span>
              <span className="text-xs text-[#5f5f5d] w-28 tabular-nums">{c.redeemed_count}{c.max_redemptions ? ` / ${c.max_redemptions}` : ""} used</span>
              <span className="text-xs text-[#5f5f5d] w-36">{c.valid_until ? `Until ${new Date(c.valid_until).toLocaleDateString()}` : "No end date"}</span>
              <span className="text-xs text-[#5f5f5d] flex-1 min-w-0 truncate">{c.description}</span>
              <button onClick={() => toggle(c)} className="text-xs px-3 py-1.5 rounded-lg border border-[#eceae4] text-[#5f5f5d] hover:bg-[#f7f4ed]">
                {c.is_active ? "Switch off" : "Switch on"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
