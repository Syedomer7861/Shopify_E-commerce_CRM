"use client";
import { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import { Modal, Select } from "@/components/ui";
import { createClient } from "@/lib/supabase";
import { sameName, type AnyUnit, type StructureTemplate } from "@/lib/org-structure";

/**
 * Industry templates only SUGGEST departments and designations. The admin
 * ticks which to activate; names the org already has (any case, active or
 * retired) are shown as "added" and never inserted twice.
 */
export function TemplatePicker({ open, onClose, templates, departments, designations, onDone }: {
  open: boolean; onClose: () => void; templates: StructureTemplate[];
  departments: AnyUnit[]; designations: AnyUnit[]; onDone: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [code, setCode] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const t = templates.find(x => x.code === code);
  const has = (list: AnyUnit[], n: string) => list.some(u => sameName(u.name, n));

  const choose = (c: string) => {
    setCode(c);
    const tp = templates.find(x => x.code === c);
    setPicked(new Set(tp ? [...tp.departments.filter(n => !has(departments, n)).map(n => `d:${n}`), ...tp.designations.filter(n => !has(designations, n)).map(n => `g:${n}`)] : []));
  };
  const toggle = (k: string) => setPicked(prev => { const s = new Set(prev); if (s.has(k)) s.delete(k); else s.add(k); return s; });

  async function apply() {
    const d = Array.from(picked).filter(k => k.startsWith("d:")).map(k => k.slice(2));
    const g = Array.from(picked).filter(k => k.startsWith("g:")).map(k => k.slice(2));
    setBusy(true);
    const [a, b] = await Promise.all([
      d.length ? supabase.rpc("add_org_units", { p_kind: "department", p_names: d }) : Promise.resolve({ data: 0, error: null }),
      g.length ? supabase.rpc("add_org_units", { p_kind: "designation", p_names: g }) : Promise.resolve({ data: 0, error: null }),
    ]);
    setBusy(false);
    if (a.error || b.error) return toast.error((a.error || b.error)!.message);
    toast.success(`Added ${a.data ?? 0} departments and ${b.data ?? 0} designations`);
    onDone();
  }

  const list = (title: string, prefix: string, names: string[], existing: AnyUnit[]) => (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-wider text-[#9a9a94] mb-2">{title}</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
        {names.map(n => {
          const already = has(existing, n);
          return (
            <label key={n} className="flex items-center gap-2 text-xs p-2 rounded-lg border border-[#ebece6] cursor-pointer">
              <input type="checkbox" disabled={already} checked={already || picked.has(`${prefix}:${n}`)} onChange={() => toggle(`${prefix}:${n}`)} />
              <span className={already ? "text-[#9a9a94]" : ""}>{n}</span>
              {already && <span className="ml-auto text-[9px] uppercase tracking-wider text-[#9a9a94]">Added</span>}
            </label>
          );
        })}
      </div>
    </div>
  );

  return (
    <Modal open={open} onClose={onClose} title="Start from an industry template" maxWidth="max-w-2xl"
      footer={<>
        <button onClick={onClose} className="btn-secondary text-xs px-4">Cancel</button>
        <button onClick={apply} disabled={busy || picked.size === 0} className="btn-primary text-xs px-4">
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : `Activate ${picked.size} selected`}
        </button>
      </>}>
      <div className="space-y-5">
        <p className="text-xs text-[#6b6b67]">Pick your industry to see suggested departments and job titles. Untick anything you don&apos;t need. Nothing is created until you press Activate.</p>
        <Select value={code} onChange={choose} placeholder="Choose an industry" options={templates.map(x => ({ value: x.code, label: x.name }))} triggerClassName="text-xs" />
        {t && list("Departments", "d", t.departments, departments)}
        {t && list("Designations", "g", t.designations, designations)}
      </div>
    </Modal>
  );
}
