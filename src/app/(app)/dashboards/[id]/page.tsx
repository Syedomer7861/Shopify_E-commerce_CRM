"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import toast from "react-hot-toast";
import { ArrowLeft, Copy, Eye, GripVertical, History, Loader2, Pencil, Plus, Redo2, RotateCcw, Trash2, Undo2 } from "lucide-react";
import { AccessDenied } from "@/components/ui";
import { createClient } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { useCurrentProfile } from "@/hooks/useCurrentProfile";
import { hasPermission, isAdmin } from "@/lib/permissions";
import { can } from "@/lib/access";
import { ALL_TIME } from "@/components/DateRangeFilter";
import { DashboardGrid, HOME_WIDGETS, WIDGET_BY_KEY, WIDGET_SIZES, type LayoutItem, type WidgetSize } from "@/components/workspace/WorkspaceHome";
import { DASH_COLS, layoutProblems, type Dashboard } from "@/lib/dashboards";

type Meta = { name: string; category: string; description: string };
type Version = { version: number; note: string; published_at: string; published_by: string | null };
const input = "h-9 px-2 bg-white border border-[#eceae4] rounded-lg text-xs focus:outline-none focus:border-[#1c1c1c]/30";
const small = "inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border border-[#eceae4] disabled:opacity-40";
const CATEGORIES = Array.from(new Set(HOME_WIDGETS.map(w => w.category)));
const KNOWN = new Set(HOME_WIDGETS.map(w => w.key));
const newId = () => `w${Math.random().toString(36).slice(2, 9)}`;

export default function DashboardBuilderPage() {
  const { id } = useParams<{ id: string }>();
  const supabase = useMemo(() => createClient(), []);
  const { profile, loading: profileLoading } = useCurrentProfile();
  const [dash, setDash] = useState<Dashboard | null | undefined>(undefined);
  const [meta, setMeta] = useState<Meta>({ name: "", category: "", description: "" });
  // Undo/redo: past and future snapshots of the layout.
  const [items, setItems] = useState<LayoutItem[]>([]);
  const [past, setPast] = useState<LayoutItem[][]>([]);
  const [future, setFuture] = useState<LayoutItem[][]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [drag, setDrag] = useState<{ from?: number; widget?: string } | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [versions, setVersions] = useState<Version[] | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [peopleCount, setPeopleCount] = useState<number | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from("dashboards").select(DASH_COLS).eq("id", id).maybeSingle();
    if (error) toast.error(error.message);
    const d = (data as Dashboard | null) ?? null;
    setDash(d);
    if (!d) return;
    setMeta({ name: d.name, category: d.category, description: d.description });
    setItems(d.layout); setPast([]); setFuture([]); setDirty(false);
    const [v, a] = await Promise.all([
      supabase.from("dashboard_versions").select("version, note, published_at, published_by").eq("dashboard_id", id).order("version", { ascending: false }),
      supabase.from("dashboard_assignments").select("id", { count: "exact", head: true }).eq("dashboard_id", id),
    ]);
    const vs = (v.data ?? []) as Version[];
    setVersions(vs);
    setPeopleCount(a.count ?? 0);
    const ids = Array.from(new Set(vs.map(x => x.published_by).filter((x): x is string => !!x)));
    if (ids.length) {
      const { data: ppl } = await supabase.from("profiles").select("id, name").in("id", ids);
      setNames(Object.fromEntries(((ppl ?? []) as { id: string; name: string }[]).map(p => [p.id, p.name])));
    }
  }, [supabase, id]);
  useEffect(() => { if (!profileLoading) load(); }, [profileLoading, load]);

  // Warn before leaving with unsaved changes.
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  if (profileLoading || dash === undefined) return <div className="py-16 text-center text-gray-400"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>;
  if (!hasPermission(profile, "manage_team") && can(profile, "organisation", "view") === null) return <AccessDenied />;
  if (!dash) return <AccessDenied title="Dashboard not found" desc="It doesn't exist or you can't open it." />;
  const editable = dash.org_id ? isAdmin(profile) || can(profile, "organisation", "manage") !== null : !!profile?.is_platform_admin;

  const change = (next: LayoutItem[]) => { setPast(p => [...p.slice(-49), items]); setFuture([]); setItems(next); setDirty(true); };
  const undo = () => { if (!past.length) return; setFuture(f => [items, ...f]); setItems(past[past.length - 1]); setPast(p => p.slice(0, -1)); setDirty(true); };
  const redo = () => { if (!future.length) return; setPast(p => [...p, items]); setItems(future[0]); setFuture(f => f.slice(1)); setDirty(true); };
  const add = (widget: string, at = items.length) => {
    const w = WIDGET_BY_KEY.get(widget);
    const it: LayoutItem = { id: newId(), widget, size: w?.wide ? "full" : "m" };
    change([...items.slice(0, at), it, ...items.slice(at)]); setSelected(it.id);
  };
  const move = (from: number, to: number) => {
    if (from === to) return;
    const next = [...items]; const [it] = next.splice(from, 1); next.splice(to > from ? to - 1 : to, 0, it); change(next);
  };
  const patch = (iid: string, p: Partial<LayoutItem>) => change(items.map(i => (i.id === iid ? { ...i, ...p } : i)));
  const sel = items.find(i => i.id === selected) ?? null;
  const selW = sel ? WIDGET_BY_KEY.get(sel.widget) : null;
  const problems = layoutProblems(items, KNOWN);

  async function save(): Promise<boolean> {
    if (!meta.name.trim()) return toast.error("Name the dashboard"), false;
    if (problems.length) return toast.error(problems[0]), false;
    setBusy(true);
    const { error } = await supabase.from("dashboards").update({ name: meta.name.trim(), category: meta.category.trim() || "General", description: meta.description, layout: items }).eq("id", id);
    setBusy(false);
    if (error) return toast.error(error.message), false;
    setDirty(false); toast.success("Draft saved"); return true;
  }
  async function publish() {
    const who = peopleCount ? `${peopleCount} assignment(s) will switch to this version straight away.` : "Nobody is assigned yet.";
    const note = window.prompt(`Publish "${meta.name}" as version ${dash!.version + 1}? ${who}\n\nOptional note for the history:`, "");
    if (note === null) return;
    if (dirty && !(await save())) return;
    setBusy(true);
    const { error } = await supabase.rpc("dashboard_publish", { p_id: id, p_note: note });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Published"); load();
  }
  async function resetToTemplate() {
    if (!dash!.source_dashboard_id) return;
    const { data, error } = await supabase.from("dashboards").select("layout, published_layout").eq("id", dash!.source_dashboard_id).maybeSingle();
    if (error || !data) return toast.error("The original template isn't available any more");
    if (window.confirm("Replace the draft with the template's widgets? You can undo this until you save.")) change((data.published_layout ?? data.layout) as LayoutItem[]);
  }
  async function restore(v: number) {
    if (dirty && !window.confirm("Discard unsaved changes and load this version into the draft?")) return;
    setBusy(true);
    const { error } = await supabase.rpc("dashboard_restore", { p_id: id, p_version: v });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(`Version ${v} loaded into the draft. Publish to make it live.`); load();
  }

  return (
    <div className="animate-fade-in pb-10">
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <Link href="/dashboards" className="p-2 rounded-lg border border-[#eceae4]" aria-label="Back"><ArrowLeft className="w-4 h-4" /></Link>
        <input aria-label="Dashboard name" disabled={!editable} className={cn(input, "text-sm font-bold w-56")} maxLength={120} value={meta.name} onChange={e => { setMeta({ ...meta, name: e.target.value }); setDirty(true); }} />
        <input aria-label="Category" disabled={!editable} className={cn(input, "w-36")} maxLength={60} placeholder="Category" value={meta.category} onChange={e => { setMeta({ ...meta, category: e.target.value }); setDirty(true); }} />
        <span className="text-[10px] font-bold uppercase text-[#5f5f5d]">{dash.status}{dash.version ? ` · live v${dash.version}` : ""}{dirty ? " · unsaved" : ""}</span>
        <div className="ml-auto flex flex-wrap gap-1.5">
          {editable && <><button className={small} onClick={undo} disabled={!past.length} aria-label="Undo"><Undo2 className="w-3.5 h-3.5" /></button>
          <button className={small} onClick={redo} disabled={!future.length} aria-label="Redo"><Redo2 className="w-3.5 h-3.5" /></button></>}
          <button className={cn(small, previewing && "bg-[#1c1c1c] text-white")} onClick={() => setPreviewing(p => !p)}>{previewing ? <><Pencil className="w-3 h-3" /> Edit</> : <><Eye className="w-3 h-3" /> Preview</>}</button>
          {editable && dash.source_dashboard_id && <button className={small} onClick={resetToTemplate}><RotateCcw className="w-3 h-3" /> Reset to template</button>}
          {editable && <button className={small} onClick={save} disabled={busy || !dirty}>Save draft</button>}
          {editable && <button onClick={publish} disabled={busy || items.length === 0 || dash.status === "archived"} className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-[#1c1c1c] text-white disabled:opacity-50">Publish</button>}
        </div>
      </div>
      {problems.length > 0 && <div className="card p-3 mb-3 text-xs text-amber-700">{problems.join(" · ")}</div>}
      <textarea aria-label="Description" disabled={!editable} className="w-full mb-4 p-2 bg-white border border-[#eceae4] rounded-lg text-xs h-14" maxLength={500} placeholder="What this dashboard is for" value={meta.description} onChange={e => { setMeta({ ...meta, description: e.target.value }); setDirty(true); }} />

      {previewing ? (
        <div className="card p-4">
          <p className="text-[11px] text-[#5f5f5d] mb-4">Live preview with your access. Each person sees this layout with only what their own permissions allow. Below 1024px wide the widgets stack in one column.</p>
          {profile && <DashboardGrid profile={profile} range={ALL_TIME} items={items} />}
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[220px_1fr_260px]">
          {/* Library */}
          <aside className="card p-3 space-y-3 h-fit">
            <div className="text-xs font-bold text-[#1c1c1c]">Widgets</div>
            {CATEGORIES.map(c => (
              <div key={c}>
                <div className="text-[10px] font-black uppercase tracking-widest text-[#5f5f5d] mb-1">{c}</div>
                {HOME_WIDGETS.filter(w => w.category === c).map(w => (
                  <div key={w.key} draggable={editable} onDragStart={() => setDrag({ widget: w.key })} onDragEnd={() => setDrag(null)}
                    className="flex items-center gap-1 text-xs py-1.5 px-2 rounded-lg hover:bg-[#f7f4ed] cursor-grab" title={w.description}>
                    <span className="flex-1 truncate">{w.label}</span>
                    {editable && <button aria-label={`Add ${w.label}`} onClick={() => add(w.key)} className="p-0.5 rounded border border-[#eceae4]"><Plus className="w-3 h-3" /></button>}
                  </div>
                ))}
              </div>
            ))}
          </aside>

          {/* Canvas */}
          <section className="card p-3 min-h-[320px]" onDragOver={e => e.preventDefault()} onDrop={() => { if (drag?.widget) add(drag.widget); setDrag(null); }}>
            {items.length === 0 ? <div className="h-full min-h-[280px] flex items-center justify-center text-xs text-[#5f5f5d] border-2 border-dashed border-[#eceae4] rounded-xl">Drag widgets here, or use + in the list.</div> : (
              <div className="grid grid-cols-1 lg:grid-cols-6 gap-3">
                {items.map((it, i) => {
                  const w = WIDGET_BY_KEY.get(it.widget);
                  return (
                    <div key={it.id} draggable={editable} onClick={() => setSelected(it.id)}
                      onDragStart={e => { e.stopPropagation(); setDrag({ from: i }); }} onDragEnd={() => setDrag(null)}
                      onDragOver={e => e.preventDefault()}
                      onDrop={e => { e.stopPropagation(); if (drag?.from !== undefined) move(drag.from, i); else if (drag?.widget) add(drag.widget, i); setDrag(null); }}
                      className={cn(WIDGET_SIZES.find(s => s.value === it.size)?.cls, "rounded-xl border p-3 bg-white cursor-pointer min-h-[84px]",
                        selected === it.id ? "border-[#1c1c1c] ring-1 ring-[#1c1c1c]" : "border-[#eceae4]", !w && "border-rose-300")}>
                      <div className="flex items-center gap-1.5 text-xs">
                        <GripVertical className="w-3.5 h-3.5 text-[#5f5f5d]" />
                        <span className="font-semibold text-[#1c1c1c] truncate flex-1">{it.title || w?.label || `Unknown widget "${it.widget}"`}</span>
                        <span className="text-[10px] text-[#5f5f5d]">{WIDGET_SIZES.find(s => s.value === it.size)?.label}</span>
                      </div>
                      <p className="text-[10px] text-[#5f5f5d] mt-1 line-clamp-2">{w?.description ?? "No longer available; remove it."}</p>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Settings */}
          <aside className="space-y-4">
            <div className="card p-3 text-xs space-y-2">
              <div className="font-bold text-[#1c1c1c]">Widget settings</div>
              {!sel ? <p className="text-[#5f5f5d]">Select a widget on the canvas.</p> : (
                <>
                  <p className="text-[#5f5f5d]">{selW?.description}</p>
                  <label className="block">Title<input className={cn(input, "w-full mt-1")} maxLength={80} disabled={!editable} placeholder={selW?.title ?? selW?.label} value={sel.title ?? ""} onChange={e => patch(sel.id, { title: e.target.value || undefined })} /></label>
                  <label className="block">Width on desktop
                    <select className={cn(input, "w-full mt-1")} disabled={!editable} value={sel.size} onChange={e => patch(sel.id, { size: e.target.value as WidgetSize })}>
                      {WIDGET_SIZES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </select>
                  </label>
                  <p className="text-[10px] text-[#5f5f5d]">Data, filters and date range follow the viewer&apos;s access and the dashboard&apos;s date filter; they can&apos;t be widened here.</p>
                  {editable && <div className="flex gap-1.5 pt-1">
                    <button className={small} onClick={() => { const i = items.findIndex(x => x.id === sel.id); const c = { ...sel, id: newId() }; change([...items.slice(0, i + 1), c, ...items.slice(i + 1)]); setSelected(c.id); }}><Copy className="w-3 h-3" /> Duplicate</button>
                    <button className={cn(small, "text-rose-600")} onClick={() => { change(items.filter(x => x.id !== sel.id)); setSelected(null); }}><Trash2 className="w-3 h-3" /> Remove</button>
                  </div>}
                </>
              )}
            </div>
            <div className="card p-3 text-xs">
              <div className="font-bold text-[#1c1c1c] mb-2 flex items-center gap-1.5"><History className="w-3.5 h-3.5" /> Version history</div>
              {!versions?.length ? <p className="text-[#5f5f5d]">Not published yet.</p> : (
                <ul className="space-y-2">
                  {versions.map(v => (
                    <li key={v.version} className="flex items-start gap-2">
                      <span className="font-bold w-7">v{v.version}</span>
                      <span className="flex-1 min-w-0 text-[#5f5f5d]">{new Date(v.published_at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}{v.published_by ? ` · ${names[v.published_by] ?? "—"}` : ""}{v.note ? <><br />{v.note}</> : null}</span>
                      {editable && <button className={small} disabled={busy} onClick={() => restore(v.version)}>Load</button>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
