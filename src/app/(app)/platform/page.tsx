"use client";
import { useEffect, useState, useCallback } from "react";
import { Building2, Users, Loader2, Power, PowerOff, Mail, Phone } from "lucide-react";
import { PageHeader, EmptyState, AccessDenied, Select } from "@/components/ui";
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

type ContactRequest = {
  id: string;
  name: string;
  email: string;
  company: string | null;
  phone: string | null;
  message: string;
  status: "new" | "contacted" | "provisioned" | "declined";
  created_at: string;
};

const STATUS_STYLE: Record<ContactRequest["status"], string> = {
  new: "bg-amber-50 text-amber-700",
  contacted: "bg-blue-50 text-blue-600",
  provisioned: "bg-emerald-50 text-emerald-600",
  declined: "bg-gray-100 text-gray-500",
};

export default function PlatformAdminPage() {
  const [loading, setLoading] = useState(true);
  const [orgs, setOrgs] = useState<OrgStat[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [requests, setRequests] = useState<ContactRequest[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(true);
  const [requestBusyId, setRequestBusyId] = useState<string | null>(null);
  const { profile: currentProfile, loading: profileLoading } = useCurrentProfile();
  const supabase = createClient();

  const fetchOrgs = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("platform_admin_org_stats");
    if (error) toast.error(error.message);
    else setOrgs((data || []) as OrgStat[]);
    setLoading(false);
  }, [supabase]);

  const fetchRequests = useCallback(async () => {
    setRequestsLoading(true);
    const { data, error } = await supabase
      .from("contact_requests")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    else setRequests((data || []) as ContactRequest[]);
    setRequestsLoading(false);
  }, [supabase]);

  useEffect(() => {
    if (!profileLoading && currentProfile?.is_platform_admin) {
      fetchOrgs();
      fetchRequests();
    }
  }, [profileLoading, currentProfile?.is_platform_admin, fetchOrgs, fetchRequests]);

  async function updateRequestStatus(id: string, status: ContactRequest["status"]) {
    setRequestBusyId(id);
    const { error } = await supabase
      .from("contact_requests")
      .update({ status, reviewed_at: new Date().toISOString(), reviewed_by: currentProfile?.id })
      .eq("id", id);
    if (error) toast.error(error.message);
    else setRequests(prev => prev.map(r => r.id === id ? { ...r, status } : r));
    setRequestBusyId(null);
  }

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

      <div className="mb-10">
        <h2 className="text-sm font-bold text-[#1c1c1c] mb-1 flex items-center gap-2">
          <Mail className="w-4 h-4" /> Contact Requests
        </h2>
        <p className="text-[11px] text-gray-400 mb-4">
          Submitted from the public /contact form - self-serve signup is off, so this is the only way in now.
        </p>
        {requestsLoading ? (
          <div className="py-8 text-center text-gray-400"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>
        ) : requests.length === 0 ? (
          <EmptyState icon={<Mail className="w-6 h-6" />} title="No requests yet" desc="Submissions from /contact land here." />
        ) : (
          <div className="space-y-3">
            {requests.map(r => (
              <div key={r.id} className="card p-4 flex flex-col sm:flex-row sm:items-start gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-bold text-[#1c1c1c]">{r.name}</span>
                    {r.company && <span className="text-xs text-gray-400">&middot; {r.company}</span>}
                    <span className={cn("text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full", STATUS_STYLE[r.status])}>
                      {r.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-gray-500 mt-1">
                    <a href={`mailto:${r.email}`} className="flex items-center gap-1 hover:text-[#1c1c1c]"><Mail className="w-3 h-3" /> {r.email}</a>
                    {r.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" /> {r.phone}</span>}
                    <span>{new Date(r.created_at).toLocaleDateString()}</span>
                  </div>
                  <p className="text-xs text-[#5f5f5d] mt-2 leading-relaxed">{r.message}</p>
                </div>
                <div className="shrink-0 w-full sm:w-40">
                  <Select
                    value={r.status}
                    onChange={v => updateRequestStatus(r.id, v as ContactRequest["status"])}
                    disabled={requestBusyId === r.id}
                    triggerClassName="text-xs"
                    options={[
                      { value: "new", label: "New" },
                      { value: "contacted", label: "Contacted" },
                      { value: "provisioned", label: "Provisioned" },
                      { value: "declined", label: "Declined" },
                    ]}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <h2 className="text-sm font-bold text-[#1c1c1c] mb-4 flex items-center gap-2">
        <Building2 className="w-4 h-4" /> Organizations
      </h2>

      {loading ? (
        <div className="py-12 text-center text-gray-400"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>
      ) : orgs.length === 0 ? (
        <EmptyState icon={<Building2 className="w-6 h-6" />} title="No organizations yet" desc="Provision one via /api/signup once you've reviewed a request above." />
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
