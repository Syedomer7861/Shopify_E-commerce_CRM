"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BellRing, Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import { PageHeader, EmptyState } from "@/components/ui";
import { createClient } from "@/lib/supabase";
import { cn } from "@/lib/utils";

type Notice = {
  id: string; title: string; body: string; level: "info" | "warning"; starts_at: string; ends_at: string | null;
  audience_plans: string[] | null; audience_orgs: string[] | null; is_archived: boolean;
};
type Option = { id: string; name: string };
type Form = { id: string | null; title: string; body: string; level: "info" | "warning"; starts: string; ends: string; plans: string[]; orgs: string[] };

const input = "h-9 px-3 bg-white border border-[#eceae4] rounded-lg text-sm focus:outline-none focus:border-[#1c1c1c]/30";
// <input type="datetime-local"> works in local time without a zone.
const toLocal = (iso: string) => { const d = new Date(iso); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };
const blank = (): Form => ({ id: null, title: "", body: "", level: "info", starts: toLocal(new Date().toISOString()), ends: "", plans: [], orgs: [] });
const when = (iso: string) => new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

function status(n: Notice) {
  const now = Date.now();
  if (n.is_archived) return { l: "Archived", c: "bg-gray-100 text-[#5f5f5d]" };
  if (new Date(n.starts_at).getTime() > now) return { l: "Scheduled", c: "bg-sky-50 text-sky-700" };
  if (n.ends_at && new Date(n.ends_at).getTime() <= now) return { l: "Ended", c: "bg-gray-100 text-[#5f5f5d]" };
  return { l: "Live", c: "bg-emerald-50 text-emerald-700" };
}

export default function SuperAdminNotices() {
  const supabase = useMemo(() => createClient(), []);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [plans, setPlans] = useState<{ code: string; name: string }[]>([]);
  const [orgs, setOrgs] = useState<Option[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<Form>(blank);
  const [orgPick, setOrgPick] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [n, p, o] = await Promise.all([
      supabase.from("platform_notices").select("*").order("starts_at", { ascending: false }).limit(200),
      supabase.from("subscription_plans").select("code, name").order("sort_order"),
      supabase.from("organizations").select("id, name").order("name"),
    ]);
    if (n.error) toast.error(n.error.message);
    setNotices((n.data || []) as Notice[]);
    setPlans((p.data || []) as { code: string; name: string }[]);
    setOrgs((o.data || []) as Option[]);
    setLoading(false);
  }, [supabase]);
  useEffect(() => { load(); }, [load]);

  async function save(f: Form, archived: boolean | null) {
    if (!f.title.trim()) return toast.error("Add a title");
    if (f.ends && f.ends <= f.starts) return toast.error("End must be after start");
    setBusy(true);
    const { error } = await supabase.rpc("platform_save_notice", {
      p_id: f.id, p_title: f.title, p_body: f.body.trim(), p_level: f.level,
      p_starts_at: new Date(f.starts).toISOString(), p_ends_at: f.ends ? new Date(f.ends).toISOString() : null,
      p_plans: f.plans, p_orgs: f.orgs, p_archived: archived,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(archived ? "Archived" : f.id ? "Saved" : "Notice created");
    setForm(blank());
    load();
  }

  const toForm = (n: Notice): Form => ({
    id: n.id, title: n.title, body: n.body, level: n.level, starts: toLocal(n.starts_at), ends: n.ends_at ? toLocal(n.ends_at) : "",
    plans: n.audience_plans || [], orgs: n.audience_orgs || [],
  });
  const toggle = (list: string[], v: string) => list.includes(v) ? list.filter(x => x !== v) : [...list, v];
  const orgName = (id: string) => orgs.find(o => o.id === id)?.name || id.slice(0, 8);
  const audience = (n: Notice) => [
    n.audience_plans ? `Plans: ${n.audience_plans.join(", ")}` : null,
    n.audience_orgs ? `Organisations: ${n.audience_orgs.map(orgName).join(", ")}` : null,
  ].filter(Boolean).join(" · ") || "All workspaces";

  if (loading) return <div className="py-12 text-center text-gray-400"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>;

  return (
    <div>
      <PageHeader title="Notices" subtitle="Show a banner inside customers' workspaces: maintenance, new features, reminders." />

      <div className="card p-4 mb-4 space-y-3">
        <div className="text-xs font-bold text-[#1c1c1c]">{form.id ? "Edit notice" : "New notice"}</div>
        <div className="flex flex-wrap gap-2">
          <input className={cn(input, "flex-1 min-w-[200px]")} maxLength={120} placeholder="Title, e.g. Scheduled maintenance Sunday 2am" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
          <select className={input} value={form.level} onChange={e => setForm({ ...form, level: e.target.value as Form["level"] })}>
            <option value="info">Information</option>
            <option value="warning">Warning (amber)</option>
          </select>
        </div>
        <textarea className={cn(input, "w-full h-20 py-2")} maxLength={1000} placeholder="Details (optional)" value={form.body} onChange={e => setForm({ ...form, body: e.target.value })} />
        <div className="flex flex-wrap gap-2">
          <label className="text-[10px] text-[#5f5f5d]">Shows from<br /><input type="datetime-local" className={input} value={form.starts} onChange={e => setForm({ ...form, starts: e.target.value })} /></label>
          <label className="text-[10px] text-[#5f5f5d]">Until (optional)<br /><input type="datetime-local" className={input} value={form.ends} onChange={e => setForm({ ...form, ends: e.target.value })} /></label>
        </div>
        <div className="text-[10px] text-[#5f5f5d]">Plans (none ticked = every plan)</div>
        <div className="flex flex-wrap gap-2">
          {plans.map(p => (
            <button key={p.code} type="button" onClick={() => setForm({ ...form, plans: toggle(form.plans, p.code) })}
              className={cn("text-xs px-3 py-1.5 rounded-full border", form.plans.includes(p.code) ? "bg-[#1c1c1c] text-white border-[#1c1c1c]" : "border-[#eceae4] text-[#5f5f5d]")}>
              {p.name}
            </button>
          ))}
        </div>
        <div className="text-[10px] text-[#5f5f5d]">Organisations (none = every organisation)</div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {form.orgs.map(id => (
            <span key={id} className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-[#f7f4ed]">
              {orgName(id)}<button onClick={() => setForm({ ...form, orgs: form.orgs.filter(x => x !== id) })} aria-label={`Remove ${orgName(id)}`} className="ml-1 font-bold">×</button>
            </span>
          ))}
          <select className={cn(input, "h-8 text-xs")} value={orgPick} onChange={e => setOrgPick(e.target.value)}>
            <option value="">Organisation...</option>
            {orgs.filter(o => !form.orgs.includes(o.id)).map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
          <button disabled={!orgPick} onClick={() => { setForm({ ...form, orgs: [...form.orgs, orgPick] }); setOrgPick(""); }} className="px-2 py-1 rounded-lg border border-[#eceae4] disabled:opacity-40">Add</button>
        </div>
        <div className="flex gap-2">
          <button onClick={() => save(form, null)} disabled={busy} className="text-xs font-semibold px-4 py-2 rounded-lg bg-[#1c1c1c] text-white disabled:opacity-50">{form.id ? "Save" : "Publish"}</button>
          {form.id && <button onClick={() => setForm(blank())} className="text-xs px-3 py-2 rounded-lg border border-[#eceae4]">Cancel</button>}
        </div>
      </div>

      {notices.length === 0 ? (
        <EmptyState icon={<BellRing className="w-6 h-6" />} title="No notices yet" desc="Published notices appear at the top of every page for the workspaces you choose." />
      ) : (
        <div className="space-y-2">
          {notices.map(n => {
            const s = status(n);
            return (
              <div key={n.id} className="card p-4 flex flex-wrap items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={cn("text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full", s.c)}>{s.l}</span>
                    {n.level === "warning" && <span className="text-[10px] font-bold uppercase text-amber-600">Warning</span>}
                    <span className="text-sm font-semibold text-[#1c1c1c] truncate">{n.title}</span>
                  </div>
                  <div className="text-xs text-[#5f5f5d] mt-1">{when(n.starts_at)}{n.ends_at ? ` to ${when(n.ends_at)}` : ", no end"} · {audience(n)}</div>
                </div>
                <button onClick={() => setForm(toForm(n))} className="text-xs px-3 py-1.5 rounded-lg border border-[#eceae4]">Edit</button>
                <button onClick={() => save(toForm(n), !n.is_archived)}
                  disabled={busy} className="text-xs px-3 py-1.5 rounded-lg border border-[#eceae4] disabled:opacity-50">
                  {n.is_archived ? "Restore" : "Archive"}
                </button>
              </div>
            );
          })}
        </div>
      )}
      <p className="text-[11px] text-[#5f5f5d] mt-4">Members see up to five live notices, newest first. Each person can dismiss a notice in their own browser. Archive a notice to remove it for everyone.</p>
    </div>
  );
}
