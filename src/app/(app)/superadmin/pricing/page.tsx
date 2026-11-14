"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ExternalLink, Loader2, Plus, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import { PageHeader } from "@/components/ui";
import { createClient } from "@/lib/supabase";
import { cn } from "@/lib/utils";

type Plan = { id: string; code: string; name: string; description: string; highlights: string[] | null; is_featured: boolean | null; is_public: boolean; sort_order: number };
type Row = { id: string | null; section: string; label: string; plan_values: Record<string, string>; sort_order: number };

const input = "h-9 px-3 bg-white border border-[#eceae4] rounded-lg text-sm focus:outline-none focus:border-[#1c1c1c]/30";
const btn = "inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg bg-[#1c1c1c] text-white disabled:opacity-50";

function PlanCard({ plan, onSaved }: { plan: Plan; onSaved: () => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [description, setDescription] = useState(plan.description);
  const [highlights, setHighlights] = useState((plan.highlights || []).join("\n"));
  const [featured, setFeatured] = useState(!!plan.is_featured);
  const [busy, setBusy] = useState(false);

  async function save() {
    const list = highlights.split("\n").map(h => h.trim()).filter(Boolean);
    if (list.length > 12) return toast.error("Up to 12 highlights");
    setBusy(true);
    const { error } = await supabase.rpc("platform_set_plan_marketing", { p_plan: plan.id, p_description: description.trim(), p_highlights: list, p_featured: featured });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(`${plan.name} saved`);
    onSaved();
  }

  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <span className="font-bold text-[#1c1c1c]">{plan.name}</span>
        <span className="text-[11px] text-[#5f5f5d]">{plan.code}</span>
        {!plan.is_public && <span className="text-[10px] font-bold uppercase text-amber-600">Not public</span>}
      </div>
      <label className="block text-[10px] text-[#5f5f5d]">One-line description (under the plan name)
        <input className={cn(input, "w-full mt-1")} maxLength={300} value={description} onChange={e => setDescription(e.target.value)} placeholder="For small teams getting started" />
      </label>
      <label className="block text-[10px] text-[#5f5f5d]">Highlights, one per line (tick list on the card)
        <textarea className={cn(input, "w-full h-28 py-2 mt-1")} value={highlights} onChange={e => setHighlights(e.target.value)} placeholder={"Up to 5 users\nLeads and deals\nEmail support"} />
      </label>
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 text-xs text-[#5f5f5d]">
          <input type="checkbox" checked={featured} onChange={e => setFeatured(e.target.checked)} /> Show as &quot;Most popular&quot;
        </label>
        <button onClick={save} disabled={busy} className={btn}>{busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Save</button>
      </div>
    </div>
  );
}

export default function SuperAdminPricing() {
  const supabase = useMemo(() => createClient(), []);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [p, r] = await Promise.all([
      supabase.from("subscription_plans").select("id, code, name, description, highlights, is_featured, is_public, sort_order").eq("is_active", true).order("sort_order"),
      supabase.from("platform_pricing_rows").select("*").order("sort_order").order("label"),
    ]);
    if (p.error) toast.error(p.error.message);
    if (r.error) toast.error(r.error.message);
    setPlans((p.data || []) as Plan[]);
    setRows((r.data || []) as Row[]);
    setLoading(false);
  }, [supabase]);
  useEffect(() => { load(); }, [load]);

  const edit = (i: number, patch: Partial<Row>) => setRows(rs => rs.map((r, j) => j === i ? { ...r, ...patch } : r));

  async function saveRow(r: Row) {
    if (!r.label.trim()) return toast.error("Give the row a name");
    setBusy(true);
    const values = Object.fromEntries(Object.entries(r.plan_values).map(([k, v]) => [k, v.trim()]).filter(([, v]) => v));
    const { error } = await supabase.rpc("platform_save_pricing_row", { p_id: r.id, p_section: r.section, p_label: r.label, p_values: values, p_sort: r.sort_order });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Row saved");
    load();
  }

  async function removeRow(r: Row) {
    if (!r.id) return setRows(rs => rs.filter(x => x !== r));
    if (!window.confirm(`Delete "${r.label}" from the comparison?`)) return;
    const { error } = await supabase.rpc("platform_delete_pricing_row", { p_id: r.id });
    if (error) return toast.error(error.message);
    load();
  }

  if (loading) return <div className="py-12 text-center text-gray-400"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>;

  return (
    <div>
      <PageHeader title="Pricing page" subtitle="What visitors see on /pricing. Prices come from Plans; which modules each plan includes comes from Modules." />
      <div className="flex flex-wrap gap-2 mb-6 text-xs">
        <a href="/pricing" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-[#eceae4]">Open /pricing <ExternalLink className="w-3 h-3" /></a>
        <Link href="/superadmin/plans" className="px-3 py-2 rounded-lg border border-[#eceae4]">Edit prices</Link>
        <Link href="/superadmin/modules" className="px-3 py-2 rounded-lg border border-[#eceae4]">Choose modules per plan</Link>
      </div>

      <h2 className="text-sm font-bold text-[#1c1c1c] mb-3">Plan cards</h2>
      <div className="grid gap-3 lg:grid-cols-3 mb-8">
        {plans.map(p => <PlanCard key={p.id} plan={p} onSaved={load} />)}
      </div>

      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-bold text-[#1c1c1c]">Extra comparison rows</h2>
        <button className={btn} onClick={() => setRows(rs => [...rs, { id: null, section: "Plan details", label: "", plan_values: {}, sort_order: rs.length }])}>
          <Plus className="w-3.5 h-3.5" /> Add row
        </button>
      </div>
      <p className="text-[11px] text-[#5f5f5d] mb-3">Per plan, type <b>yes</b> for a tick, leave empty or type <b>no</b> for a dash, or any short text (e.g. &quot;5 users&quot;, &quot;Priority&quot;). Rows with the same section are grouped.</p>
      <div className="card overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-[#5f5f5d] text-left">
              <th className="p-2">Section</th><th className="p-2">Row</th>
              {plans.map(p => <th key={p.code} className="p-2">{p.name}</th>)}
              <th className="p-2">Order</th><th className="p-2" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={plans.length + 4} className="p-4 text-xs text-[#5f5f5d]">No extra rows. The comparison still lists modules per plan.</td></tr>}
            {rows.map((r, i) => (
              <tr key={r.id ?? `new-${i}`} className="border-t border-[#eceae4]">
                <td className="p-2"><input className={cn(input, "w-32")} maxLength={60} value={r.section} onChange={e => edit(i, { section: e.target.value })} /></td>
                <td className="p-2"><input className={cn(input, "w-44")} maxLength={120} value={r.label} onChange={e => edit(i, { label: e.target.value })} placeholder="Users included" /></td>
                {plans.map(p => (
                  <td key={p.code} className="p-2"><input className={cn(input, "w-28")} maxLength={80} value={r.plan_values[p.code] ?? ""}
                    onChange={e => edit(i, { plan_values: { ...r.plan_values, [p.code]: e.target.value } })} /></td>
                ))}
                <td className="p-2"><input type="number" className={cn(input, "w-16")} value={r.sort_order} onChange={e => edit(i, { sort_order: Number(e.target.value) || 0 })} /></td>
                <td className="p-2 whitespace-nowrap">
                  <button onClick={() => saveRow(r)} disabled={busy} className="text-xs font-semibold px-2 py-1 rounded-lg border border-[#eceae4] disabled:opacity-50">Save</button>
                  <button onClick={() => removeRow(r)} aria-label="Delete row" className="ml-1 p-1 text-rose-600"><Trash2 className="w-3.5 h-3.5" /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-[#5f5f5d] mt-4">Changes show on /pricing within a minute.</p>
    </div>
  );
}
