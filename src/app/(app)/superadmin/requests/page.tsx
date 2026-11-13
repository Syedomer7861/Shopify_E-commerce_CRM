"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Mail, Phone } from "lucide-react";
import toast from "react-hot-toast";
import { PageHeader, EmptyState, Select } from "@/components/ui";
import { createClient } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { useCurrentProfile } from "@/hooks/useCurrentProfile";
import type { Touch } from "@/lib/attribution";

type ContactRequest = {
  id: string; name: string; email: string; company: string | null; phone: string | null;
  message: string; status: "new" | "contacted" | "provisioned" | "declined"; created_at: string;
  first_touch?: Touch | null; last_touch?: Touch | null;
};

// "google / cpc", "linkedin.com" or "Direct / unknown" (no consent, or no tags and no referrer).
function sourceLabel(t?: Touch | null) {
  if (!t) return "Direct / unknown";
  if (t.source) return t.medium ? `${t.source} / ${t.medium}` : t.source;
  return t.referrer || "Direct / unknown";
}

const STATUS_STYLE: Record<ContactRequest["status"], string> = {
  new: "bg-amber-50 text-amber-700",
  contacted: "bg-blue-50 text-blue-700",
  provisioned: "bg-emerald-50 text-emerald-700",
  declined: "bg-gray-100 text-gray-600",
};

export default function SuperAdminRequests() {
  const supabase = useMemo(() => createClient(), []);
  const { profile } = useCurrentProfile();
  const [requests, setRequests] = useState<ContactRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from("contact_requests").select("*").order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    else setRequests((data || []) as ContactRequest[]);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { load(); }, [load]);

  const bySource = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of requests) counts.set(sourceLabel(r.first_touch), (counts.get(sourceLabel(r.first_touch)) || 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [requests]);

  async function setStatus(id: string, status: ContactRequest["status"]) {
    setBusyId(id);
    const { error } = await supabase.from("contact_requests")
      .update({ status, reviewed_at: new Date().toISOString(), reviewed_by: profile?.id })
      .eq("id", id);
    if (error) toast.error(error.message);
    else setRequests(prev => prev.map(r => (r.id === id ? { ...r, status } : r)));
    setBusyId(null);
  }

  return (
    <div>
      <PageHeader title="Requests" subtitle="Workspace requests from the public contact form. Self-serve signup is off, so this is the way in." />
      {loading ? (
        <div className="py-12 text-center text-gray-400"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>
      ) : requests.length === 0 ? (
        <EmptyState icon={<Mail className="w-6 h-6" />} title="No requests yet" desc="Submissions from /contact land here." />
      ) : (
        <div className="space-y-3">
          <div className="card p-4">
            <div className="text-[11px] font-bold uppercase tracking-widest text-[#5f5f5d] mb-2">Requests by first source</div>
            <div className="flex flex-wrap gap-2">
              {bySource.map(([label, n]) => (
                <span key={label} className="text-xs px-2.5 py-1 rounded-full bg-[#f7f4ed] text-[#1c1c1c]">{label} <b>{n}</b></span>
              ))}
            </div>
            <p className="text-[11px] text-[#5f5f5d] mt-2">Recorded only for visitors who allowed analytics cookies, from UTM tags or the referring site. Requests before this was added show as direct / unknown.</p>
          </div>
          {requests.map(r => (
            <div key={r.id} className="card p-4 flex flex-col sm:flex-row sm:items-start gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-bold text-[#1c1c1c]">{r.name}</span>
                  {r.company && <span className="text-xs text-gray-500">&middot; {r.company}</span>}
                  <span className={cn("text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full", STATUS_STYLE[r.status])}>{r.status}</span>
                </div>
                <div className="flex items-center gap-4 text-xs text-gray-500 mt-1 flex-wrap">
                  <a href={`mailto:${r.email}`} className="flex items-center gap-1 hover:text-[#1c1c1c]"><Mail className="w-3 h-3" /> {r.email}</a>
                  {r.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" /> {r.phone}</span>}
                  <span>{new Date(r.created_at).toLocaleDateString()}</span>
                  <span title={r.first_touch?.campaign ? `Campaign: ${r.first_touch.campaign}` : undefined}>
                    Source: {sourceLabel(r.first_touch)}
                    {r.last_touch && sourceLabel(r.last_touch) !== sourceLabel(r.first_touch) && <> · latest: {sourceLabel(r.last_touch)}</>}
                  </span>
                </div>
                <p className="text-xs text-[#5f5f5d] mt-2 leading-relaxed">{r.message}</p>
              </div>
              <div className="shrink-0 w-full sm:w-40">
                <Select value={r.status} onChange={v => setStatus(r.id, v as ContactRequest["status"])} disabled={busyId === r.id} triggerClassName="text-xs"
                  options={[
                    { value: "new", label: "New" },
                    { value: "contacted", label: "Contacted" },
                    { value: "provisioned", label: "Provisioned" },
                    { value: "declined", label: "Declined" },
                  ]} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
