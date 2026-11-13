"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Loader2, Save } from "lucide-react";
import toast from "react-hot-toast";
import { PageHeader } from "@/components/ui";
import { createClient } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { UsersTable } from "@/components/superadmin/UsersTable";
import { SubscriptionPanel } from "@/components/superadmin/SubscriptionPanel";
import { OrgModulesPanel } from "@/components/superadmin/OrgModulesPanel";

type Org = {
  id: string; name: string; slug: string; plan: string | null; is_active: boolean; created_at: string;
  disabled_modules: string[] | null; session_timeout_minutes: number | null;
};
type AuditRow = { id: string; action: string; details: Record<string, unknown> | null; created_at: string };

const TABS = ["overview", "users", "modules", "activity"] as const;
type Tab = (typeof TABS)[number];

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-widest text-[#5f5f5d]">{label}</div>
      <div className="text-sm text-[#1c1c1c] mt-0.5">{value}</div>
    </div>
  );
}

export default function SuperAdminOrgDetail() {
  const { id } = useParams<{ id: string }>();
  const supabase = useMemo(() => createClient(), []);
  const [tab, setTab] = useState<Tab>("overview");
  const [org, setOrg] = useState<Org | null>(null);
  const [usage, setUsage] = useState<Record<string, number> | null>(null);
  const [tags, setTags] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [audit, setAudit] = useState<AuditRow[] | null>(null);
  const [missing, setMissing] = useState(false);

  const load = useCallback(async () => {
    const [o, u, n] = await Promise.all([
      supabase.from("organizations").select("*").eq("id", id).maybeSingle(),
      supabase.rpc("platform_org_usage", { p_org: id }),
      supabase.from("platform_org_notes").select("tags, notes").eq("org_id", id).maybeSingle(),
    ]);
    if (o.error) toast.error(o.error.message);
    if (!o.data) { setMissing(true); return; }
    setOrg(o.data as Org);
    setUsage((u.data || {}) as Record<string, number>);
    setTags((n.data?.tags || []).join(", "));
    setNotes(n.data?.notes || "");
  }, [supabase, id]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (tab !== "activity" || audit) return;
    supabase.from("platform_audit_logs").select("id, action, details, created_at").eq("target_id", id)
      .order("created_at", { ascending: false }).limit(100)
      .then(({ data }) => setAudit((data || []) as AuditRow[]));
  }, [tab, audit, supabase, id]);

  async function saveNotes() {
    setSaving(true);
    const { error } = await supabase.rpc("platform_save_org_notes", {
      p_org: id, p_tags: tags.split(",").map(t => t.trim()).filter(Boolean), p_notes: notes,
    });
    if (error) toast.error(error.message);
    else { toast.success("Saved"); setAudit(null); }
    setSaving(false);
  }

  if (missing) return <div className="card p-6 text-sm text-[#5f5f5d]">Organisation not found. <Link href="/superadmin/organisations" className="underline">Back to list</Link></div>;
  if (!org) return <div className="py-12 text-center text-gray-400"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>;

  return (
    <div>
      <Link href="/superadmin/organisations" className="inline-flex items-center gap-1 text-xs text-[#5f5f5d] hover:text-[#1c1c1c] mb-3">
        <ArrowLeft className="w-3 h-3" /> Organisations
      </Link>
      <PageHeader title={org.name} subtitle={`${org.slug} · ${org.is_active ? "Active" : "Suspended"} · since ${new Date(org.created_at).toLocaleDateString()}`} />

      <div className="flex gap-2 mb-5">
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={cn("px-3 py-1.5 rounded-full text-xs font-semibold border capitalize",
              tab === t ? "bg-[#1c1c1c] text-white border-[#1c1c1c]" : "bg-white text-[#5f5f5d] border-[#eceae4]")}>
            {t}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="grid lg:grid-cols-2 gap-4">
          <div className="lg:col-span-2"><SubscriptionPanel orgId={id} /></div>
          <div className="card p-4 grid grid-cols-2 gap-4 content-start">
            <Fact label="Plan" value={org.plan || "None set"} />
            <Fact label="Status" value={org.is_active ? "Active" : "Suspended"} />
            <Fact label="Session timeout" value={org.session_timeout_minutes ? `${org.session_timeout_minutes} min` : "Off"} />
            <Fact label="Modules off" value={org.disabled_modules?.length || 0} />
            <div className="col-span-2 border-t border-[#eceae4] pt-3">
              <div className="text-[10px] font-bold uppercase tracking-widest text-[#5f5f5d] mb-2">Records</div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {Object.entries(usage || {}).map(([k, v]) => <Fact key={k} label={k} value={<span className="tabular-nums">{v}</span>} />)}
              </div>
            </div>
          </div>
          <div className="card p-4 space-y-3">
            <div className="text-[10px] font-bold uppercase tracking-widest text-[#5f5f5d]">Owner notes (only you see these)</div>
            <input value={tags} onChange={e => setTags(e.target.value)} placeholder="Tags, comma separated"
              className="w-full h-10 px-3 bg-white border border-[#eceae4] rounded-lg text-sm focus:outline-none focus:border-[#1c1c1c]/30" />
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={7} maxLength={10000} placeholder="Notes"
              className="w-full p-3 bg-white border border-[#eceae4] rounded-lg text-sm focus:outline-none focus:border-[#1c1c1c]/30" />
            <button onClick={saveNotes} disabled={saving}
              className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg bg-[#1c1c1c] text-white disabled:opacity-50">
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Save
            </button>
          </div>
        </div>
      )}

      {tab === "users" && <UsersTable orgId={id} showOrg={false} />}

      {tab === "modules" && <OrgModulesPanel orgId={id} />}

      {tab === "activity" && (
        !audit ? <div className="py-12 text-center text-gray-400"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>
        : audit.length === 0 ? <div className="card p-4 text-sm text-[#5f5f5d]">No owner actions on this organisation yet.</div>
        : (
          <div className="card divide-y divide-gray-50">
            {audit.map(a => (
              <div key={a.id} className="p-3 flex flex-col sm:flex-row gap-1 sm:gap-4 text-xs">
                <span className="text-gray-500 sm:w-44 shrink-0">{new Date(a.created_at).toLocaleString()}</span>
                <span className="font-bold text-[#1c1c1c] sm:w-48 shrink-0">{a.action.replace(/_/g, " ").replace(".", ": ")}</span>
                <span className="text-gray-600 break-words">{JSON.stringify(a.details)}</span>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}
