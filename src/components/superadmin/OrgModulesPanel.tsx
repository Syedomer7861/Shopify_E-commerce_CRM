"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import { createClient } from "@/lib/supabase";
import { cn } from "@/lib/utils";

type Mod = { key: string; name: string; is_available: boolean };
type Choice = "default" | "on" | "off";

/** Owner's per-organisation module settings, and what the organisation ends up with. */
export function OrgModulesPanel({ orgId }: { orgId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [mods, setMods] = useState<Mod[]>([]);
  const [over, setOver] = useState<Record<string, boolean>>({});
  const [blocked, setBlocked] = useState<string[]>([]);
  const [ownOff, setOwnOff] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [m, o, g] = await Promise.all([
      supabase.from("platform_modules").select("key, name, is_available").order("sort_order"),
      supabase.from("org_module_overrides").select("module_key, enabled").eq("org_id", orgId),
      supabase.from("organizations").select("disabled_modules, platform_blocked_modules").eq("id", orgId).maybeSingle(),
    ]);
    if (m.error) toast.error(m.error.message);
    setMods((m.data || []) as Mod[]);
    setOver(Object.fromEntries(((o.data || []) as { module_key: string; enabled: boolean }[]).map(r => [r.module_key, r.enabled])));
    setBlocked((g.data?.platform_blocked_modules as string[]) || []);
    setOwnOff((g.data?.disabled_modules as string[]) || []);
    setLoading(false);
  }, [supabase, orgId]);

  useEffect(() => { load(); }, [load]);

  async function choose(key: string, c: Choice) {
    setBusy(key);
    const { error } = await supabase.rpc("platform_set_org_module", { p_org: orgId, p_key: key, p_enabled: c === "default" ? null : c === "on" });
    setBusy(null);
    if (error) return toast.error(error.message);
    load();
  }

  if (loading) return <div className="card p-4"><Loader2 className="w-4 h-4 animate-spin text-gray-400" /></div>;

  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-sm min-w-[560px]">
        <thead>
          <tr className="text-left text-[10px] uppercase tracking-widest text-[#5f5f5d] border-b border-[#eceae4]">
            <th className="p-3">Module</th><th className="p-3">Your setting</th><th className="p-3">Result</th>
          </tr>
        </thead>
        <tbody>
          {mods.map(m => {
            const choice: Choice = m.key in over ? (over[m.key] ? "on" : "off") : "default";
            const result = blocked.includes(m.key) ? (m.is_available ? "Blocked" : "Off platform-wide")
              : ownOff.includes(m.key) ? "Their admin switched it off" : "On";
            return (
              <tr key={m.key} className="border-b border-gray-50 last:border-0">
                <td className="p-3 font-semibold text-[#1c1c1c]">{m.name}</td>
                <td className="p-3">
                  <div className="inline-flex rounded-lg border border-[#eceae4] overflow-hidden text-xs">
                    {(["default", "on", "off"] as const).map(c => (
                      <button key={c} disabled={busy === m.key} onClick={() => c !== choice && choose(m.key, c)}
                        className={cn("px-2.5 py-1 capitalize", c === choice ? "bg-[#1c1c1c] text-white" : "text-[#5f5f5d] hover:bg-[#f7f4ed]")}>
                        {c === "default" ? "Plan" : c}
                      </button>
                    ))}
                  </div>
                </td>
                <td className={cn("p-3 text-xs", result === "On" ? "text-emerald-700" : "text-rose-600")}>{result}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="text-[11px] text-[#5f5f5d] p-3 border-t border-[#eceae4]">&quot;Plan&quot; follows the organisation&apos;s plan (all modules if it has none). On or Off here overrides the plan for this organisation only. A module off platform-wide stays off.</p>
    </div>
  );
}
