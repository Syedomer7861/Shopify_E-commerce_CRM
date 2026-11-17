"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Copy, FilePlus2, Loader2, Pencil, Printer, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import { createClient } from "@/lib/supabase";
import { confirmDialog } from "@/components/ConfirmDialog";
import { useCurrentProfile } from "@/hooks/useCurrentProfile";
import { KIND_LABEL, STARTERS, cloneTemplate, type DocTemplate } from "@/lib/hr-docs";
import { DocDesigner } from "@/components/hr/documents/DocDesigner";
import { DocGenerator, type GenEmployee } from "@/components/hr/documents/DocGenerator";

type Saved = DocTemplate & { id: string; updated_at: string };

/**
 * HR document studio: the organisation's own designs (payslips, letters,
 * certificates), the built-in starters to copy from, and printing for an
 * employee. Starters are code, so copying never changes the originals.
 */
export function DocStudio({ employees, attendance }: { employees: GenEmployee[]; attendance: { agent_id: string; date: string; status: string }[] }) {
  const supabase = useMemo(() => createClient(), []);
  const { profile } = useCurrentProfile();
  const [list, setList] = useState<Saved[] | null>(null);
  const [missing, setMissing] = useState(false);
  const [company, setCompany] = useState("");
  const [editing, setEditing] = useState<DocTemplate | null>(null);
  const [using, setUsing] = useState<DocTemplate | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from("hr_doc_templates").select("id, name, kind, page_size, elements, updated_at").order("updated_at", { ascending: false });
    if (error) { setMissing(true); setList([]); return; }
    setList((data || []) as Saved[]);
  }, [supabase]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!profile?.org_id) return;
    supabase.from("organizations").select("name").eq("id", profile.org_id).maybeSingle().then(({ data }) => setCompany(data?.name ?? ""));
  }, [supabase, profile?.org_id]);

  async function remove(t: Saved) {
    if (!(await confirmDialog(`Delete the design "${t.name}"? Documents already printed are not affected.`))) return;
    const { error } = await supabase.from("hr_doc_templates").delete().eq("id", t.id);
    if (error) return toast.error(error.message);
    load();
  }

  if (editing) return <DocDesigner initial={editing} onClose={() => { setEditing(null); load(); }} onSaved={load} />;
  if (using) return <DocGenerator tpl={using} employees={employees} attendance={attendance} companyName={company} onClose={() => setUsing(null)} />;
  if (!list) return <div className="py-16 text-center text-[#9a9a94]"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>;
  if (missing) return <div className="card p-6 text-sm text-[#6b6b67]">The document designer is being set up for your workspace. Please check back shortly.</div>;

  return (
    <div className="space-y-5">
      <div className="card p-5 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-bold text-[#1c1c1c] flex-1">Your designs</h3>
          <button type="button" className="btn-primary text-xs" onClick={() => setEditing({ name: "Untitled document", kind: "other", page_size: "A4", elements: [] })}>
            <FilePlus2 className="w-3.5 h-3.5" /> Blank design
          </button>
        </div>
        {list.length === 0 ? <p className="text-xs text-[#9a9a94]">No designs yet. Start from a blank page or copy a starter below.</p> : (
          <div className="divide-y divide-[#ebece6] border border-[#ebece6] rounded-xl">
            {list.map(t => (
              <div key={t.id} className="flex flex-wrap items-center gap-2 px-3 py-2.5">
                <span className="flex-1 min-w-[160px]">
                  <span className="block text-sm font-semibold text-[#1c1c1c]">{t.name}</span>
                  <span className="block text-xs text-[#6b6b67]">{KIND_LABEL[t.kind]} · {t.page_size} · edited {new Date(t.updated_at).toLocaleDateString("en-IN")}</span>
                </span>
                <button type="button" className="btn-primary text-xs h-8" disabled={!employees.length} onClick={() => setUsing(t)}><Printer className="w-3.5 h-3.5" /> Use</button>
                <button type="button" className="btn-secondary text-xs h-8" onClick={() => setEditing(t)}><Pencil className="w-3.5 h-3.5" /> Edit</button>
                <button type="button" aria-label={`Copy ${t.name}`} className="btn-secondary text-xs h-8" onClick={() => setEditing({ ...cloneTemplate(t), name: `${t.name} (copy)` })}><Copy className="w-3.5 h-3.5" /></button>
                <button type="button" aria-label={`Delete ${t.name}`} className="p-2 rounded-lg hover:bg-[#f6f7f2]" onClick={() => remove(t)}><Trash2 className="w-4 h-4 text-[#c94f40]" /></button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card p-5 space-y-3">
        <h3 className="text-sm font-bold text-[#1c1c1c]">Starters</h3>
        <p className="text-xs text-[#6b6b67]">Copy one, add your logo, address and signature, then save it as your own.</p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {STARTERS.map(s => (
            <button key={s.name} type="button" onClick={() => setEditing(cloneTemplate(s))}
              className="text-left rounded-xl border border-[#ebece6] p-3 hover:border-[#1c1c1c]/30">
              <span className="block text-sm font-semibold text-[#1c1c1c]">{s.name}</span>
              <span className="block text-xs text-[#6b6b67]">{KIND_LABEL[s.kind]}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
