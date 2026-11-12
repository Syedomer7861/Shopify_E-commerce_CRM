"use client";
import { useEffect, useState } from "react";
import { Plus, Trash2, Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import { Modal, Select } from "@/components/ui";
import { createClient } from "@/lib/supabase";
import { APP_TEMPLATES, FIELD_TYPES, slug, type AppDefinition, type CustomModule } from "@/lib/app-templates";
import type { RecordField } from "@/components/records/RecordsModule";

type DraftField = { key?: string; label: string; type: NonNullable<RecordField["type"]>; required: boolean; options: string };
type Draft = { label: string; noun: string; description: string; visibility: "everyone" | "own"; statuses: string; fields: DraftField[] };

const EMPTY: Draft = { label: "", noun: "", description: "", visibility: "everyone", statuses: "open, in progress, done", fields: [{ label: "", type: "text", required: true, options: "" }] };
const MAX_FIELDS = 30;

const toDraft = (d: AppDefinition): Draft => ({
  label: d.label, noun: d.noun, description: d.description || "", visibility: d.visibility,
  statuses: d.statuses.map(s => s.replace(/_/g, " ")).join(", "),
  fields: d.fields.map(f => ({ key: f.key, label: f.label, type: f.type || "text", required: !!f.required, options: (f.options || []).join(", ") })),
});

const list = (text: string) => text.split(",").map(s => s.trim()).filter(Boolean);

/** Turns the form into a definition, or returns the first problem as a string. */
function toDefinition(draft: Draft): AppDefinition | string {
  const label = draft.label.trim();
  const noun = draft.noun.trim().toLowerCase();
  if (label.length < 2) return "Give the app a name";
  if (!/^[a-z]/.test(slug(label))) return "The app name must start with a letter";
  if (!noun) return "Say what one record is called (for example: asset)";
  const statuses = Array.from(new Set(list(draft.statuses).map(s => slug(s, "_")).filter(Boolean)));
  if (statuses.length < 1 || statuses.length > 12) return "Add 1 to 12 statuses, separated by commas";

  const fields: RecordField[] = [];
  const used = new Set(["id", "status", "owner_id", "org_id", "module_id", "created_at", "data"]);
  for (const f of draft.fields) {
    const fieldLabel = f.label.trim();
    if (!fieldLabel) continue;
    // An existing field keeps its key, so renaming a label never orphans saved values.
    const key = f.key || slug(fieldLabel, "_");
    if (!key || used.has(key)) return `Two fields can't share the name "${fieldLabel}"`;
    used.add(key);
    const options = list(f.options);
    if (f.type === "select" && options.length < 2) return `"${fieldLabel}" needs at least two choices`;
    fields.push({ key, label: fieldLabel, type: f.type, ...(f.required ? { required: true } : {}), ...(f.type === "select" ? { options } : {}) });
  }
  if (fields.length === 0) return "Add at least one field";
  return { label, noun, description: draft.description.trim(), visibility: draft.visibility, statuses, fields };
}

/** Create or edit an app. `editing` null = new. */
export function AppBuilder({ open, editing, onClose, onSaved }: { open: boolean; editing: CustomModule | null; onClose: () => void; onSaved: (key: string) => void }) {
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (open) setDraft(editing ? toDraft(editing) : EMPTY); }, [open, editing]);

  const setField = (i: number, patch: Partial<DraftField>) =>
    setDraft(d => ({ ...d, fields: d.fields.map((f, n) => (n === i ? { ...f, ...patch } : f)) }));

  async function save() {
    const def = toDefinition(draft);
    if (typeof def === "string") return toast.error(def);
    setSaving(true);
    const supabase = createClient();
    const key = editing?.key || slug(def.label);
    const { error } = editing
      ? await supabase.from("custom_modules").update(def).eq("id", editing.id)
      : await supabase.from("custom_modules").insert({ id: crypto.randomUUID(), key, ...def });
    setSaving(false);
    if (error) return toast.error(error.code === "23505" ? "An app with that name already exists" : error.message);
    toast.success(editing ? "App updated" : "App created");
    onSaved(key);
  }

  return (
    <Modal open={open} onClose={saving ? () => {} : onClose} title={editing ? `Edit ${editing.label}` : "New app"}
      footer={<button onClick={save} disabled={saving} className="btn-primary w-full py-2.5">{saving ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : editing ? "Save changes" : "Create app"}</button>}>
      <div className="space-y-4">
        {!editing && (
          <div>
            <p className="text-xs font-medium text-gray-700 mb-1.5">Start from a template</p>
            <div className="flex flex-wrap gap-1.5">
              {APP_TEMPLATES.map(t => (
                <button key={t.label} type="button" onClick={() => setDraft(toDraft(t))}
                  className="px-2.5 py-1.5 rounded-full border border-[#eceae4] text-[11px] font-bold text-[#1c1c1c] hover:bg-white">{t.label}</button>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor="app-label" className="text-xs font-medium text-gray-700 block mb-1">App name *</label>
            <input id="app-label" className="input" maxLength={60} placeholder="Asset Register" value={draft.label} onChange={e => setDraft(d => ({ ...d, label: e.target.value }))} />
          </div>
          <div>
            <label htmlFor="app-noun" className="text-xs font-medium text-gray-700 block mb-1">One record is called *</label>
            <input id="app-noun" className="input" maxLength={40} placeholder="asset" value={draft.noun} onChange={e => setDraft(d => ({ ...d, noun: e.target.value }))} />
          </div>
        </div>
        <div>
          <label htmlFor="app-desc" className="text-xs font-medium text-gray-700 block mb-1">What is it for?</label>
          <input id="app-desc" className="input" maxLength={200} value={draft.description} onChange={e => setDraft(d => ({ ...d, description: e.target.value }))} />
        </div>
        <div>
          <label htmlFor="app-statuses" className="text-xs font-medium text-gray-700 block mb-1">Statuses, in order, separated by commas *</label>
          <input id="app-statuses" className="input" value={draft.statuses} onChange={e => setDraft(d => ({ ...d, statuses: e.target.value }))} />
        </div>
        <div>
          <p className="text-xs font-medium text-gray-700 mb-1">Who sees the records?</p>
          <Select value={draft.visibility} onChange={v => setDraft(d => ({ ...d, visibility: v as Draft["visibility"] }))}
            options={[{ value: "everyone", label: "Everyone in the organisation" }, { value: "own", label: "Each person sees only their own (admins see all)" }]} />
        </div>

        <div>
          <p className="text-xs font-medium text-gray-700 mb-1.5">Fields</p>
          <div className="space-y-2">
            {draft.fields.map((f, i) => (
              <div key={i} className="rounded-lg border border-[#eceae4] p-2.5 space-y-2">
                <div className="flex gap-2">
                  <input aria-label={`Field ${i + 1} name`} className="input flex-1 min-w-0" placeholder="Field name" maxLength={40} value={f.label} onChange={e => setField(i, { label: e.target.value })} />
                  <button type="button" aria-label={`Remove field ${i + 1}`} disabled={draft.fields.length === 1}
                    onClick={() => setDraft(d => ({ ...d, fields: d.fields.filter((_, n) => n !== i) }))}
                    className="px-2 text-gray-400 hover:text-rose-500 disabled:opacity-30"><Trash2 className="w-4 h-4" /></button>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="w-40"><Select value={f.type} onChange={v => setField(i, { type: v as DraftField["type"] })} options={FIELD_TYPES} triggerClassName="text-xs" /></div>
                  <label className="flex items-center gap-1.5 text-[11px] text-[#1c1c1c]">
                    <input type="checkbox" checked={f.required} onChange={e => setField(i, { required: e.target.checked })} /> Required
                  </label>
                </div>
                {f.type === "select" && (
                  <input aria-label={`Field ${i + 1} choices`} className="input" placeholder="Choices, separated by commas" value={f.options} onChange={e => setField(i, { options: e.target.value })} />
                )}
              </div>
            ))}
          </div>
          {draft.fields.length < MAX_FIELDS && (
            <button type="button" onClick={() => setDraft(d => ({ ...d, fields: [...d.fields, { label: "", type: "text", required: false, options: "" }] }))}
              className="mt-2 flex items-center gap-1.5 text-xs font-bold text-[#1c1c1c]"><Plus className="w-3.5 h-3.5" /> Add field</button>
          )}
          {editing && <p className="mt-2 text-[11px] text-gray-400">Removing a field hides it; values already saved are kept.</p>}
        </div>
      </div>
    </Modal>
  );
}
