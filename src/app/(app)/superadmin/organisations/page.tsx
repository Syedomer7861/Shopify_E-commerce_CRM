"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Building2, Loader2, Power, PowerOff } from "lucide-react";
import toast from "react-hot-toast";
import { PageHeader, EmptyState } from "@/components/ui";
import { createClient } from "@/lib/supabase";
import { cn } from "@/lib/utils";

type Org = {
  org_id: string; name: string; slug: string; plan: string | null; is_active: boolean;
  created_at: string; member_count: number; active_7d: number;
  last_seen_at: string | null; disabled_modules: string[] | null; admin_email: string | null;
};

const ago = (iso: string | null) => {
  if (!iso) return "Never";
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  return d <= 0 ? "Today" : d === 1 ? "Yesterday" : `${d} days ago`;
};

export default function SuperAdminOrganisations() {
  const supabase = useMemo(() => createClient(), []);
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "active" | "suspended">("all");
  const [focus] = useState(() => (typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("focus")));

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("platform_org_directory");
    if (error) toast.error(error.message);
    else setOrgs((data || []) as Org[]);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (focus && !loading) document.getElementById(`org-${focus}`)?.scrollIntoView({ block: "center" });
  }, [focus, loading]);

  async function toggleActive(org: Org) {
    const next = !org.is_active;
    if (!window.confirm(`${next ? "Reactivate" : "Suspend"} "${org.name}"?${next ? "" : " Every member loses access immediately. Data is kept."}`)) return;
    setBusyId(org.org_id);
    const { error } = await supabase.from("organizations").update({ is_active: next }).eq("id", org.org_id);
    if (error) toast.error(error.message);
    else {
      toast.success(next ? "Organisation reactivated" : "Organisation suspended");
      setOrgs(prev => prev.map(o => (o.org_id === org.org_id ? { ...o, is_active: next } : o)));
    }
    setBusyId(null);
  }

  const shown = orgs.filter(o => filter === "all" || (filter === "active" ? o.is_active : !o.is_active));

  return (
    <div>
      <PageHeader title="Organisations" subtitle="Every organisation on CodeCrest. Suspending one locks out all of its members at once; data is kept." />

      <div className="flex gap-2 mb-4">
        {(["all", "active", "suspended"] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={cn("px-3 py-1.5 rounded-full text-xs font-semibold border capitalize",
              filter === f ? "bg-[#1c1c1c] text-white border-[#1c1c1c]" : "bg-white text-[#5f5f5d] border-[#eceae4]")}>
            {f} ({orgs.filter(o => f === "all" || (f === "active" ? o.is_active : !o.is_active)).length})
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-12 text-center text-gray-400"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>
      ) : shown.length === 0 ? (
        <EmptyState icon={<Building2 className="w-6 h-6" />} title="No organisations here" desc="Provision one from a request once you've reviewed it." />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm min-w-[760px]">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-widest text-[#5f5f5d] border-b border-[#eceae4]">
                <th className="p-3">Organisation</th>
                <th className="p-3">Admin</th>
                <th className="p-3">Members</th>
                <th className="p-3">Active 7d</th>
                <th className="p-3">Last activity</th>
                <th className="p-3">Modules off</th>
                <th className="p-3">Status</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody>
              {shown.map(o => (
                <tr key={o.org_id} id={`org-${o.org_id}`} className={cn("border-b border-gray-50 last:border-0", focus === o.org_id && "bg-amber-50")}>
                  <td className="p-3">
                    <Link href={`/superadmin/organisations/${o.org_id}`} className="font-semibold text-[#1c1c1c] hover:underline">{o.name}</Link>
                    <div className="text-[11px] text-[#5f5f5d]">{o.slug} · since {new Date(o.created_at).toLocaleDateString()}{o.plan ? ` · ${o.plan}` : ""}</div>
                  </td>
                  <td className="p-3 text-xs text-[#5f5f5d]">{o.admin_email || "—"}</td>
                  <td className="p-3 tabular-nums">{o.member_count}</td>
                  <td className="p-3 tabular-nums">{o.active_7d}</td>
                  <td className="p-3 text-xs text-[#5f5f5d]">{ago(o.last_seen_at)}</td>
                  <td className="p-3 text-xs text-[#5f5f5d]">{o.disabled_modules?.length ? o.disabled_modules.join(", ") : "None"}</td>
                  <td className="p-3">
                    <span className={cn("text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full",
                      o.is_active ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-600")}>
                      {o.is_active ? "Active" : "Suspended"}
                    </span>
                  </td>
                  <td className="p-3 text-right">
                    <button onClick={() => toggleActive(o)} disabled={busyId === o.org_id}
                      className={cn("inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border",
                        o.is_active ? "border-rose-100 text-rose-600 hover:bg-rose-50" : "border-emerald-100 text-emerald-700 hover:bg-emerald-50")}>
                      {busyId === o.org_id ? <Loader2 className="w-3 h-3 animate-spin" /> : o.is_active ? <><PowerOff className="w-3 h-3" /> Suspend</> : <><Power className="w-3 h-3" /> Reactivate</>}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
