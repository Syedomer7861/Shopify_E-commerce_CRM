"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Copy, Eye, LayoutGrid, Loader2, Pencil, Plus, Search, Users } from "lucide-react";
import { AccessDenied, EmptyState, Modal, PageHeader } from "@/components/ui";
import { createClient } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { useCurrentProfile } from "@/hooks/useCurrentProfile";
import { hasPermission, isAdmin } from "@/lib/permissions";
import { can } from "@/lib/access";
import { ALL_TIME } from "@/components/DateRangeFilter";
import { DashboardGrid } from "@/components/workspace/WorkspaceHome";
import { AssignDialog } from "@/components/dashboards/AssignDialog";
import { loadDirectory, resolveFor, targetLabel, type Dashboard, type Directory } from "@/lib/dashboards";

const STATUS_CLS = { draft: "bg-sky-50 text-sky-700", published: "bg-emerald-50 text-emerald-700", archived: "bg-gray-100 text-[#5f5f5d]" };
const small = "inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border border-[#ebece6] disabled:opacity-40";

export default function AllDashboardsPage() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const { profile, loading: profileLoading } = useCurrentProfile();
  const [dir, setDir] = useState<Directory | null>(null);
  const [view, setView] = useState<"ours" | "templates">("ours");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | Dashboard["status"]>("all");
  const [sort, setSort] = useState<"name" | "updated" | "people">("name");
  const [preview, setPreview] = useState<Dashboard | null>(null);
  const [assigning, setAssigning] = useState<Dashboard | null>(null);
  const [busy, setBusy] = useState(false);
  const canView = hasPermission(profile, "manage_team") || can(profile, "organisation", "view") !== null;
  const canManage = isAdmin(profile) || can(profile, "organisation", "manage") !== null;

  const load = useCallback(() => {
    loadDirectory(supabase).then(setDir).catch(e => toast.error(e.message));
  }, [supabase]);
  useEffect(() => { if (!profileLoading && canView) load(); }, [profileLoading, canView, load]);

  if (profileLoading) return null;
  if (!canView) return <AccessDenied />;

  const ours = dir?.dashboards.filter(d => d.org_id) ?? [];
  const templates = dir?.dashboards.filter(d => !d.org_id) ?? [];
  const published = new Set(ours.filter(d => d.status === "published").map(d => d.id));
  const lands = dir ? resolveFor(dir.people, dir.assignments, published) : new Map<string, string>();
  const peopleOn = (id: string) => Array.from(lands.values()).filter(v => v === id).length;
  const nameOf = (id: string | null) => (id && dir?.people.find(p => p.id === id)?.name) || "—";
  const covered = new Set(dir?.assignments.filter(a => a.target_type === "role" && published.has(a.dashboard_id)).map(a => a.target_key));
  const uncoveredRoles = (dir?.roles ?? []).filter(r => r !== "admin" && !covered.has(r));
  const defaultHome = dir ? dir.people.filter(p => !lands.has(p.id)).length : 0;

  const list = (view === "ours" ? ours : templates)
    .filter(d => (status === "all" || d.status === status) && `${d.name} ${d.category} ${d.description}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => sort === "updated" ? b.updated_at.localeCompare(a.updated_at) : sort === "people" ? peopleOn(b.id) - peopleOn(a.id) : a.name.localeCompare(b.name));

  async function run(p: PromiseLike<{ error: { message: string } | null }>, ok: string) {
    setBusy(true);
    const { error } = await p;
    setBusy(false);
    if (error) return toast.error(error.message), false;
    toast.success(ok); load(); return true;
  }
  async function copy(d: Dashboard) {
    setBusy(true);
    const { data, error } = await supabase.rpc("dashboard_copy", { p_source: d.id, p_name: d.org_id ? `${d.name} (copy)` : d.name });
    setBusy(false);
    if (error) return toast.error(error.message);
    router.push(`/dashboards/${data}`);
  }
  async function create() {
    const id = crypto.randomUUID();
    if (await run(supabase.from("dashboards").insert({ id, org_id: profile?.org_id, name: "New dashboard", category: "General" }), "Draft created")) router.push(`/dashboards/${id}`);
  }

  return (
    <div className="animate-fade-in pb-10">
      <PageHeader title="All dashboards" subtitle="What each role, team or person lands on. A dashboard only chooses widgets; every widget still follows the viewer's own permissions."
        actions={canManage ? <button onClick={create} disabled={busy} className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg bg-[#1c1c1c] text-white disabled:opacity-50"><Plus className="w-3.5 h-3.5" /> New dashboard</button> : undefined} />

      {!dir ? <div className="py-16 text-center text-gray-400"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div> : (
        <>
          <div className="card p-4 mb-4 text-xs text-[#5f5f5d] flex flex-wrap gap-x-6 gap-y-1">
            <span><b className="text-[#1c1c1c]">{dir.people.length - defaultHome}</b> of {dir.people.length} active people land on an assigned dashboard; the rest get their role&apos;s home screen.</span>
            {uncoveredRoles.length > 0 && <span>Roles without one: <b className="text-[#1c1c1c]">{uncoveredRoles.map(r => r.replace(/_/g, " ")).join(", ")}</b></span>}
            <span>The call-queue home (agents, admins) isn&apos;t affected.</span>
          </div>

          <div className="flex flex-wrap items-center gap-2 mb-4">
            <nav className="flex gap-1 border-b border-[#ebece6] mr-auto">
              {(["ours", "templates"] as const).map(v => (
                <button key={v} onClick={() => setView(v)} className={cn("px-3 py-2 text-xs font-semibold border-b-2 -mb-px", view === v ? "border-[#1c1c1c] text-[#1c1c1c]" : "border-transparent text-[#5f5f5d]")}>
                  {v === "ours" ? `Our dashboards (${ours.length})` : `Templates (${templates.length})`}
                </button>
              ))}
            </nav>
            <label className="relative"><Search className="w-3.5 h-3.5 absolute left-2 top-2.5 text-[#5f5f5d]" /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Search" className="h-9 pl-7 pr-2 bg-white border border-[#ebece6] rounded-lg text-xs w-40" /></label>
            <select aria-label="Status" value={status} onChange={e => setStatus(e.target.value as typeof status)} className="h-9 px-2 bg-white border border-[#ebece6] rounded-lg text-xs">
              <option value="all">Any status</option><option value="draft">Draft</option><option value="published">Published</option><option value="archived">Archived</option>
            </select>
            <select aria-label="Sort" value={sort} onChange={e => setSort(e.target.value as typeof sort)} className="h-9 px-2 bg-white border border-[#ebece6] rounded-lg text-xs">
              <option value="name">Name</option><option value="updated">Last modified</option><option value="people">People assigned</option>
            </select>
          </div>

          {list.length === 0 ? (
            <EmptyState icon={<LayoutGrid className="w-6 h-6" />} title={view === "ours" ? "No dashboards yet" : "No templates"} desc={view === "ours" ? "Start from a template, or create a blank dashboard." : undefined} />
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {list.map(d => {
                const assigns = dir.assignments.filter(a => a.dashboard_id === d.id);
                const editable = d.org_id ? canManage : !!profile?.is_platform_admin;
                return (
                  <div key={d.id} className="card p-4 flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <span className={cn("text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full", STATUS_CLS[d.status])}>{d.status}</span>
                      <span className="text-[10px] text-[#5f5f5d]">{d.category}{d.version ? ` · v${d.version}` : ""}</span>
                    </div>
                    <div className="text-sm font-bold text-[#1c1c1c]">{d.name}</div>
                    {d.description && <p className="text-xs text-[#5f5f5d] line-clamp-2">{d.description}</p>}
                    <div className="text-[10px] text-[#5f5f5d]">
                      {(d.published_layout ?? d.layout).length} widgets
                      {d.org_id && <> · <Users className="w-3 h-3 inline" /> {peopleOn(d.id)} people · modified {new Date(d.updated_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} by {nameOf(d.updated_by)}</>}
                    </div>
                    {assigns.length > 0 && <div className="text-[10px] text-[#5f5f5d]">For: {assigns.map(a => targetLabel(dir, a.target_type, a.target_key)).join(", ")}</div>}
                    <div className="flex flex-wrap gap-1.5 mt-auto pt-1">
                      <button className={small} onClick={() => setPreview(d)}><Eye className="w-3 h-3" /> Preview</button>
                      {editable && <Link className={small} href={`/dashboards/${d.id}`}><Pencil className="w-3 h-3" /> Edit</Link>}
                      {canManage && <button className={small} disabled={busy} onClick={() => copy(d)}><Copy className="w-3 h-3" /> {d.org_id ? "Duplicate" : "Use template"}</button>}
                      {canManage && d.org_id && d.status !== "archived" && <button className={small} onClick={() => setAssigning(d)}>Assign</button>}
                      {canManage && d.org_id && d.status !== "archived" && (
                        <button className={small} disabled={busy} onClick={() => (assigns.length === 0 || window.confirm(`Archive "${d.name}"? ${peopleOn(d.id)} people go back to their role's home screen.`)) && run(supabase.from("dashboards").update({ status: "archived" }).eq("id", d.id), "Archived")}>Archive</button>
                      )}
                      {canManage && d.org_id && d.status === "archived" && <button className={small} disabled={busy} onClick={() => run(supabase.from("dashboards").update({ status: d.version > 0 ? "published" : "draft" }).eq("id", d.id), "Restored")}>Restore</button>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      <Modal open={!!preview} onClose={() => setPreview(null)} title={preview ? `Preview: ${preview.name}` : ""} maxWidth="max-w-6xl">
        {preview && profile && (
          <div className="max-h-[75vh] overflow-y-auto">
            <p className="text-[11px] text-[#5f5f5d] mb-4">Shown with <b>your</b> access. Each person sees the same layout filled with only what their own permissions allow; widgets they can&apos;t use don&apos;t appear.</p>
            <DashboardGrid profile={profile} range={ALL_TIME} items={preview.published_layout ?? preview.layout} />
          </div>
        )}
      </Modal>
      {assigning && dir && <AssignDialog dashboard={assigning} dir={dir} onClose={() => setAssigning(null)} onChanged={load} />}
    </div>
  );
}
