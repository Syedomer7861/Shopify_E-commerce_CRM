"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { History, Loader2, Save, Send } from "lucide-react";
import toast from "react-hot-toast";
import { PageHeader } from "@/components/ui";
import { createClient } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { CONTENT_KEYS, contentSchema, resolveContent, type ContentKey } from "@/lib/site-content";

type Row = { key: string; draft: Record<string, unknown> | null; published: Record<string, unknown> | null; version: number; published_at: string | null };
type Version = { key: string; version: number; value: Record<string, unknown>; published_at: string };

const input = "w-full px-3 py-2 bg-white border border-[#eceae4] rounded-lg text-sm focus:outline-none focus:border-[#1c1c1c]/30";

async function refreshSite() {
  const res = await fetch("/api/superadmin/content/revalidate", { method: "POST" });
  if (!res.ok) toast("Published. The site picks it up within 5 minutes.");
}

function Editor({ k, row, versions, onChange }: { k: ContentKey; row: Row | undefined; versions: Version[]; onChange: () => void }) {
  const supabase = useMemo(() => createClient(), []);
  const def = CONTENT_KEYS[k];
  const [value, setValue] = useState<Record<string, unknown>>(() => ({ ...resolveContent(k, row?.published), ...(row?.draft || {}) }));
  const [busy, setBusy] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const dirty = JSON.stringify(value) !== JSON.stringify({ ...resolveContent(k, row?.published), ...(row?.draft || {}) });

  function check() {
    const parsed = contentSchema(k).safeParse(value);
    if (!parsed.success) { toast.error(parsed.error.issues[0]?.message || "Check the fields"); return null; }
    return parsed.data;
  }

  async function saveDraft() {
    const data = check();
    if (!data) return false;
    setBusy(true);
    const { error } = await supabase.rpc("platform_save_content_draft", { p_key: k, p_value: data });
    setBusy(false);
    if (error) { toast.error(error.message); return false; }
    return true;
  }

  async function publish() {
    if (!(await saveDraft())) return;
    if (!window.confirm(`Publish "${def.label}" to the public site?`)) { onChange(); return; }
    setBusy(true);
    const { error } = await supabase.rpc("platform_publish_content", { p_key: k });
    setBusy(false);
    if (error) return toast.error(error.message);
    await refreshSite();
    toast.success("Published");
    onChange();
  }

  async function restore(v: number) {
    if (!window.confirm(`Republish version ${v}? It becomes the newest version; nothing is deleted.`)) return;
    const { error } = await supabase.rpc("platform_rollback_content", { p_key: k, p_version: v });
    if (error) return toast.error(error.message);
    await refreshSite();
    toast.success(`Version ${v} is live again`);
    onChange();
  }

  return (
    <div className="card p-4">
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="font-bold text-[#1c1c1c] flex-1">{def.label}</div>
        <span className="text-[11px] text-[#5f5f5d]">
          {row?.version ? `v${row.version} live since ${new Date(row.published_at!).toLocaleString()}` : "Built-in text (never published)"}
        </span>
        {row?.draft && <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">Unpublished draft</span>}
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        {def.fields.map(f => (
          <label key={f.name} className={cn("text-[11px] text-[#5f5f5d]", f.type === "textarea" && "sm:col-span-2")}>
            {f.type === "bool" ? (
              <span className="flex items-center gap-2 text-sm text-[#1c1c1c]">
                <input type="checkbox" checked={!!value[f.name]} onChange={e => setValue({ ...value, [f.name]: e.target.checked })} /> {f.label}
              </span>
            ) : (
              <>
                {f.label}{f.optional ? " (optional)" : ""}
                {f.type === "textarea"
                  ? <textarea rows={3} className={input} maxLength={f.max} value={String(value[f.name] ?? "")} onChange={e => setValue({ ...value, [f.name]: e.target.value })} />
                  : <input className={input} maxLength={f.max} value={String(value[f.name] ?? "")} placeholder={f.type === "link" ? "/contact or https://..." : ""} onChange={e => setValue({ ...value, [f.name]: e.target.value })} />}
                {f.help && <span className="block mt-0.5">{f.help}</span>}
              </>
            )}
          </label>
        ))}
      </div>
      <div className="flex flex-wrap gap-2 mt-4">
        <button onClick={async () => { if (await saveDraft()) { toast.success("Draft saved"); onChange(); } }} disabled={busy || !dirty}
          className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg border border-[#eceae4] disabled:opacity-50">
          <Save className="w-3.5 h-3.5" /> Save draft
        </button>
        <button onClick={publish} disabled={busy || (!dirty && !row?.draft)}
          className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg bg-[#1c1c1c] text-white disabled:opacity-50">
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />} Publish
        </button>
        <button onClick={() => setValue({ ...CONTENT_KEYS[k].defaults })} className="text-xs px-3 py-2 rounded-lg text-[#5f5f5d] hover:bg-[#f7f4ed]">Reset to built-in text</button>
        {versions.length > 0 && (
          <button onClick={() => setShowHistory(!showHistory)} className="inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg text-[#5f5f5d] hover:bg-[#f7f4ed] ml-auto">
            <History className="w-3.5 h-3.5" /> History ({versions.length})
          </button>
        )}
      </div>
      {showHistory && (
        <div className="mt-3 border-t border-[#eceae4] pt-3 space-y-2">
          {versions.map(v => (
            <div key={v.version} className="flex items-start gap-3 text-xs">
              <span className="font-bold w-10">v{v.version}</span>
              <span className="text-[#5f5f5d] w-40 shrink-0">{new Date(v.published_at).toLocaleString()}</span>
              <span className="text-[#5f5f5d] flex-1 min-w-0 truncate">{Object.values(v.value).filter(x => typeof x === "string" && x).join(" · ")}</span>
              {v.version !== row?.version && <button onClick={() => restore(v.version)} className="px-2 py-1 rounded-lg border border-[#eceae4]">Restore</button>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function SuperAdminContent() {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [versions, setVersions] = useState<Version[]>([]);
  const [tick, setTick] = useState(0);

  const load = useCallback(async () => {
    const [r, v] = await Promise.all([
      supabase.from("platform_content").select("key, draft, published, version, published_at"),
      supabase.from("platform_content_versions").select("key, version, value, published_at").order("version", { ascending: false }),
    ]);
    if (r.error) toast.error(r.error.message);
    setRows((r.data || []) as Row[]);
    setVersions((v.data || []) as Version[]);
    setTick(t => t + 1);
  }, [supabase]);

  useEffect(() => { load(); }, [load]);

  if (!rows) return <div className="py-12 text-center text-gray-400"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>;

  return (
    <div className="space-y-4">
      <PageHeader title="Content" subtitle="Text on the public website. Save a draft, publish when ready; every published version is kept and can be restored." />
      {(Object.keys(CONTENT_KEYS) as ContentKey[]).map(k => (
        <Editor key={`${k}-${tick}`} k={k} row={rows.find(r => r.key === k)} versions={versions.filter(v => v.key === k)} onChange={load} />
      ))}
      <p className="text-[11px] text-[#5f5f5d]">Feature, solution, comparison, guide and blog pages still come from the codebase; they move here in later steps. If a saved value is ever invalid, the site shows the built-in text instead.</p>
    </div>
  );
}
