"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Sparkles, UserCheck } from "lucide-react";
import toast from "react-hot-toast";
import { EmptyState } from "@/components/ui";
import { createClient } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import type { Named } from "./PlansTab";

type Person = Named & { department_id: string | null; designation_id: string | null };
type Assignment = {
  id: string; plan_id: string; employee_id: string; effective_from: string; effective_to: string | null;
  status: "suggested" | "active" | "ended"; reason: string; kpi_plans: { name: string } | null;
};

const input = "h-9 px-2 bg-white border border-[#ebece6] rounded-lg text-sm focus:outline-none focus:border-[#1c1c1c]/30";
const small = "text-xs px-3 py-1.5 rounded-lg border border-[#ebece6] disabled:opacity-40";
const STATUS: Record<Assignment["status"], string> = { suggested: "bg-sky-50 text-sky-700", active: "bg-emerald-50 text-emerald-700", ended: "bg-gray-100 text-[#5f5f5d]" };
const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const day = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

export function AssignmentsTab({ me, departments, designations, canManage, canApprove }: {
  me: string; departments: Named[]; designations: Named[]; canManage: boolean; canApprove: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<Assignment[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [plans, setPlans] = useState<Named[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [show, setShow] = useState<Assignment["status"]>("suggested");
  const [bulk, setBulk] = useState<{ plan: string; from: string; dept: string; picked: string[] } | null>(null);

  const load = useCallback(async () => {
    const [a, p, pl] = await Promise.all([
      supabase.from("kpi_assignments").select("id, plan_id, employee_id, effective_from, effective_to, status, reason, kpi_plans(name)").order("created_at", { ascending: false }).limit(1000),
      supabase.from("profiles").select("id, name, department_id, designation_id").eq("is_active", true).order("name"),
      supabase.from("kpi_plans").select("id, name").eq("status", "active").order("name"),
    ]);
    if (a.error) toast.error(a.error.message);
    setRows((a.data || []) as unknown as Assignment[]);
    setPeople((p.data || []) as Person[]);
    setPlans((pl.data || []) as Named[]);
    setLoading(false);
  }, [supabase]);
  useEffect(() => { load(); }, [load]);

  async function rpc(fn: string, args: Record<string, unknown>, ok: (data: unknown) => string) {
    setBusy(true);
    const { data, error } = await supabase.rpc(fn, args);
    setBusy(false);
    if (error) { toast.error(error.message); return false; }
    toast.success(ok(data));
    load();
    return true;
  }
  async function update(a: Assignment, patch: Partial<Assignment>, ok: string) {
    setBusy(true);
    const { error } = await supabase.from("kpi_assignments").update(patch).eq("id", a.id);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(ok);
    load();
  }

  const person = (id: string) => people.find(p => p.id === id);
  const placement = (p?: Person) => [designations.find(d => d.id === p?.designation_id)?.name, departments.find(d => d.id === p?.department_id)?.name].filter(Boolean).join(" · ");
  const shown = rows.filter(a => a.status === show);
  const counts = { suggested: rows.filter(a => a.status === "suggested").length, active: rows.filter(a => a.status === "active").length };

  if (loading) return <div className="py-12 text-center text-gray-400"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>;

  if (bulk) {
    const pool = people.filter(p => !bulk.dept || p.department_id === bulk.dept);
    const all = pool.length > 0 && pool.every(p => bulk.picked.includes(p.id));
    return (
      <div className="card p-4 space-y-3">
        <div className="text-xs font-bold text-[#1c1c1c]">Assign a plan</div>
        <div className="flex flex-wrap gap-2">
          <select className={input} value={bulk.plan} onChange={e => setBulk({ ...bulk, plan: e.target.value })} aria-label="Plan">
            <option value="">Active plan...</option>
            {plans.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <label className="text-[10px] text-[#5f5f5d]">Starts<br /><input type="date" className={input} value={bulk.from} onChange={e => setBulk({ ...bulk, from: e.target.value })} /></label>
          <select className={input} value={bulk.dept} onChange={e => setBulk({ ...bulk, dept: e.target.value })} aria-label="Filter by department">
            <option value="">Everyone</option>
            {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
        <label className="flex items-center gap-2 text-xs font-semibold">
          <input type="checkbox" checked={all} onChange={() => setBulk({ ...bulk, picked: all ? bulk.picked.filter(id => !pool.some(p => p.id === id)) : Array.from(new Set([...bulk.picked, ...pool.map(p => p.id)])) })} />
          Select all shown ({pool.length})
        </label>
        <div className="max-h-72 overflow-y-auto border border-[#ebece6] rounded-lg divide-y divide-[#ebece6]">
          {pool.map(p => (
            <label key={p.id} className="flex items-center gap-2 px-3 py-2 text-xs">
              <input type="checkbox" checked={bulk.picked.includes(p.id)} onChange={() => setBulk({ ...bulk, picked: bulk.picked.includes(p.id) ? bulk.picked.filter(x => x !== p.id) : [...bulk.picked, p.id] })} />
              <span className="font-semibold text-[#1c1c1c]">{p.name}</span><span className="text-[#5f5f5d]">{placement(p)}</span>
            </label>
          ))}
        </div>
        <p className="text-[10px] text-[#5f5f5d]">
          {canApprove ? "Each person's current plan ends the day before the new one starts; past plans and evaluations stay in history." : "These go in as suggestions; someone with approval rights makes them active."}
        </p>
        <div className="flex gap-2">
          <button disabled={busy || !bulk.plan || bulk.picked.length === 0 || !bulk.from}
            onClick={async () => { if (await rpc("kpi_assign", { p_plan: bulk.plan, p_employees: bulk.picked, p_from: bulk.from, p_activate: canApprove }, n => `${n} ${canApprove ? "assigned" : "suggested"}${Number(n) < bulk.picked.length ? " (others already had this plan)" : ""}`)) setBulk(null); }}
            className="text-xs font-semibold px-4 py-2 rounded-lg bg-[#1c1c1c] text-white disabled:opacity-50">
            {canApprove ? "Assign" : "Suggest"} {bulk.picked.length || ""}
          </button>
          <button onClick={() => setBulk(null)} className={small}>Cancel</button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {canManage && (
          <>
            <button onClick={() => setBulk({ plan: "", from: today(), dept: "", picked: [] })} disabled={plans.length === 0}
              className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg bg-[#1c1c1c] text-white disabled:opacity-40">
              <UserCheck className="w-3.5 h-3.5" /> Assign plan
            </button>
            <button className={cn(small, "inline-flex items-center gap-1.5")} disabled={busy || plans.length === 0}
              onClick={() => rpc("kpi_suggest_all", {}, n => (Number(n) ? `${n} new suggestion${Number(n) === 1 ? "" : "s"}` : "Everyone already has their matching plan"))}>
              <Sparkles className="w-3.5 h-3.5" /> Suggest by department
            </button>
          </>
        )}
        <select className={input} value={show} onChange={e => setShow(e.target.value as Assignment["status"])} aria-label="Show">
          <option value="suggested">Awaiting approval ({counts.suggested})</option>
          <option value="active">Active ({counts.active})</option>
          <option value="ended">History</option>
        </select>
      </div>
      {plans.length === 0 && <p className="text-xs text-amber-700 mb-3">Approve a plan on the Plans tab before assigning it.</p>}
      {shown.length === 0 ? (
        <EmptyState icon={<UserCheck className="w-6 h-6" />} title={show === "suggested" ? "Nothing awaiting approval" : show === "active" ? "No one has a plan yet" : "No history yet"}
          desc="New and moved employees get the matching active plan suggested here automatically." />
      ) : (
        <div className="card divide-y divide-[#ebece6]">
          {shown.map(a => {
            const p = person(a.employee_id);
            const self = a.employee_id === me;
            return (
              <div key={a.id} className="p-3 flex flex-wrap items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className={cn("text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full", STATUS[a.status])}>{a.status === "suggested" ? "awaiting" : a.status}</span>
                    <span className="font-semibold text-[#1c1c1c]">{p?.name ?? "Former member"}</span>
                    <span className="text-[#5f5f5d]">→ {a.kpi_plans?.name ?? "Plan"}</span>
                  </div>
                  <div className="text-xs text-[#5f5f5d] mt-0.5">
                    {placement(p) && `${placement(p)} · `}from {day(a.effective_from)}{a.effective_to ? ` to ${day(a.effective_to)}` : ""}{a.reason ? ` · ${a.reason}` : ""}
                  </div>
                </div>
                {a.status === "suggested" && canApprove && !self && (
                  <button className={small} disabled={busy} onClick={() => rpc("kpi_approve_assignment", { p_id: a.id, p_from: today() }, () => "Approved; previous plan ended")}>Approve</button>
                )}
                {a.status === "suggested" && canManage && !self && (
                  <button className={small} disabled={busy} onClick={() => update(a, { status: "ended", effective_to: a.effective_from > today() ? a.effective_from : today(), reason: "Dismissed" }, "Dismissed")}>Dismiss</button>
                )}
                {a.status === "active" && canManage && !self && (
                  <button className={small} disabled={busy} onClick={() => window.confirm(`End ${p?.name ?? "this person"}'s plan today? It stays in history.`)
                    && update(a, { status: "ended", effective_to: a.effective_from > today() ? a.effective_from : today() }, "Plan ended")}>End</button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
