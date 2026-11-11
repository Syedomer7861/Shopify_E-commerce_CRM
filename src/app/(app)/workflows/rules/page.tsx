"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { GitBranch, Plus, Loader2, Trash2, AlertTriangle, Power } from "lucide-react";
import { PageHeader, Modal, EmptyState, AccessDenied, Select } from "@/components/ui";
import { createClient } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";
import { useCurrentProfile } from "@/hooks/useCurrentProfile";
import { can } from "@/lib/access";

type Condition = { field: string; op: string; value: string };
type RuleAction = { type: "notify" | "create_approval"; to?: string; approver?: string; title: string; body?: string; link?: string };
type Rule = { id: string; name: string; trigger_event: string; conditions: Condition[] | null; actions: RuleAction[] | null; is_active: boolean };
type Run = { id: string; workflow_id: string; status: "success" | "skipped" | "failed"; detail: string | null; created_at: string };

// Events the database emits (emit_workflow_event triggers in 20261111e/f).
const EVENTS = [
  ["expense.created", "An expense claim is filed"], ["expense.status_changed", "An expense is approved or rejected"],
  ["approval.created", "An approval is requested"], ["approval.status_changed", "An approval is decided"],
  ["ticket.created", "A ticket is raised"], ["ticket.status_changed", "A ticket changes status"],
  ["lead.created", "A lead is added"], ["lead.status_changed", "A lead changes status"],
  ["deal.created", "A deal is added"], ["deal.status_changed", "A deal changes stage"],
  ["visit.status_changed", "A field visit is checked in or completed"],
  ["invoice.created", "An invoice is added"], ["invoice.status_changed", "An invoice changes status"],
].map(([value, label]) => ({ value, label }));

const OPS = [["eq", "is"], ["neq", "is not"], ["gt", "is more than"], ["gte", "is at least"], ["lt", "is less than"], ["lte", "is at most"], ["contains", "contains"]]
  .map(([value, label]) => ({ value, label }));

const WHO = [{ value: "manager", label: "The owner's manager" }, { value: "owner", label: "The record's owner" }];

type Draft = { name: string; event: string; field: string; op: string; value: string; action: RuleAction["type"]; to: string; title: string };
const BLANK: Draft = { name: "", event: "expense.created", field: "", op: "gt", value: "", action: "notify", to: "manager", title: "" };

// Starting points - each is an ordinary rule once saved, fully editable by deleting and re-adding.
const TEMPLATES: { label: string; draft: Draft }[] = [
  { label: "Large expense needs finance sign-off", draft: { name: "Large expense sign-off", event: "expense.created", field: "amount", op: "gt", value: "5000", action: "create_approval", to: "role:accountant", title: "Finance sign-off: {{category}} ₹{{amount}}" } },
  { label: "Urgent ticket alerts the manager", draft: { name: "Urgent ticket alert", event: "ticket.created", field: "priority", op: "eq", value: "urgent", action: "notify", to: "manager", title: "Urgent ticket: {{subject}}" } },
  { label: "Deal won notifies admins", draft: { name: "Deal won", event: "deal.status_changed", field: "status", op: "eq", value: "won", action: "notify", to: "role:admin", title: "Deal won: {{title}} ₹{{value}}" } },
  { label: "Lead lost notifies the manager", draft: { name: "Lead lost", event: "lead.status_changed", field: "status", op: "eq", value: "lost", action: "notify", to: "manager", title: "Lead lost: {{name}}" } },
];

export default function RulesPage() {
  const supabase = useMemo(() => createClient(), []);
  const { profile, loading: profileLoading } = useCurrentProfile();
  const [rules, setRules] = useState<Rule[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [roles, setRoles] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [notReady, setNotReady] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);

  const canView = can(profile, "workflows", "view") !== null;
  const canManage = can(profile, "workflows", "manage") !== null;

  const load = useCallback(async () => {
    const [r, log, roleRows] = await Promise.all([
      supabase.from("workflows").select("id,name,trigger_event,conditions,actions,is_active").eq("kind", "rule").order("created_at", { ascending: false }),
      supabase.from("workflow_runs").select("*").order("created_at", { ascending: false }).limit(25),
      supabase.from("roles").select("name").order("name"),
    ]);
    if (r.error || log.error) setNotReady(true);
    else { setRules(r.data as Rule[]); setRuns(log.data as Run[]); }
    setRoles((roleRows.data || []).map((x: any) => x.name));
    setLoading(false);
  }, [supabase]);

  useEffect(() => { if (!profileLoading && canView) load(); }, [profileLoading, canView, load]);

  async function save() {
    if (!draft) return;
    if (!draft.name.trim() || !draft.title.trim()) return toast.error("Name and message are required");
    if (draft.field.trim() && !draft.value.trim()) return toast.error("Give the condition a value, or clear its field");
    setSaving(true);
    const action: RuleAction = draft.action === "notify"
      ? { type: "notify", to: draft.to, title: draft.title.trim() }
      : { type: "create_approval", approver: draft.to, title: draft.title.trim() };
    const { error } = await supabase.from("workflows").insert({
      name: draft.name.trim(), kind: "rule", trigger_event: draft.event, is_active: true,
      conditions: draft.field.trim() ? [{ field: draft.field.trim(), op: draft.op, value: draft.value.trim() }] : [],
      actions: [action],
    });
    if (error) toast.error(error.message);
    else { toast.success("Rule saved"); setDraft(null); load(); }
    setSaving(false);
  }

  async function toggle(rule: Rule) {
    const { error } = await supabase.from("workflows").update({ is_active: !rule.is_active }).eq("id", rule.id);
    if (error) toast.error(error.message);
    else setRules(prev => prev.map(r => r.id === rule.id ? { ...r, is_active: !r.is_active } : r));
  }

  async function remove(rule: Rule) {
    if (!confirm(`Delete the rule "${rule.name}"? Its run history goes with it.`)) return;
    const { error } = await supabase.from("workflows").delete().eq("id", rule.id);
    if (error) toast.error(error.message);
    else setRules(prev => prev.filter(r => r.id !== rule.id));
  }

  if (profileLoading) return <div className="py-12 text-center text-gray-400">Loading...</div>;
  if (!canView) return <AccessDenied title="Rules" desc="Your role doesn't include workflow access." />;

  const eventLabel = (e: string) => EVENTS.find(x => x.value === e)?.label || e;
  const targets = [...WHO, ...roles.map(r => ({ value: `role:${r}`, label: `Everyone with role: ${r.replace(/_/g, " ")}` }))];
  const describe = (r: Rule) => {
    const c = r.conditions?.[0];
    const a = r.actions?.[0];
    const who = targets.find(t => t.value === (a?.to || a?.approver))?.label.toLowerCase() || a?.to || a?.approver || "";
    return `When ${eventLabel(r.trigger_event).toLowerCase()}${c ? ` and ${c.field} ${OPS.find(o => o.value === c.op)?.label} ${c.value}` : ""}, ${a?.type === "create_approval" ? "ask for approval from" : "notify"} ${who}.`;
  };

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Rules"
        subtitle="When something happens in Finance, Service Desk, Sales or Approvals, notify someone or ask for sign-off. Runs every 15 minutes."
        actions={canManage && !notReady && (
          <button onClick={() => setDraft({ ...BLANK })} className="btn-primary flex items-center gap-2"><Plus className="w-4 h-4" /> New rule</button>
        )}
      />

      {loading ? (
        <div className="py-12 text-center text-gray-400"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>
      ) : notReady ? (
        <div className="card p-5 flex items-start gap-3 text-sm text-amber-700 bg-amber-50 border-amber-100">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <div>Rules aren&apos;t set up on this database yet. Run <code>supabase/APPLY_PHASES_1_TO_7.sql</code> in the SQL Editor, then reload.</div>
        </div>
      ) : (
        <>
          {canManage && (
            <div className="flex flex-wrap gap-2 mb-5">
              <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 self-center">Start from</span>
              {TEMPLATES.map(t => (
                <button key={t.label} onClick={() => setDraft({ ...t.draft })} className="btn-secondary text-[11px] py-1 px-2.5">{t.label}</button>
              ))}
            </div>
          )}

          {rules.length === 0 ? (
            <EmptyState icon={<GitBranch className="w-6 h-6" />} title="No rules yet" desc="Pick a starting point above or create one from scratch." />
          ) : (
            <div className="space-y-2 mb-8">
              {rules.map(r => (
                <div key={r.id} className={cn("card p-3 flex items-center gap-3", !r.is_active && "opacity-60")}>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-bold text-[#1c1c1c]">{r.name}</div>
                    <div className="text-[11px] text-[#5f5f5d] mt-0.5">{describe(r)}</div>
                  </div>
                  {canManage && (
                    <>
                      <button onClick={() => toggle(r)} aria-label={r.is_active ? "Pause rule" : "Resume rule"} className={cn("p-1.5 rounded-lg", r.is_active ? "bg-emerald-50 text-emerald-600" : "bg-gray-100 text-gray-400")}><Power className="w-3.5 h-3.5" /></button>
                      <button onClick={() => remove(r)} aria-label="Delete rule" className="p-1.5 text-gray-300 hover:text-rose-500"><Trash2 className="w-3.5 h-3.5" /></button>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}

          {runs.length > 0 && (
            <>
              <h2 className="text-sm font-bold text-[#1c1c1c] mb-3">Recent runs</h2>
              <div className="card divide-y divide-gray-50">
                {runs.map(run => (
                  <div key={run.id} className="p-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
                    <span className={cn("w-16 text-[9px] font-black uppercase tracking-widest", run.status === "success" ? "text-emerald-600" : run.status === "failed" ? "text-rose-600" : "text-gray-400")}>{run.status}</span>
                    <span className="flex-1 text-[#1c1c1c] truncate">{rules.find(r => r.id === run.workflow_id)?.name || "Deleted rule"}{run.detail && <span className="text-gray-400"> &middot; {run.detail}</span>}</span>
                    <span className="text-gray-400">{new Date(run.created_at).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}

      <Modal open={!!draft} onClose={() => setDraft(null)} title="New rule"
        footer={<button onClick={save} disabled={saving} className="btn-primary w-full py-2.5">{saving ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Save rule"}</button>}>
        {draft && (
          <div className="space-y-4">
            <div>
              <label htmlFor="rule-name" className="text-xs font-medium text-gray-700 block mb-1">Rule name</label>
              <input id="rule-name" className="input" value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} />
            </div>
            <div>
              <span className="text-xs font-medium text-gray-700 block mb-1">When</span>
              <Select value={draft.event} onChange={v => setDraft({ ...draft, event: v })} options={EVENTS} />
            </div>
            <div>
              <span className="text-xs font-medium text-gray-700 block mb-1">Only if (optional)</span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <input aria-label="Condition field" className="input" placeholder="field, e.g. amount" value={draft.field} onChange={e => setDraft({ ...draft, field: e.target.value })} />
                <Select value={draft.op} onChange={v => setDraft({ ...draft, op: v })} options={OPS} />
                <input aria-label="Condition value" className="input" placeholder="value" value={draft.value} onChange={e => setDraft({ ...draft, value: e.target.value })} />
              </div>
            </div>
            <div>
              <span className="text-xs font-medium text-gray-700 block mb-1">Then</span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <Select value={draft.action} onChange={v => setDraft({ ...draft, action: v as Draft["action"] })}
                  options={[{ value: "notify", label: "Notify" }, { value: "create_approval", label: "Ask for approval from" }]} />
                <Select value={draft.to} onChange={v => setDraft({ ...draft, to: v })} options={targets} />
              </div>
            </div>
            <div>
              <label htmlFor="rule-title" className="text-xs font-medium text-gray-700 block mb-1">Message</label>
              <input id="rule-title" className="input" placeholder="e.g. Large expense: {{category}} ₹{{amount}}" value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} />
              <p className="text-[10px] text-gray-400 mt-1">{"Use {{field}} to drop in a value from the record."}</p>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
