"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Flag, Loader2, Plus } from "lucide-react";
import toast from "react-hot-toast";
import { PageHeader, EmptyState } from "@/components/ui";
import { createClient } from "@/lib/supabase";
import { cn } from "@/lib/utils";

type FlagRow = { key: string; description: string; is_enabled: boolean; rollout_percent: number };
type Override = { flag_key: string; org_id: string; enabled: boolean };
type Org = { id: string; name: string };

const input = "h-9 px-3 bg-white border border-[#eceae4] rounded-lg text-sm focus:outline-none focus:border-[#1c1c1c]/30";

export default function SuperAdminFlags() {
  const supabase = useMemo(() => createClient(), []);
  const [flags, setFlags] = useState<FlagRow[]>([]);
  const [overrides, setOverrides] = useState<Override[]>([]);
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [loading, setLoading] = useState(true);
  const [newKey, setNewKey] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [pick, setPick] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const [f, o, g] = await Promise.all([
      supabase.from("feature_flags").select("*").order("key"),
      supabase.from("feature_flag_orgs").select("*"),
      supabase.from("organizations").select("id, name").order("name"),
    ]);
    if (f.error) toast.error(f.error.message);
    setFlags((f.data || []) as FlagRow[]);
    setOverrides((o.data || []) as Override[]);
    setOrgs((g.data || []) as Org[]);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { load(); }, [load]);

  async function save(key: string, patch: { description?: string; enabled?: boolean; percent?: number }) {
    const { error } = await supabase.rpc("platform_save_flag", {
      p_key: key, p_description: patch.description ?? null, p_enabled: patch.enabled ?? null, p_percent: patch.percent ?? null,
    });
    if (error) { toast.error(error.message); return false; }
    load();
    return true;
  }

  async function create() {
    const key = newKey.trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9_.-]{1,59}$/.test(key)) return toast.error("Key: 2-60 lowercase letters, numbers, . _ -");
    if (flags.some(f => f.key === key)) return toast.error("That key exists");
    if (await save(key, { description: newDesc, enabled: false, percent: 0 })) { setNewKey(""); setNewDesc(""); toast.success("Flag created, switched off"); }
  }

  async function setOrg(key: string, orgId: string, enabled: boolean | null) {
    const { error } = await supabase.rpc("platform_set_flag_org", { p_key: key, p_org: orgId, p_enabled: enabled });
    if (error) return toast.error(error.message);
    load();
  }

  if (loading) return <div className="py-12 text-center text-gray-400"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>;
  const orgName = (id: string) => orgs.find(o => o.id === id)?.name || id.slice(0, 8);

  return (
    <div>
      <PageHeader title="Feature flags" subtitle="Turn a feature on for some organisations before everyone. An organisation's admins see the result; only you can change it." />

      <div className="card p-4 mb-4 flex flex-wrap items-end gap-2">
        <label className="text-[10px] text-[#5f5f5d]">Key (code uses this)<br /><input className={cn(input, "w-48 font-mono")} value={newKey} onChange={e => setNewKey(e.target.value.toLowerCase())} placeholder="new-dashboard" /></label>
        <label className="text-[10px] text-[#5f5f5d] flex-1 min-w-[180px]">What it does<br /><input className={cn(input, "w-full")} value={newDesc} onChange={e => setNewDesc(e.target.value)} maxLength={500} /></label>
        <button onClick={create} className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg bg-[#1c1c1c] text-white"><Plus className="w-3.5 h-3.5" /> New flag</button>
      </div>

      {flags.length === 0 ? (
        <EmptyState icon={<Flag className="w-6 h-6" />} title="No flags yet" desc="A flag does nothing until code checks its key." />
      ) : (
        <div className="space-y-3">
          {flags.map(f => {
            const fo = overrides.filter(o => o.flag_key === f.key);
            return (
              <div key={f.key} className="card p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-mono text-sm font-bold text-[#1c1c1c]">{f.key}</div>
                    <div className="text-xs text-[#5f5f5d]">{f.description}</div>
                  </div>
                  <label className="text-xs text-[#5f5f5d] flex items-center gap-2">
                    Rollout
                    <input type="number" min={0} max={100} defaultValue={f.rollout_percent} className={cn(input, "w-20")}
                      onBlur={e => { const n = Number(e.target.value); if (n !== f.rollout_percent && Number.isInteger(n) && n >= 0 && n <= 100) save(f.key, { percent: n }); }} />
                    % of organisations
                  </label>
                  <button onClick={() => save(f.key, { enabled: !f.is_enabled })}
                    className={cn("text-[10px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-full",
                      f.is_enabled ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-[#5f5f5d]")}>
                    {f.is_enabled ? "On" : "Off"}
                  </button>
                </div>
                <div className="mt-3 pt-3 border-t border-[#eceae4] flex flex-wrap items-center gap-2 text-xs">
                  {fo.map(o => (
                    <span key={o.org_id} className={cn("inline-flex items-center gap-1 px-2 py-1 rounded-full", o.enabled ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-600")}>
                      {orgName(o.org_id)}: {o.enabled ? "always on" : "always off"}
                      <button onClick={() => setOrg(f.key, o.org_id, null)} aria-label="Remove" className="ml-1 font-bold">×</button>
                    </span>
                  ))}
                  <select value={pick[f.key] || ""} onChange={e => setPick({ ...pick, [f.key]: e.target.value })} className={cn(input, "h-8 text-xs")}>
                    <option value="">Organisation...</option>
                    {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                  </select>
                  <button disabled={!pick[f.key]} onClick={() => setOrg(f.key, pick[f.key], true)} className="px-2 py-1 rounded-lg border border-[#eceae4] disabled:opacity-40">Always on</button>
                  <button disabled={!pick[f.key]} onClick={() => setOrg(f.key, pick[f.key], false)} className="px-2 py-1 rounded-lg border border-[#eceae4] disabled:opacity-40">Always off</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <p className="text-[11px] text-[#5f5f5d] mt-4">A flag must be On before anything else counts. Then &quot;always on/off&quot; for an organisation wins; otherwise the rollout percentage picks organisations, and an organisation stays in as the percentage grows. Changes reach users within 5 minutes.</p>
    </div>
  );
}
