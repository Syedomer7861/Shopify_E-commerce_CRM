"use client";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus, Pencil, Archive, Loader2, AlertTriangle, Blocks } from "lucide-react";
import toast from "react-hot-toast";
import { PageHeader, EmptyState } from "@/components/ui";
import { RecordsModule, ModuleTabs, day, type RecordsConfig } from "@/components/records/RecordsModule";
import { AppBuilder } from "@/components/apps/AppBuilder";
import { APP_TEMPLATES, type CustomModule } from "@/lib/app-templates";
import { createClient } from "@/lib/supabase";
import { useCurrentProfile } from "@/hooks/useCurrentProfile";
import { isAdmin } from "@/lib/permissions";
import type { Profile } from "@/types";

const MAX_COLUMNS = 5;
const number = (v: any) => (v === null || v === undefined || v === "" ? "—" : Number(v).toLocaleString("en-IN"));

/** A stored definition, rendered by the same list/form component as Finance or Leads. */
function toConfig(app: CustomModule, profile: Profile, admin: boolean): RecordsConfig {
  return {
    table: "custom_records", module: `app:${app.key}`, noun: app.noun, ownerCol: "owner_id", ownerLabel: "Added by",
    filter: { module_id: app.id }, dataCol: "data",
    columns: app.fields.slice(0, MAX_COLUMNS).map(f => ({ key: f.key, label: f.label, format: f.type === "number" ? number : f.type === "date" ? day : undefined })),
    fields: app.fields,
    statuses: app.statuses,
    editable: true,
    // Mirrors the row policies in migration 20261113a, which are what actually decide.
    access: { create: true, edit: row => admin || row.owner_id === profile.id, delete: admin, export: true },
  };
}

function AppsPage() {
  const { profile, loading: profileLoading } = useCurrentProfile();
  const router = useRouter();
  const activeKey = useSearchParams().get("app");
  const supabase = useMemo(() => createClient(), []);
  const [apps, setApps] = useState<CustomModule[]>([]);
  const [loading, setLoading] = useState(true);
  const [notReady, setNotReady] = useState(false);
  const [builder, setBuilder] = useState<{ open: boolean; editing: CustomModule | null }>({ open: false, editing: null });
  const admin = isAdmin(profile);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from("custom_modules").select("*").eq("is_active", true).order("label");
    if (error) setNotReady(true);
    else { setNotReady(false); setApps(data as CustomModule[]); }
    setLoading(false);
  }, [supabase]);

  useEffect(() => { if (!profileLoading && profile) load(); }, [profileLoading, profile, load]);

  const open = (key: string) => router.replace(`/apps?app=${encodeURIComponent(key)}`);
  const current = apps.find(a => a.key === activeKey) || apps[0];

  async function archive(app: CustomModule) {
    if (!confirm(`Archive "${app.label}"? It disappears for everyone. Its records are kept and it can be restored from the database.`)) return;
    const { error } = await supabase.from("custom_modules").update({ is_active: false }).eq("id", app.id);
    if (error) toast.error(error.message);
    else { toast.success("App archived"); router.replace("/apps"); load(); }
  }

  if (profileLoading || loading) return <div className="py-12 text-center text-gray-400"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>;
  if (!profile) return null;

  return (
    <div className="animate-fade-in">
      <PageHeader title="Apps" subtitle="Modules your organisation builds for itself: pick the fields and statuses, and everyone gets a list, a form and an export."
        actions={admin && !notReady ? <button onClick={() => setBuilder({ open: true, editing: null })} className="btn-primary flex items-center gap-1.5 text-xs"><Plus className="w-3.5 h-3.5" /> New app</button> : undefined} />

      {notReady ? (
        <div className="card p-5 flex items-start gap-3 text-sm text-amber-700 bg-amber-50 border-amber-100">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <div>Apps aren&apos;t set up on this database yet. Run <code>supabase/migrations/20261113a_custom_modules.sql</code>, then reload.</div>
        </div>
      ) : apps.length === 0 ? (
        <>
          <EmptyState icon={<Blocks className="w-6 h-6" />} title="No apps yet"
            desc={admin ? "Create one from a template, or start blank with \"New app\"." : "An admin can create apps for your organisation here."} />
          {admin && (
            <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {APP_TEMPLATES.map(t => (
                <div key={t.label} className="card p-4">
                  <div className="text-sm font-bold text-[#1c1c1c]">{t.label}</div>
                  <p className="text-[11px] text-gray-500 mt-1">{t.description}</p>
                  <p className="text-[10px] text-gray-400 mt-2">{t.fields.length} fields · {t.statuses.length} statuses</p>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          <ModuleTabs tabs={apps.map(a => ({ key: a.key, label: a.label }))} active={current.key} onChange={open} />
          <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
            <p className="text-xs text-gray-500 max-w-xl">
              {current.description || `Every ${current.noun} your team records.`}
              {current.visibility === "own" && <span className="ml-1 font-bold text-[#1c1c1c]">You see your own; admins see all.</span>}
            </p>
            {admin && (
              <div className="flex gap-2">
                <button onClick={() => setBuilder({ open: true, editing: current })} className="btn-secondary flex items-center gap-1.5 text-xs"><Pencil className="w-3.5 h-3.5" /> Edit app</button>
                <button onClick={() => archive(current)} className="btn-secondary flex items-center gap-1.5 text-xs"><Archive className="w-3.5 h-3.5" /> Archive</button>
              </div>
            )}
          </div>
          {/* Keyed by id + field count so an edited definition redraws the list. */}
          <RecordsModule key={`${current.id}-${current.fields.length}-${current.statuses.join()}`} config={toConfig(current, profile, admin)} profile={profile} />
        </>
      )}

      <AppBuilder open={builder.open} editing={builder.editing} onClose={() => setBuilder({ open: false, editing: null })}
        onSaved={key => { setBuilder({ open: false, editing: null }); load(); open(key); }} />
    </div>
  );
}

export default function Page() {
  return <Suspense fallback={null}><AppsPage /></Suspense>;
}
