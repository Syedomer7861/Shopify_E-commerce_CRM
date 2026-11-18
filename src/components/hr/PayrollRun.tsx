"use client";
import { ActionButton } from "@/components/ui";
import { useState, useEffect } from "react";
import { DollarSign, CheckCircle, Clock, TrendingUp, Plus, FileText, History, X, RotateCcw, Receipt } from "lucide-react";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";
import { isDemoMode } from "@/lib/demo";
import AttendancePayroll from "@/components/hr/AttendancePayroll";
import type { AttendancePolicy } from "@/lib/attendance-engine";


interface SalaryRevision { id: string; agent: string; date: string; oldSalary: number; newSalary: number; reason: string; }
interface Expense { id: string; agent: string; date: string; category: string; amount: number; description: string; status: "Pending" | "Approved" | "Rejected"; }



const FMT = (n: number) => `₹${n.toLocaleString("en-IN")}`;

interface Props {
  revisions: any[];
  expenses: any[];
  employees: any[];
  payrollStatus: Record<string, { status: string; marked_at: string | null }>;
  payrollMonth: string;
  onRefresh: () => void;
  attendance: any[];
  leaves: any[];
  holidays: { date: string }[];
  policy?: AttendancePolicy;
  payrollRuns: any[];
}

export default function PayrollRun({ revisions: dbRevisions, expenses: dbExpenses, employees, onRefresh, attendance, leaves, holidays, policy, payrollRuns }: Props) {
  const [mounted, setMounted] = useState(false);
  const [tab, setTab] = useState<"payroll" | "revisions" | "expenses">("payroll");

  useEffect(() => {
    setMounted(true);
  }, []);

  const [revisions, setRevisions] = useState<SalaryRevision[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [newRev, setNewRev] = useState({ agent_id: "", oldSalary: "", newSalary: "", reason: "" });
  const [newExp, setNewExp] = useState({ agent_id: "", category: "Travel", amount: "", description: "" });

  useEffect(() => {
    setRevisions(dbRevisions.map(r => ({
      id: r.id,
      agent: r.profiles?.name || "Unknown",
      date: r.created_at.split("T")[0],
      oldSalary: Number(r.old_salary),
      newSalary: Number(r.new_salary),
      reason: r.reason || ""
    })));
    setExpenses(dbExpenses.map(e => ({
      id: e.id,
      agent: e.profiles?.name || "Unknown",
      date: e.created_at.split("T")[0],
      category: e.category,
      amount: Number(e.amount),
      description: e.description || "",
      status: e.status
    })));
  }, [dbRevisions, dbExpenses]);

  const handleAction = async (type: string, data: any, action = "insert") => {
    // Demo mode is a real Supabase login - without this, Add Salary
    // Revision / Approve or Reject Expense / Add Expense all wrote to the
    // real database. This component had no isDemo check anywhere.
    if (isDemoMode()) {
      toast.success("Demo: saved (local only)");
      return;
    }
    try {
      const res = await fetch("/api/hr/data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, action, data })
      });
      if (!res.ok) throw new Error("Action failed");
      onRefresh();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex gap-1 bg-[#f0f0ec] p-1 rounded-xl w-fit">
        {(["payroll", "revisions", "expenses"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={cn("px-4 py-1.5 text-xs font-bold rounded-lg capitalize transition-all",
              tab === t ? "bg-[#1c1c1c] text-white" : "text-[#6b6b67] hover:text-[#1c1c1c]")}>
            {t === "revisions" ? "Salary History" : t === "expenses" ? "Expenses" : "Monthly Payroll"}
          </button>
        ))}
      </div>

      {/* ── Payroll Run ── */}
      {tab === "payroll" && (
        <AttendancePayroll employees={employees} attendance={attendance} leaves={leaves} holidays={holidays}
          policy={policy} payrollRuns={payrollRuns} onRefresh={onRefresh} />
      )}

      {/* ── Salary Revision History ── */}
      {tab === "revisions" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="card p-6">
            <h3 className="text-sm font-bold text-[#1c1c1c] uppercase tracking-wider mb-5 flex items-center gap-2">
              <History className="w-4 h-4" /> Revision History
            </h3>
            <div className="space-y-4">
              {revisions.map(r => (
                <div key={r.id} className="p-4 bg-[#f6f7f2] rounded-xl border-l-4 border-l-[#6fcb9d]">
                  <div className="flex justify-between items-start mb-2">
                    <div className="text-xs font-bold text-[#1c1c1c]">{r.agent}</div>
                    <div className="text-[9px] text-[#9a9a94] font-bold">{r.date}</div>
                  </div>
                  <div className="flex items-center gap-3 mb-1">
                    <span className="text-sm font-bold text-rose-400 line-through">{FMT(r.oldSalary)}</span>
                    <TrendingUp className="w-3 h-3 text-[#55c08f]" />
                    <span className="text-sm font-bold text-[#3fa877]">{FMT(r.newSalary)}</span>
                    <span className="text-[10px] font-bold text-[#3fa877]">
                      (+{Math.round(((r.newSalary - r.oldSalary) / r.oldSalary) * 100)}%)
                    </span>
                  </div>
                  <p className="text-[10px] text-[#6b6b67] italic">{r.reason}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="card p-6">
            <h3 className="text-sm font-bold text-[#1c1c1c] uppercase tracking-wider mb-5 flex items-center gap-2">
              <Plus className="w-4 h-4" /> Record New Revision
            </h3>
            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-bold text-[#9a9a94] uppercase tracking-wider block mb-1">Agent</label>
                <select className="input w-full text-sm" value={newRev.agent_id} onChange={e => setNewRev(p => ({ ...p, agent_id: e.target.value }))}>
                  <option value="">Select Agent</option>
                  {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
              </div>
              {[
                { key: "oldSalary", label: "Old Salary (₹)", placeholder: "30000" },
                { key: "newSalary", label: "New Salary (₹)", placeholder: "35000" },
                { key: "reason", label: "Reason / Note", placeholder: "Annual appraisal" },
              ].map(f => (
                <div key={f.key}>
                  <label className="text-[10px] font-bold text-[#9a9a94] uppercase tracking-wider block mb-1">{f.label}</label>
                  <input className="input w-full text-sm" placeholder={f.placeholder} value={(newRev as any)[f.key]}
                    onChange={e => setNewRev(p => ({ ...p, [f.key]: e.target.value }))} />
                </div>
              ))}
              <button onClick={() => {
                if (!newRev.agent_id || !newRev.newSalary) return;
                handleAction("revision", { 
                  agent_id: newRev.agent_id, 
                  old_salary: Number(newRev.oldSalary), 
                  new_salary: Number(newRev.newSalary), 
                  reason: newRev.reason 
                });
                setNewRev({ agent_id: "", oldSalary: "", newSalary: "", reason: "" });
              }} className="btn-primary w-full text-xs py-2.5 gap-2">
                <Plus className="w-3.5 h-3.5" /> Save Revision
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Expense Reimbursement ── */}
      {tab === "expenses" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="card p-6">
            <h3 className="text-sm font-bold text-[#1c1c1c] uppercase tracking-wider mb-5 flex items-center gap-2">
              <Receipt className="w-4 h-4" /> Expense Claims
            </h3>
            <div className="space-y-3">
              {expenses.map(e => (
                <div key={e.id} className="p-4 bg-[#f6f7f2] rounded-xl">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <div className="text-xs font-bold text-[#1c1c1c]">{e.agent}</div>
                      <div className="text-[10px] text-[#9a9a94]">{e.category} · {e.date}</div>
                    </div>
                    <span className="text-sm font-bold text-[#1c1c1c]">{FMT(e.amount)}</span>
                  </div>
                  <p className="text-[10px] text-[#6b6b67] italic mb-3">{e.description}</p>
                  <div className="flex gap-2 items-center">
                    <span className={cn("text-[9px] font-bold px-2 py-0.5 rounded-full flex-1",
                      e.status === "Approved" ? "bg-[#ecf8f1] text-[#2f8a5f]" :
                      e.status === "Rejected" ? "bg-rose-50 text-rose-600" : "bg-amber-50 text-amber-700")}>
                      {e.status}
                    </span>
                    {e.status === "Pending" && (
                      <>
                        <button onClick={() => handleAction("expense", { id: e.id, status: "Approved" }, "update")}
                          className="text-xs font-bold text-[#55c08f] hover:underline">Approve</button>
                        <button onClick={() => handleAction("expense", { id: e.id, status: "Rejected" }, "update")}
                          className="text-xs font-bold text-rose-400 hover:underline">Reject</button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="card p-6">
            <h3 className="text-sm font-bold text-[#1c1c1c] uppercase tracking-wider mb-5 flex items-center gap-2">
              <Plus className="w-4 h-4" /> Submit Expense
            </h3>
            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-bold text-[#9a9a94] uppercase tracking-wider block mb-1">Agent</label>
                <select className="input w-full text-sm" value={newExp.agent_id} onChange={e => setNewExp(p => ({ ...p, agent_id: e.target.value }))}>
                  <option value="">Select Agent</option>
                  {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
              </div>
              {[
                { key: "amount", label: "Amount (₹)", placeholder: "500" },
                { key: "description", label: "Description", placeholder: "Auto fare to office" },
              ].map(f => (
                <div key={f.key}>
                  <label className="text-[10px] font-bold text-[#9a9a94] uppercase tracking-wider block mb-1">{f.label}</label>
                  <input className="input w-full text-sm" placeholder={f.placeholder} value={(newExp as any)[f.key]}
                    onChange={e => setNewExp(p => ({ ...p, [f.key]: e.target.value }))} />
                </div>
              ))}
              <div>
                <label className="text-[10px] font-bold text-[#9a9a94] uppercase tracking-wider block mb-1">Category</label>
                <select className="input w-full text-sm" value={newExp.category} onChange={e => setNewExp(p => ({ ...p, category: e.target.value }))}>
                  {["Travel", "Stationery", "Internet", "Food", "Equipment", "Other"].map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <button onClick={() => {
                if (!newExp.agent_id || !newExp.amount) return;
                handleAction("expense", { 
                  agent_id: newExp.agent_id, 
                  amount: Number(newExp.amount), 
                  category: newExp.category, 
                  description: newExp.description 
                });
                setNewExp({ agent_id: "", category: "Travel", amount: "", description: "" });
              }} className="btn-primary w-full text-xs py-2.5 gap-2">
                <Plus className="w-3.5 h-3.5" /> Submit Claim
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
