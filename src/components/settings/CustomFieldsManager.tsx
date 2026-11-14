"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Archive, Loader2, Plus, RotateCcw } from "lucide-react";
import toast from "react-hot-toast";
import { createClient } from "@/lib/supabase";
import { cn } from "@/lib/utils";

/** Record types that accept custom fields (must match custom_field_defs.entity). */
const ENTITIES = [
  ["leads", "Leads"], ["deals", "Deals"], ["tickets", "Service tickets"], ["visits", "Field visits"],
  ["expenses", "Expenses"], ["vendors", "Vendors"], ["invoices", "Invoices"],
] as const;
const TYPES = [["text", "Short text"], ["textarea", "Long text"], ["number", "Number"], ["date", "Date"], ["select", "Dropdown"]] as const;

type Def = { id: string; entity: string; key: string; label: string; field_type: string; options: string[]; required: boolean; show_in_list: boolean; sort_order: number; is_active: boolean };

const toKey = (label: string) => label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").replace(/^(\d)/, "f_$1").slice(0, 40);
const input = "h-9 px-3 bg-white border border-[#eceae4] rounded-lg text-sm focus:outline-none focus:border-[#1c1c1c]/30";

/**
 * Workspace admins add their own fields to built-in records. Row security
 * lets only admins write definitions; a database trigger checks every stored
 * value against them. Fields are archived, never deleted, so old data stays.
 */
export function CustomFieldsManager({ canEdit }: { canEdit: boolean }) {
  const supabase = useMemo(() => createClient(), []);
  const [entity, setEntity] = useState<string>("leads");
  const [defs, setDefs] = useState<Def[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [label, setLabel] = useState("");
  const [type, setType] = useState("text");
  const [options, setOptions] = useState("");
  const [required, setRequired] = useState(false);
  const [inList, setInList] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from("custom_field_defs").select("*").eq("entity", entity).order("sort_order").order("created_at");
    if (error) toast.error(error.message);
    setDefs((data || []) as Def[]);
    setLoading(false);
  }, [supabase, entity]);
  useEffect(() => { load(); }, [load]);

  async function add() {
    const key = toKey(label);
    const opts = options.split(",").map(o => o.trim()).filter(Boolean);
    if (!label.trim() || !key) return toast.error("Give the field a name");
    if (defs.some(d => d.key === key)) return toast.error("A field with this name already exists");
    if (type === "select" && opts.length === 0) return toast.error("Add at least one option, separated by commas");
    setBusy(true);
    const { error } = await supabase.from("custom_field_defs").insert({
      id: crypto.randomUUID(), entity, key, label: label.trim(), field_type: type,
      options: type === "select" ? [...new Set(opts)].slice(0, 50) : [], required, show_in_list: inList, sort_order: defs.length,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Field added");
    setLabel(""); setOptions(""); setRequired(false); setInList(false); setType("text");
    load();
  }

  async function patch(d: Def, change: Partial<Def>) {
    const { error } = await supabase.from("custom_field_defs").update(change).eq("id", d.id);
    if (error) return toast.error(error.message);
    setDefs(prev => prev.map(x => (x.id === d.id ? { ...x, ...change } : x)));
  }

  return (
    <div className="card p-6 space-y-5">
      <div>
        <h3 className="text-[10px] font-bold text-[#1c1c1c] uppercase tracking-widest mb-2">Custom fields</h3>
        <p className="text-xs text-[#5f5f5d]">Add your own fields to records. They appear in the add and edit forms, and in the list if you choose.</p>
      </div>
      <div className="flex gap-1.5 overflow-x-auto scrollbar-hide">
        {ENTITIES.map(([k, l]) => (
          <button key={k} onClick={() => setEntity(k)} aria-pressed={entity === k}
            className={cn("px-3 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap border", entity === k ? "bg-[#1c1c1c] text-white border-[#1c1c1c]" : "bg-white text-gray-600 border-[#eceae4]")}>{l}</button>
        ))}
      </div>

      {loading ? <Loader2 className="w-4 h-4 animate-spin text-gray-400" /> : defs.length === 0 ? (
        <p className="text-xs text-[#5f5f5d]">No custom fields on this record yet.</p>
      ) : (
        <div className="divide-y divide-[#eceae4] border border-[#eceae4] rounded-lg">
          {defs.map(d => (
            <div key={d.id} className={cn("flex flex-wrap items-center gap-3 p-3 text-sm", !d.is_active && "opacity-50")}>
              <div className="flex-1 min-w-[140px]">
                <div className="font-semibold text-[#1c1c1c]">{d.label}</div>
                <div className="text-[10px] text-[#5f5f5d]">{TYPES.find(t => t[0] === d.field_type)?.[1]}{d.options.length ? `: ${d.options.join(", ")}` : ""}</div>
              </div>
              <label className="flex items-center gap-1 text-[11px] text-[#5f5f5d]"><input type="checkbox" disabled={!canEdit} checked={d.required} onChange={e => patch(d, { required: e.target.checked })} /> Required</label>
              <label className="flex items-center gap-1 text-[11px] text-[#5f5f5d]"><input type="checkbox" disabled={!canEdit} checked={d.show_in_list} onChange={e => patch(d, { show_in_list: e.target.checked })} /> In list</label>
              {canEdit && (
                <button onClick={() => patch(d, { is_active: !d.is_active })} className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#5f5f5d] hover:text-[#1c1c1c]">
                  {d.is_active ? <><Archive className="w-3 h-3" /> Archive</> : <><RotateCcw className="w-3 h-3" /> Restore</>}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {canEdit ? (
        <div className="border-t border-[#eceae4] pt-4 flex flex-wrap items-end gap-2">
          <label className="text-[10px] text-[#5f5f5d] flex-1 min-w-[160px]">Field name<br /><input className={cn(input, "w-full")} maxLength={80} value={label} onChange={e => setLabel(e.target.value)} placeholder="e.g. Budget, Course, Property type" /></label>
          <label className="text-[10px] text-[#5f5f5d]">Type<br />
            <select className={input} value={type} onChange={e => setType(e.target.value)}>{TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          </label>
          {type === "select" && (
            <label className="text-[10px] text-[#5f5f5d] flex-1 min-w-[180px]">Options (comma separated)<br /><input className={cn(input, "w-full")} value={options} onChange={e => setOptions(e.target.value)} placeholder="Small, Medium, Large" /></label>
          )}
          <label className="flex items-center gap-1 text-[11px] text-[#5f5f5d] h-9"><input type="checkbox" checked={required} onChange={e => setRequired(e.target.checked)} /> Required</label>
          <label className="flex items-center gap-1 text-[11px] text-[#5f5f5d] h-9"><input type="checkbox" checked={inList} onChange={e => setInList(e.target.checked)} /> Show in list</label>
          <button onClick={add} disabled={busy} className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 h-9 rounded-lg bg-[#1c1c1c] text-white disabled:opacity-50">
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />} Add field
          </button>
        </div>
      ) : <p className="text-[11px] text-[#5f5f5d]">Only admins can add or change fields.</p>}
    </div>
  );
}
