"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Save } from "lucide-react";
import toast from "react-hot-toast";
import { PageHeader } from "@/components/ui";
import { createClient } from "@/lib/supabase";
import { cn } from "@/lib/utils";

type Mod = { key: string; name: string; description: string; is_available: boolean; sort_order: number };
type Plan = { id: string; name: string; code: string };

export default function SuperAdminModules() {
  const supabase = useMemo(() => createClient(), []);
  const [mods, setMods] = useState<Mod[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [planMods, setPlanMods] = useState<Record<string, string[]>>({});
  const [planId, setPlanId] = useState("");
  const [draft, setDraft] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [m, p, pm] = await Promise.all([
      supabase.from("platform_modules").select("*").order("sort_order"),
      supabase.from("subscription_plans").select("id, name, code").order("sort_order"),
      supabase.from("plan_modules").select("plan_id, module_key"),
    ]);
    if (m.error) toast.error(m.error.message);
    setMods((m.data || []) as Mod[]);
    setPlans((p.data || []) as Plan[]);
    const byPlan: Record<string, string[]> = {};
    for (const r of (pm.data || []) as { plan_id: string; module_key: string }[]) (byPlan[r.plan_id] ||= []).push(r.module_key);
    setPlanMods(byPlan);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { load(); }, [load]);

  async function toggleAvailable(m: Mod) {
    if (!window.confirm(m.is_available
      ? `Switch "${m.name}" off for every organisation? It closes for everyone at once; data is kept.`
      : `Make "${m.name}" available again? Plans and organisation settings decide who gets it.`)) return;
    const { error } = await supabase.rpc("platform_set_module_available", { p_key: m.key, p_available: !m.is_available });
    if (error) return toast.error(error.message);
    setMods(prev => prev.map(x => (x.key === m.key ? { ...x, is_available: !m.is_available } : x)));
  }

  const included = draft ?? planMods[planId] ?? [];
  const allIncluded = included.length === 0;

  async function savePlan() {
    if (!window.confirm("Save this plan's modules? Organisations currently on the plan get the change right away.")) return;
    setBusy(true);
    const { error } = await supabase.rpc("platform_set_plan_modules", { p_plan: planId, p_keys: included });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Plan modules saved");
    setDraft(null);
    load();
  }

  if (loading) return <div className="py-12 text-center text-gray-400"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>;

  return (
    <div className="space-y-6">
      <PageHeader title="Modules" subtitle="What each organisation can use. A module that is off closes in the database for that organisation, admins included. Data is never deleted." />

      <div className="card p-4">
        <div className="text-[10px] font-bold uppercase tracking-widest text-[#5f5f5d] mb-3">Platform-wide</div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {mods.map(m => (
            <div key={m.key} className="flex items-start gap-3 p-3 rounded-lg border border-[#eceae4]">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-[#1c1c1c]">{m.name}</div>
                <div className="text-[11px] text-[#5f5f5d]">{m.description}</div>
              </div>
              <button onClick={() => toggleAvailable(m)}
                className={cn("text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full",
                  m.is_available ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-600")}>
                {m.is_available ? "On" : "Off"}
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="card p-4">
        <div className="text-[10px] font-bold uppercase tracking-widest text-[#5f5f5d] mb-3">Modules in a plan</div>
        {plans.length === 0 ? <p className="text-sm text-[#5f5f5d]">Create a plan first.</p> : (
          <>
            <select value={planId} onChange={e => { setPlanId(e.target.value); setDraft(null); }}
              className="h-9 px-3 mb-3 bg-white border border-[#eceae4] rounded-lg text-sm">
              <option value="">Choose a plan...</option>
              {plans.map(p => <option key={p.id} value={p.id}>{p.name} ({p.code})</option>)}
            </select>
            {planId && (
              <>
                <p className="text-xs text-[#5f5f5d] mb-2">
                  {allIncluded ? "No modules ticked means this plan includes every module." : `${included.length} of ${mods.length} modules included.`}
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 mb-3">
                  {mods.map(m => (
                    <label key={m.key} className="flex items-center gap-2 p-2 rounded-lg border border-[#eceae4] text-xs cursor-pointer">
                      <input type="checkbox" checked={included.includes(m.key)}
                        onChange={() => setDraft(included.includes(m.key) ? included.filter(k => k !== m.key) : [...included, m.key])} />
                      {m.name}
                    </label>
                  ))}
                </div>
                <button onClick={savePlan} disabled={busy || draft === null}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg bg-[#1c1c1c] text-white disabled:opacity-50">
                  {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Save plan modules
                </button>
              </>
            )}
          </>
        )}
        <p className="text-[11px] text-[#5f5f5d] mt-3">Order of rules: platform-wide off beats everything; then a per-organisation setting (on the organisation&apos;s Modules tab); then the plan. Organisations with no subscription get every available module.</p>
      </div>
    </div>
  );
}
