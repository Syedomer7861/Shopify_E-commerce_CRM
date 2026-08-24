"use client";
import { useState, useEffect } from "react";
import { DollarSign, CheckCircle, Clock, TrendingUp, Plus, FileText, History, X, RotateCcw, Receipt } from "lucide-react";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";


interface PayslipRow { name: string; basic: number; hra: number; special: number; pf: number; pt: number; tds: number; net: number; status: "Paid" | "Pending" }
interface SalaryRevision { id: string; agent: string; date: string; oldSalary: number; newSalary: number; reason: string; }
interface Expense { id: string; agent: string; date: string; category: string; amount: number; description: string; status: "Pending" | "Approved" | "Rejected"; }



const FMT = (n: number) => `₹${n.toLocaleString("en-IN")}`;

interface Props { revisions: any[]; expenses: any[]; employees: any[]; onRefresh: () => void; }

export default function PayrollRun({ revisions: dbRevisions, expenses: dbExpenses, employees, onRefresh }: Props) {
  const [mounted, setMounted] = useState(false);
  const [tab, setTab] = useState<"payroll" | "revisions" | "expenses">("payroll");

  useEffect(() => {
    setMounted(true);
  }, []);

  const MONTH = mounted ? new Date().toLocaleString("default", { month: "long", year: "numeric" }) : "---";
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

  const [payslips, setPayslips] = useState<PayslipRow[]>([]);

  useEffect(() => {
    setPayslips(employees.map(a => {
      const gross = Number(a.monthly_salary) || 0;
      const basic = Math.round(gross * 0.5);
      const pf = Math.round(basic * 0.12);
      const hra = Math.round(basic * 0.4);
      const special = gross - basic - hra;
      // Professional tax was a flat ₹200 applied unconditionally, even to
      // employees with no salary configured at all (gross=0, meaning HR
      // never entered it - not that they're paid ₹0). That made every such
      // row net to -₹200 and the whole payroll total went negative.
      const pt = gross > 0 ? 200 : 0;
      const tds = gross > 41666 ? Math.round(gross * 0.05) : 0;
      return {
        name: a.name || a.email.split("@")[0],
        basic, hra, special, pf, pt, tds,
        net: gross > 0 ? gross - pf - pt - tds : 0,
        status: "Pending"
      };
    }));
  }, [employees]);

  const handleAction = async (type: string, data: any, action = "insert") => {
    // Demo mode is a real Supabase login - without this, Add Salary
    // Revision / Approve or Reject Expense / Add Expense all wrote to the
    // real database. This component had no isDemo check anywhere.
    if (document.cookie.includes("crm-demo-mode=true")) {
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

  const runAll = () => setPayslips(p => p.map(r => ({ ...r, status: "Paid" })));
  const toggleSlip = (name: string) => setPayslips(p => p.map(r => r.name === name ? { ...r, status: r.status === "Paid" ? "Pending" : "Paid" } : r));

  const totalPayroll = payslips.reduce((s, r) => s + r.net, 0);
  const paidCount = payslips.filter(p => p.status === "Paid").length;

  return (
    <div className="space-y-5">
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        {(["payroll", "revisions", "expenses"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={cn("px-4 py-1.5 text-xs font-bold rounded-lg capitalize transition-all",
              tab === t ? "bg-[#1c1c1c] text-white" : "text-gray-500 hover:text-[#1c1c1c]")}>
            {t === "revisions" ? "Salary History" : t === "expenses" ? "Expenses" : "Monthly Payroll"}
          </button>
        ))}
      </div>

      {/* ── Payroll Run ── */}
      {tab === "payroll" && (
        <div className="space-y-5">
          {/* Summary */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="card p-5 bg-[#1c1c1c] text-white">
              <p className="text-[10px] font-black text-white/50 uppercase tracking-widest mb-1">Total Payroll — {MONTH}</p>
              <div className="text-3xl font-black text-emerald-400">{FMT(totalPayroll)}</div>
            </div>
            <div className="card p-5">
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Disbursed</p>
              <div className="text-3xl font-black text-[#1c1c1c]">{paidCount} / {payslips.length}</div>
            </div>
            <div className="card p-5">
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Pending</p>
              <div className="text-3xl font-black text-amber-500">{FMT(payslips.filter(p => p.status === "Pending").reduce((s, r) => s + r.net, 0))}</div>
            </div>
          </div>

          <div className="card overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-[#fcfbf8]">
              <h3 className="text-sm font-black text-[#1c1c1c] uppercase tracking-widest">Payslip Register — {MONTH}</h3>
              <button onClick={runAll} className="btn-primary text-xs gap-2 px-4 py-2">
                <CheckCircle className="w-3.5 h-3.5" /> Mark All Paid
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-gray-50">
                    {["Agent", "Basic", "HRA", "Special", "EPF(-)", "Prof Tax(-)", "TDS(-)", "Net Pay", "Status", ""].map(h => (
                      <th key={h} className="px-4 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {payslips.map(row => (
                    <tr key={row.name} className="hover:bg-gray-50/50">
                      <td className="px-4 py-4 text-xs font-black text-[#1c1c1c]">{row.name}</td>
                      <td className="px-4 py-4 text-xs text-gray-600">{FMT(row.basic)}</td>
                      <td className="px-4 py-4 text-xs text-gray-600">{FMT(row.hra)}</td>
                      <td className="px-4 py-4 text-xs text-gray-600">{FMT(row.special)}</td>
                      <td className="px-4 py-4 text-xs text-rose-500">{FMT(row.pf)}</td>
                      <td className="px-4 py-4 text-xs text-rose-500">{FMT(row.pt)}</td>
                      <td className="px-4 py-4 text-xs text-rose-500">{FMT(row.tds)}</td>
                      <td className="px-4 py-4 text-sm font-black text-emerald-600">{FMT(row.net)}</td>
                      <td className="px-4 py-4">
                        <span className={cn("text-[9px] font-black px-2 py-0.5 rounded-full",
                          row.status === "Paid" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700")}>
                          {row.status}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <button onClick={() => toggleSlip(row.name)}
                          className="text-[10px] font-bold text-gray-400 hover:text-[#1c1c1c] transition-colors">
                          Toggle
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── Salary Revision History ── */}
      {tab === "revisions" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="card p-6">
            <h3 className="text-sm font-black text-[#1c1c1c] uppercase tracking-widest mb-5 flex items-center gap-2">
              <History className="w-4 h-4" /> Revision History
            </h3>
            <div className="space-y-4">
              {revisions.map(r => (
                <div key={r.id} className="p-4 bg-gray-50 rounded-xl border-l-4 border-l-emerald-400">
                  <div className="flex justify-between items-start mb-2">
                    <div className="text-xs font-black text-[#1c1c1c]">{r.agent}</div>
                    <div className="text-[9px] text-gray-400 font-bold">{r.date}</div>
                  </div>
                  <div className="flex items-center gap-3 mb-1">
                    <span className="text-sm font-bold text-rose-400 line-through">{FMT(r.oldSalary)}</span>
                    <TrendingUp className="w-3 h-3 text-emerald-500" />
                    <span className="text-sm font-black text-emerald-600">{FMT(r.newSalary)}</span>
                    <span className="text-[10px] font-bold text-emerald-600">
                      (+{Math.round(((r.newSalary - r.oldSalary) / r.oldSalary) * 100)}%)
                    </span>
                  </div>
                  <p className="text-[10px] text-gray-500 italic">{r.reason}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="card p-6">
            <h3 className="text-sm font-black text-[#1c1c1c] uppercase tracking-widest mb-5 flex items-center gap-2">
              <Plus className="w-4 h-4" /> Record New Revision
            </h3>
            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">Agent</label>
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
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">{f.label}</label>
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
            <h3 className="text-sm font-black text-[#1c1c1c] uppercase tracking-widest mb-5 flex items-center gap-2">
              <Receipt className="w-4 h-4" /> Expense Claims
            </h3>
            <div className="space-y-3">
              {expenses.map(e => (
                <div key={e.id} className="p-4 bg-gray-50 rounded-xl">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <div className="text-xs font-black text-[#1c1c1c]">{e.agent}</div>
                      <div className="text-[10px] text-gray-400">{e.category} · {e.date}</div>
                    </div>
                    <span className="text-sm font-black text-[#1c1c1c]">{FMT(e.amount)}</span>
                  </div>
                  <p className="text-[10px] text-gray-500 italic mb-3">{e.description}</p>
                  <div className="flex gap-2 items-center">
                    <span className={cn("text-[9px] font-black px-2 py-0.5 rounded-full flex-1",
                      e.status === "Approved" ? "bg-emerald-50 text-emerald-700" :
                      e.status === "Rejected" ? "bg-rose-50 text-rose-600" : "bg-amber-50 text-amber-700")}>
                      {e.status}
                    </span>
                    {e.status === "Pending" && (
                      <>
                        <button onClick={() => handleAction("expense", { id: e.id, status: "Approved" }, "update")}
                          className="text-xs font-bold text-emerald-500 hover:underline">Approve</button>
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
            <h3 className="text-sm font-black text-[#1c1c1c] uppercase tracking-widest mb-5 flex items-center gap-2">
              <Plus className="w-4 h-4" /> Submit Expense
            </h3>
            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">Agent</label>
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
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">{f.label}</label>
                  <input className="input w-full text-sm" placeholder={f.placeholder} value={(newExp as any)[f.key]}
                    onChange={e => setNewExp(p => ({ ...p, [f.key]: e.target.value }))} />
                </div>
              ))}
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">Category</label>
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
