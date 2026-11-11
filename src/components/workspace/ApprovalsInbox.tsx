"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, X, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import { EmptyState } from "@/components/ui";
import { ModuleTabs } from "@/components/records/RecordsModule";
import { createClient } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";
import type { Profile } from "@/types";

type Approval = {
  id: string; entity_type: string; title: string; detail: string | null; amount: number | null;
  requested_by: string; approver_id: string | null; status: "pending" | "approved" | "rejected" | "cancelled";
  decision_note: string | null; created_at: string;
};

const STATUS_STYLE: Record<Approval["status"], string> = {
  pending: "bg-amber-50 text-amber-700", approved: "bg-emerald-50 text-emerald-600",
  rejected: "bg-rose-50 text-rose-600", cancelled: "bg-gray-100 text-gray-500",
};

/**
 * The one approvals inbox (approvals table, 20261111d). RLS returns what the
 * viewer requested, is the approver of, or reaches through approvals.view;
 * deciding is enforced by the approvals triggers, not by these buttons.
 * `compact` = pending-for-me only, for the home screen.
 */
export function ApprovalsInbox({ profile, compact = false }: { profile: Profile; compact?: boolean }) {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<Approval[]>([]);
  const [people, setPeople] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [notReady, setNotReady] = useState(false);
  const [tab, setTab] = useState<"todo" | "mine" | "history">("todo");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [list, team] = await Promise.all([
      supabase.from("approvals").select("*").order("created_at", { ascending: false }).limit(200),
      supabase.from("profiles").select("id,name"),
    ]);
    if (list.error) setNotReady(true);
    else setRows(list.data as Approval[]);
    setPeople(Object.fromEntries((team.data || []).map((p: any) => [p.id, p.name || "Unnamed"])));
    setLoading(false);
  }, [supabase]);

  useEffect(() => { load(); }, [load]);

  async function decide(row: Approval, status: "approved" | "rejected" | "cancelled") {
    const note = status === "rejected" ? prompt("Reason for rejecting (shown to the requester)") : null;
    if (status === "rejected" && note === null) return;
    setBusy(row.id);
    const { error } = await supabase.from("approvals").update({ status, decision_note: note?.trim() || null }).eq("id", row.id);
    if (error) toast.error(error.message);
    else { toast.success(`Request ${status}`); await load(); }
    setBusy(null);
  }

  if (loading) return <div className="py-8 text-center text-gray-400"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>;
  if (notReady) {
    return compact ? null : (
      <div className="card p-5 flex items-start gap-3 text-sm text-amber-700 bg-amber-50 border-amber-100">
        <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
        <div>Approvals aren&apos;t set up on this database yet. Run <code>supabase/APPLY_PHASES_1_TO_7.sql</code> in the SQL Editor, then reload.</div>
      </div>
    );
  }

  const todo = rows.filter(r => r.status === "pending" && r.requested_by !== profile.id);
  const mine = rows.filter(r => r.requested_by === profile.id);
  const history = rows.filter(r => r.status !== "pending" && r.requested_by !== profile.id);
  const shown = compact ? todo.slice(0, 5) : tab === "todo" ? todo : tab === "mine" ? mine : history;

  return (
    <div>
      {!compact && (
        <ModuleTabs
          tabs={[{ key: "todo", label: `To decide (${todo.length})` }, { key: "mine", label: `My requests (${mine.length})` }, { key: "history", label: "Decided" }]}
          active={tab} onChange={setTab}
        />
      )}
      {shown.length === 0 ? (
        compact
          ? <div className="py-6 text-center text-xs text-gray-400">Nothing waiting on you.</div>
          : <EmptyState icon={<CheckCircle2 className="w-6 h-6" />} title="Nothing here" desc={tab === "todo" ? "No requests are waiting on you." : "No requests yet."} />
      ) : (
        <div className="space-y-2">
          {shown.map(r => (
            <div key={r.id} className="card p-3 flex flex-wrap items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold text-[#1c1c1c] truncate">{r.title}</span>
                  <span className={cn("text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full", STATUS_STYLE[r.status])}>{r.status}</span>
                </div>
                <div className="text-[10px] text-gray-400 mt-0.5">
                  {r.entity_type} &middot; from {people[r.requested_by] || "someone"}
                  {r.approver_id && <> &middot; approver {people[r.approver_id] || "—"}</>}
                  {" "}&middot; {new Date(r.created_at).toLocaleDateString()}
                </div>
                {(r.detail || r.decision_note) && <div className="text-[11px] text-[#5f5f5d] mt-1">{r.decision_note ? `Note: ${r.decision_note}` : r.detail}</div>}
              </div>
              {r.status === "pending" && (
                busy === r.id ? <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                : r.requested_by === profile.id ? (
                  <button onClick={() => decide(r, "cancelled")} className="btn-secondary text-[10px] py-1 px-2">Withdraw</button>
                ) : (
                  <div className="flex gap-1.5 shrink-0">
                    <button onClick={() => decide(r, "approved")} aria-label="Approve" className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100"><Check className="w-4 h-4" /></button>
                    <button onClick={() => decide(r, "rejected")} aria-label="Reject" className="p-1.5 rounded-lg bg-rose-50 text-rose-500 hover:bg-rose-100"><X className="w-4 h-4" /></button>
                  </div>
                )
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
