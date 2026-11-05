"use client";
import { useEffect, useState, useCallback } from "react";
import { Building2, Users, Loader2, Power, PowerOff } from "lucide-react";
import { PageHeader, EmptyState, AccessDenied } from "@/components/ui";
import { createClient } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";
import { useCurrentProfile } from "@/hooks/useCurrentProfile";

type OrgStat = {
  org_id: string;
  name: string;
  slug: string;
  plan: string;
  is_active: boolean;
  member_count: number;
  created_at: string;
};

export default function PlatformAdminPage() {
  const [loading, setLoading] = useState(true);
  const [orgs, setOrgs] = useState<OrgStat[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const { profile: currentProfile, loading: profileLoading } = useCurrentProfile();
  const supabase = createClient();

  const fetchOrgs = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("platform_admin_org_stats");
    if (error) toast.error(error.message);
    else setOrgs((data || []) as OrgStat[]);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    if (!profileLoading && currentProfile?.is_platform_admin) fetchOrgs();
  }, [profileLoading, currentProfile?.is_platform_admin, fetchOrgs]);

  async function toggleActive(org: OrgStat) {
    const next = !org.is_active;
    if (!confirm(`${next ? "Reactivate" : "Suspend"} "${org.name}"? ${next ? "" : "Every member loses access to all org data immediately."}`)) return;
    setBusyId(org.org_id);
    const { error } = await supabase.from("organizations").update({ is_active: next }).eq("id", org.org_id);
    if (error) toast.error(error.message);
    else {
      toast.success(next ? "Organization reactivated" : "Organization suspended");
      setOrgs(prev => prev.map(o => o.org_id === org.org_id ? { ...o, is_active: next } : o));
    }
    setBusyId(null);
  }

  if (profileLoading) {
    return <div className="py-12 text-center text-gray-400">Loading...</div>;
  }

  if (!currentProfile?.is_platform_admin) {
    return <AccessDenied title="Platform Access Only" desc="This page is restricted to the platform's own super-admin account." />;
  }

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Platform Admin"
        subtitle="Every organization on this SaaS instance. Suspending one locks out all of its members immediately."
      />

      {loading ? (
        <div className="py-12 text-center text-gray-400"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>
      ) : orgs.length === 0 ? (
        <EmptyState icon={<Building2 className="w-6 h-6" />} title="No organizations yet" desc="Orgs appear here as soon as they sign up." />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {orgs.map(org => (
            <div key={org.org_id} className="card p-4 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-sm font-bold text-[#1c1c1c]">{org.name}</div>
                  <div className="text-[10px] text-gray-400 mt-0.5">{org.slug} &middot; {org.plan} plan</div>
                </div>
                <span className={cn(
                  "text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full",
                  org.is_active ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-500"
                )}>
                  {org.is_active ? "Active" : "Suspended"}
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-gray-500">
                <Users className="w-3.5 h-3.5" /> {org.member_count} member{org.member_count === 1 ? "" : "s"}
              </div>
              <button
                onClick={() => toggleActive(org)}
                disabled={busyId === org.org_id}
                className={cn(
                  "w-full flex items-center justify-center gap-1.5 text-xs py-1.5 rounded-lg border transition-all",
                  org.is_active
                    ? "border-rose-100 text-rose-500 hover:bg-rose-50"
                    : "border-emerald-100 text-emerald-600 hover:bg-emerald-50"
                )}
              >
                {busyId === org.org_id ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : org.is_active ? (
                  <><PowerOff className="w-3 h-3" /> Suspend</>
                ) : (
                  <><Power className="w-3 h-3" /> Reactivate</>
                )}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
