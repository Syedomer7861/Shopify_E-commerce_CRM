"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Copy, ExternalLink, Loader2, Plus, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import { createClient } from "@/lib/supabase";
import { cn } from "@/lib/utils";

type Form = {
  id: string; name: string; title: string; intro: string; fields: string[]; source: string;
  assign_to: string | null; success_message: string; is_active: boolean; submissions: number; last_submission_at: string | null;
};
const BUILT_IN: [string, string][] = [["email", "Email"], ["phone", "Phone"], ["company", "Company"], ["notes", "Message"]];
const EMPTY: Omit<Form, "id" | "submissions" | "last_submission_at"> = {
  name: "", title: "Get in touch", intro: "", fields: ["email", "phone"], source: "Website form",
  assign_to: null, success_message: "Thank you. We will get back to you soon.", is_active: true,
};
const input = "h-9 px-3 bg-white border border-[#eceae4] rounded-lg text-sm focus:outline-none focus:border-[#1c1c1c]/30";

/** Web-to-lead forms. Admins write them (row security); submissions arrive as leads. */
export function WebFormsManager() {
  const supabase = useMemo(() => createClient(), []);
  const [forms, setForms] = useState<Form[]>([]);
  const [custom, setCustom] = useState<{ key: string; label: string }[]>([]);
  const [people, setPeople] = useState<{ id: string; name: string }[]>([]);
  const [draft, setDraft] = useState<typeof EMPTY & { id?: string }>(EMPTY);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const origin = typeof window === "undefined" ? "" : window.location.origin;

  const load = useCallback(async () => {
    const [f, c, p] = await Promise.all([
      supabase.from("web_forms").select("*").order("created_at", { ascending: false }),
      supabase.from("custom_field_defs").select("key,label").eq("entity", "leads").eq("is_active", true).order("sort_order"),
      supabase.from("profiles").select("id,name").eq("is_active", true).order("name"),
    ]);
    if (f.error) toast.error(f.error.message);
    setForms((f.data || []) as Form[]);
    setCustom((c.data || []) as { key: string; label: string }[]);
    setPeople((p.data || []) as { id: string; name: string }[]);
    setLoading(false);
  }, [supabase]);
  useEffect(() => { load(); }, [load]);

  async function save() {
    if (!draft.name.trim()) return toast.error("Give the form a name");
    setBusy(true);
    const row = { name: draft.name.trim(), title: draft.title.trim() || "Get in touch", intro: draft.intro.trim(), fields: draft.fields,
      source: draft.source.trim() || "Website form", assign_to: draft.assign_to || null, success_message: draft.success_message.trim() || EMPTY.success_message, is_active: draft.is_active };
    const { error } = draft.id
      ? await supabase.from("web_forms").update(row).eq("id", draft.id)
      : await supabase.from("web_forms").insert({ id: crypto.randomUUID(), ...row });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Form saved");
    setEditing(false); setDraft(EMPTY); load();
  }

  async function remove(f: Form) {
    if (!window.confirm(`Delete the form "${f.name}"? Leads it already created stay.`)) return;
    const { error } = await supabase.from("web_forms").delete().eq("id", f.id);
    if (error) return toast.error(error.message);
    load();
  }

  const copy = (text: string) => navigator.clipboard.writeText(text).then(() => toast.success("Copied"), () => toast.error("Could not copy"));
  const toggleField = (k: string) => setDraft(d => ({ ...d, fields: d.fields.includes(k) ? d.fields.filter(x => x !== k) : [...d.fields, k] }));

  return (
    <div className="card p-6 space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-[10px] font-bold text-[#1c1c1c] uppercase tracking-widest mb-2">Web forms</h3>
          <p className="text-xs text-[#5f5f5d]">Put a form on your website or share its link. Every response becomes a new lead.</p>
        </div>
        {!editing && <button onClick={() => { setDraft(EMPTY); setEditing(true); }} className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 h-9 rounded-lg bg-[#1c1c1c] text-white"><Plus className="w-3.5 h-3.5" /> New form</button>}
      </div>

      {editing && (
        <div className="rounded-lg border border-[#eceae4] p-4 space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="text-[10px] text-[#5f5f5d]">Form name (only you see this)<input className={cn(input, "w-full mt-1")} maxLength={80} value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} placeholder="Website contact form" /></label>
            <label className="text-[10px] text-[#5f5f5d]">Heading on the form<input className={cn(input, "w-full mt-1")} maxLength={120} value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} /></label>
          </div>
          <label className="block text-[10px] text-[#5f5f5d]">Short intro (optional)<input className={cn(input, "w-full mt-1")} maxLength={500} value={draft.intro} onChange={e => setDraft({ ...draft, intro: e.target.value })} /></label>
          <div>
            <div className="text-[10px] text-[#5f5f5d] mb-1">Fields to ask (name is always asked)</div>
            <div className="flex flex-wrap gap-2">
              {[...BUILT_IN, ...custom.map(c => [`cf:${c.key}`, c.label] as [string, string])].map(([k, l]) => (
                <label key={k} className="flex items-center gap-1 text-xs border border-[#eceae4] rounded-full px-2.5 py-1">
                  <input type="checkbox" checked={draft.fields.includes(k)} onChange={() => toggleField(k)} /> {l}
                </label>
              ))}
            </div>
            {custom.length === 0 && <p className="text-[10px] text-[#5f5f5d] mt-1">Add lead fields in Custom Fields to ask more questions.</p>}
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="text-[10px] text-[#5f5f5d]">Give new leads to
              <select className={cn(input, "w-full mt-1")} value={draft.assign_to || ""} onChange={e => setDraft({ ...draft, assign_to: e.target.value || null })}>
                <option value="">Nobody yet (admins see them)</option>
                {people.map(p => <option key={p.id} value={p.id}>{p.name || "Unnamed"}</option>)}
              </select>
            </label>
            <label className="text-[10px] text-[#5f5f5d]">Lead source<input className={cn(input, "w-full mt-1")} maxLength={60} value={draft.source} onChange={e => setDraft({ ...draft, source: e.target.value })} /></label>
          </div>
          <label className="block text-[10px] text-[#5f5f5d]">Message after sending<input className={cn(input, "w-full mt-1")} maxLength={300} value={draft.success_message} onChange={e => setDraft({ ...draft, success_message: e.target.value })} /></label>
          <label className="flex items-center gap-2 text-xs text-[#5f5f5d]"><input type="checkbox" checked={draft.is_active} onChange={e => setDraft({ ...draft, is_active: e.target.checked })} /> Accepting responses</label>
          <div className="flex gap-2">
            <button onClick={save} disabled={busy} className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 h-9 rounded-lg bg-[#1c1c1c] text-white disabled:opacity-50">{busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Save form</button>
            <button onClick={() => { setEditing(false); setDraft(EMPTY); }} className="text-xs font-semibold px-3 h-9 rounded-lg border border-[#eceae4]">Cancel</button>
          </div>
        </div>
      )}

      {loading ? <Loader2 className="w-4 h-4 animate-spin text-gray-400" /> : forms.length === 0 && !editing ? (
        <p className="text-xs text-[#5f5f5d]">No forms yet.</p>
      ) : (
        <div className="divide-y divide-[#eceae4] border border-[#eceae4] rounded-lg">
          {forms.map(f => {
            const link = `${origin}/f/${f.id}`;
            const embed = `<iframe src="${link}" style="width:100%;min-height:640px;border:0" title="${f.title.replace(/"/g, "&quot;")}"></iframe>`;
            return (
              <div key={f.id} className={cn("p-3 space-y-2", !f.is_active && "opacity-60")}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-sm text-[#1c1c1c] flex-1 min-w-[140px]">{f.name}</span>
                  <span className="text-[11px] text-[#5f5f5d]">{f.submissions} response{f.submissions === 1 ? "" : "s"}{!f.is_active && " · paused"}</span>
                  <button onClick={() => { setDraft({ ...f }); setEditing(true); }} className="text-[11px] font-semibold px-2 py-1 rounded border border-[#eceae4]">Edit</button>
                  <button onClick={() => remove(f)} aria-label="Delete form" className="p-1 text-rose-600"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
                <div className="flex flex-wrap gap-2 text-[11px]">
                  <a href={link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 px-2 py-1 rounded bg-[#f7f4ed]"><ExternalLink className="w-3 h-3" /> Open form</a>
                  <button onClick={() => copy(link)} className="inline-flex items-center gap-1 px-2 py-1 rounded bg-[#f7f4ed]"><Copy className="w-3 h-3" /> Copy link</button>
                  <button onClick={() => copy(embed)} className="inline-flex items-center gap-1 px-2 py-1 rounded bg-[#f7f4ed]"><Copy className="w-3 h-3" /> Copy embed code</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
