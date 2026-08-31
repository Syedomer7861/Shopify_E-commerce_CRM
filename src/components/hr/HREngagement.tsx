"use client";
import { useState, useEffect } from "react";
import { Star, BookOpen, AlertCircle, Plus, CheckCircle, Clock, X, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { Pagination } from "@/components/ui";
import toast from "react-hot-toast";
import { isDemoMode } from "@/lib/demo";

type ReviewStatus = "Pending" | "Completed" | "Scheduled";
interface Review { id: string; agent: string; period: string; rating: number; feedback: string; status: ReviewStatus; date: string; }
interface Training { id: string; agent: string; topic: string; dueDate: string; completed: boolean; }
interface Grievance { id: string; agent: string; subject: string; description: string; priority: "Low" | "Medium" | "High"; status: "Open" | "In Review" | "Resolved"; date: string; resolution: string; }

const PRIORITY_COLOR: Record<string, string> = { Low: "bg-sky-50 text-sky-700", Medium: "bg-amber-50 text-amber-700", High: "bg-rose-50 text-rose-700" };
const GSTATUS_COLOR: Record<string, string> = { "Open": "bg-amber-50 text-amber-700", "In Review": "bg-sky-50 text-sky-700", "Resolved": "bg-emerald-50 text-emerald-700" };

function Stars({ rating, onChange }: { rating: number; onChange?: (r: number) => void }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map(s => (
        <Star key={s} className={cn("w-4 h-4 transition-colors", s <= rating ? "text-amber-400 fill-amber-400" : "text-gray-200")}
          onClick={() => onChange?.(s)} style={{ cursor: onChange ? "pointer" : "default" }} />
      ))}
    </div>
  );
}

interface Props { reviews: any[]; assignments: any[]; grievances: any[]; employees: any[]; onRefresh: () => void; }

export default function HREngagement({ reviews: dbReviews, assignments: dbAssignments, grievances: dbGrievances, employees, onRefresh }: Props) {
  const [mounted, setMounted] = useState(false);
  const [tab, setTab] = useState<"reviews" | "training" | "grievances">("reviews");
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 10;

  useEffect(() => {
    setMounted(true);
  }, []);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [training, setTraining] = useState<Training[]>([]);
  const [grievances, setGrievances] = useState<Grievance[]>([]);
  const [editReview, setEditReview] = useState<{ id: string; rating: number; feedback: string } | null>(null);
  const [newT, setNewT] = useState({ agent_id: "", topic: "", dueDate: "" });
  const [newG, setNewG] = useState({ agent_id: "", subject: "", description: "", priority: "Medium" as "Low" | "Medium" | "High" });
  const [newR, setNewR] = useState({ agent_id: "", period: "" });

  useEffect(() => {
    setReviews(dbReviews.map(r => ({
      id: r.id,
      agent: r.profiles?.name || "Unknown",
      period: r.period || "Current",
      rating: Number(r.rating) || 0,
      feedback: r.feedback || "",
      status: r.status as ReviewStatus,
      date: r.created_at?.split("T")[0] || ""
    })));
    setTraining(dbAssignments.map(t => ({
      id: t.id,
      agent: t.profiles?.name || "Unknown",
      topic: t.topic,
      dueDate: t.due_date,
      completed: t.is_completed
    })));
    setGrievances(dbGrievances.map(g => ({
      id: g.id,
      agent: g.profiles?.name || "Unknown",
      subject: g.subject,
      description: g.description,
      priority: g.priority,
      status: g.status,
      date: g.created_at.split("T")[0],
      resolution: g.resolution || ""
    })));
  }, [dbReviews, dbAssignments, dbGrievances]);

  const handleAction = async (type: string, data: any, action = "insert") => {
    // Same gap as every other HR write component fixed this session -
    // this one had no isDemo check at all, so Reviews/Training/Grievances
    // create/update/delete would all hit the real database from a demo
    // session.
    if (isDemoMode()) {
      toast.success(`Demo: ${type} ${action === "delete" ? "deleted" : action === "update" ? "updated" : "saved"} (local only)`);
      return;
    }
    try {
      const res = await fetch("/api/hr/data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, action, data })
      });
      
      const result = await res.json();
      
      if (!res.ok) {
        console.error("Engagement API Error:", result.error);
        throw new Error(result.error || "Action failed");
      }
      
      toast.success(`${type.charAt(0).toUpperCase() + type.slice(1)} ${action === 'update' ? 'updated' : 'processed'} successfully`);
      onRefresh();
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Operation failed");
    }
  };

  const saveReview = () => {
    if (!editReview) return;
    handleAction("review", { id: editReview.id, rating: editReview.rating, feedback: editReview.feedback, status: "Completed" }, "update");
    setEditReview(null);
  };

  return (
    <div className="space-y-5">
      {/* ── HR Administrative Guidance ── */}
      <div className="bg-[#1c1c1c] text-white p-5 rounded-2xl flex items-start gap-4 shadow-xl border border-white/5">
        <div className="p-3 bg-white/10 rounded-xl">
          <TrendingUp className="w-6 h-6 text-emerald-400" />
        </div>
        <div>
          <h2 className="text-sm font-black uppercase tracking-tighter mb-1">HR Engagement Suite</h2>
          <p className="text-[11px] text-gray-400 font-medium leading-relaxed max-w-2xl">
            This module is designed to foster a high-performance culture and maintain professional standards. 
            Use <span className="text-white font-bold">Reviews</span> to formally appraise talent, <span className="text-white font-bold">Training</span> to track mandatory compliance (e.g. POSH), and <span className="text-white font-bold">Grievances</span> to resolve internal disputes with a clear audit trail.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-1 bg-gray-100 p-1 rounded-xl w-full sm:w-fit">
        {(["reviews", "training", "grievances"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={cn("px-4 py-1.5 text-xs font-bold rounded-lg capitalize transition-all",
              tab === t ? "bg-[#1c1c1c] text-white" : "text-gray-500 hover:text-[#1c1c1c]")}>
            {t === "reviews" ? "Performance Reviews" : t === "training" ? "Training Tracker" : "Grievances"}
          </button>
        ))}
      </div>

      {/* ── Performance Reviews ── */}
      {tab === "reviews" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="card p-6">
            <h3 className="text-sm font-black text-[#1c1c1c] uppercase tracking-widest mb-5 flex items-center gap-2">
              <Star className="w-4 h-4" /> Review Records
            </h3>
            <div className="space-y-4">
              {reviews.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE).map(r => (
                <div key={r.id} className={cn("p-5 space-y-3 border-l-4 bg-gray-50 rounded-r-xl", r.status === "Completed" ? "border-l-emerald-400" : "border-l-amber-400")}>
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="text-sm font-black text-[#1c1c1c]">{r.agent}</div>
                      <div className="text-[10px] text-gray-400 font-bold">{r.period}</div>
                    </div>
                    <span className={cn("text-[9px] font-black px-2 py-0.5 rounded-full", r.status === "Completed" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700")}>{r.status}</span>
                  </div>

                  {editReview?.id === r.id ? (
                    <div className="space-y-3">
                      <div>
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">Rating</label>
                        <Stars rating={editReview.rating} onChange={v => setEditReview(p => p ? { ...p, rating: v } : null)} />
                      </div>
                      <div>
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">Feedback</label>
                        <textarea className="input w-full text-xs min-h-[70px]" value={editReview.feedback}
                          onChange={e => setEditReview(p => p ? { ...p, feedback: e.target.value } : null)} />
                      </div>
                      <div className="flex gap-2">
                        <button onClick={saveReview} className="flex-1 btn-primary text-xs py-2 gap-1.5"><CheckCircle className="w-3 h-3" /> Save</button>
                        <button onClick={() => setEditReview(null)} className="btn-secondary text-xs py-2 px-4"><X className="w-3 h-3" /></button>
                      </div>
                    </div>
                  ) : r.status === "Completed" ? (
                    <>
                      <Stars rating={r.rating} />
                      <p className="text-xs text-gray-600 italic leading-relaxed">&ldquo;{r.feedback}&rdquo;</p>
                      <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100">
                        <p className="text-[10px] text-gray-400">{r.date}</p>
                        <div className="flex gap-3">
                          <button onClick={() => setEditReview({ id: r.id, rating: r.rating, feedback: r.feedback })} className="text-[10px] font-bold text-sky-500 hover:underline">Edit</button>
                          <button onClick={() => { if(confirm("Delete this review?")) handleAction("review", { id: r.id }, "delete") }} className="text-[10px] font-bold text-rose-500 hover:underline">Delete</button>
                        </div>
                      </div>
                    </>
                  ) : (
                    <button onClick={() => setEditReview({ id: r.id, rating: 0, feedback: "" })}
                      className="btn-secondary text-xs py-2 w-full gap-1.5 bg-white"><TrendingUp className="w-3 h-3" /> Start Review</button>
                  )}
                </div>
              ))}
              {reviews.length === 0 && <p className="text-xs text-gray-400 italic text-center py-6">No performance reviews on record.</p>}
              {reviews.length > ITEMS_PER_PAGE && (
                <div className="pt-2">
                  <Pagination 
                    current={currentPage} 
                    total={reviews.length} 
                    pageSize={ITEMS_PER_PAGE} 
                    onChange={setCurrentPage} 
                  />
                </div>
              )}
            </div>
          </div>

          <div className="card p-6 space-y-4 h-fit">
            <h3 className="text-sm font-black text-[#1c1c1c] uppercase tracking-widest flex items-center gap-2">
              <Plus className="w-4 h-4" /> Schedule Review
            </h3>
            <div>
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">Agent</label>
              <select className="input w-full text-sm" value={newR.agent_id} onChange={e => setNewR(p => ({ ...p, agent_id: e.target.value }))}>
                <option value="">Select Agent</option>
                {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">Review Period</label>
              <input className="input w-full text-sm" placeholder="e.g., Q3 2026" value={newR.period} onChange={e => setNewR(p => ({ ...p, period: e.target.value }))} />
            </div>
            <button onClick={() => {
              if (!newR.agent_id || !newR.period) return;
              handleAction("review", { agent_id: newR.agent_id, period: newR.period, status: "Pending" });
              setNewR({ agent_id: "", period: "" });
            }} className="btn-primary w-full text-xs py-2.5 gap-2">
              <Star className="w-3.5 h-3.5" /> Create Review Cycle
            </button>
          </div>
        </div>
      )}

      {/* ── Training Tracker ── */}
      {tab === "training" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="card p-6">
            <h3 className="text-sm font-black text-[#1c1c1c] uppercase tracking-widest mb-5 flex items-center gap-2">
              <BookOpen className="w-4 h-4" /> Training Assignments
            </h3>
            <div className="space-y-3">
              {training.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE).map(t => (
                <div key={t.id} onClick={() => handleAction("training", { id: t.id, is_completed: !t.completed }, "update")}
                  className={cn("flex items-center gap-3 p-3 rounded-xl cursor-pointer border transition-all",
                    t.completed ? "bg-emerald-50 border-emerald-100" : "bg-gray-50 border-transparent hover:border-gray-200")}>
                  <div className={cn("w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0",
                    t.completed ? "bg-emerald-500 border-emerald-500" : "border-gray-300")}>
                    {t.completed && <CheckCircle className="w-3 h-3 text-white" />}
                  </div>
                  <div className="flex-1">
                    <div className={cn("text-xs font-bold", t.completed ? "text-emerald-700 line-through" : "text-[#1c1c1c]")}>{t.topic}</div>
                    <div className="text-[10px] text-gray-400">{t.agent} · Due: {t.dueDate}</div>
                  </div>
                  {mounted && !t.completed && new Date(t.dueDate) < new Date() && (
                    <span className="text-[9px] font-black bg-rose-50 text-rose-600 px-1.5 py-0.5 rounded-full">Overdue</span>
                  )}
                </div>
              ))}
              {training.length > ITEMS_PER_PAGE && (
                <div className="pt-2">
                  <Pagination 
                    current={currentPage} 
                    total={training.length} 
                    pageSize={ITEMS_PER_PAGE} 
                    onChange={setCurrentPage} 
                  />
                </div>
              )}
            </div>
          </div>

          <div className="card p-6 space-y-4">
            <h3 className="text-sm font-black text-[#1c1c1c] uppercase tracking-widest flex items-center gap-2">
              <Plus className="w-4 h-4" /> Assign Training
            </h3>
            <div>
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">Agent</label>
              <select className="input w-full text-sm" value={newT.agent_id} onChange={e => setNewT(p => ({ ...p, agent_id: e.target.value }))}>
                <option value="">Select Agent</option>
                {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">Training Topic</label>
              <input className="input w-full text-sm" placeholder="e.g., POSH Awareness" value={newT.topic} onChange={e => setNewT(p => ({ ...p, topic: e.target.value }))} />
            </div>
            <div>
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">Due Date</label>
              <input type="date" className="input w-full text-sm" value={newT.dueDate} onChange={e => setNewT(p => ({ ...p, dueDate: e.target.value }))} />
            </div>
            <button onClick={() => {
              if (!newT.agent_id || !newT.topic || !newT.dueDate) return;
              handleAction("training", { agent_id: newT.agent_id, topic: newT.topic, due_date: newT.dueDate });
              setNewT({ agent_id: "", topic: "", dueDate: "" });
            }} className="btn-primary w-full text-xs py-2.5 gap-2">
              <BookOpen className="w-3.5 h-3.5" /> Assign Module
            </button>
          </div>
        </div>
      )}

      {/* ── Grievances ── */}
      {tab === "grievances" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="card p-6">
            <h3 className="text-sm font-black text-[#1c1c1c] uppercase tracking-widest mb-5 flex items-center gap-2">
              <AlertCircle className="w-4 h-4" /> Grievance Register
            </h3>
            <div className="space-y-4">
              {grievances.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE).map(g => (
                <div key={g.id} className="p-4 bg-gray-50 rounded-xl space-y-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="text-xs font-black text-[#1c1c1c]">{g.subject}</div>
                      <div className="text-[10px] text-gray-400">{g.agent} · {g.date}</div>
                    </div>
                    <div className="flex gap-1.5">
                      <span className={cn("text-[9px] font-black px-1.5 py-0.5 rounded-full", PRIORITY_COLOR[g.priority])}>{g.priority}</span>
                      <span className={cn("text-[9px] font-black px-1.5 py-0.5 rounded-full", GSTATUS_COLOR[g.status])}>{g.status}</span>
                    </div>
                  </div>
                  <p className="text-xs text-gray-600 italic">{g.description}</p>
                  {g.status !== "Resolved" && (
                    <div className="flex gap-2">
                      <button onClick={() => handleAction("grievance", { id: g.id, status: "In Review" }, "update")}
                        className="text-xs font-bold text-sky-500 hover:underline">Mark In Review</button>
                      <button onClick={() => handleAction("grievance", { id: g.id, status: "Resolved" }, "update")}
                        className="text-xs font-bold text-emerald-500 hover:underline">Resolve</button>
                    </div>
                  )}
                </div>
              ))}
              {grievances.length === 0 && <p className="text-xs text-gray-400 italic text-center py-6">No grievances on record.</p>}
              {grievances.length > ITEMS_PER_PAGE && (
                <div className="pt-2">
                  <Pagination 
                    current={currentPage} 
                    total={grievances.length} 
                    pageSize={ITEMS_PER_PAGE} 
                    onChange={setCurrentPage} 
                  />
                </div>
              )}
            </div>
          </div>

          <div className="card p-6 space-y-4">
            <h3 className="text-sm font-black text-[#1c1c1c] uppercase tracking-widest flex items-center gap-2">
              <Plus className="w-4 h-4" /> Log Grievance
            </h3>
            <div>
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">Agent</label>
              <select className="input w-full text-sm" value={newG.agent_id} onChange={e => setNewG(p => ({ ...p, agent_id: e.target.value }))}>
                <option value="">Select Agent</option>
                {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">Subject</label>
              <input className="input w-full text-sm" placeholder="Brief subject line" value={newG.subject} onChange={e => setNewG(p => ({ ...p, subject: e.target.value }))} />
            </div>
            <div>
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">Description</label>
              <textarea className="input w-full text-sm min-h-[70px]" placeholder="Describe the issue in detail..." value={newG.description} onChange={e => setNewG(p => ({ ...p, description: e.target.value }))} />
            </div>
            <div>
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">Priority</label>
              <div className="flex gap-2">
                {(["Low", "Medium", "High"] as const).map(pr => (
                  <button key={pr} onClick={() => setNewG(p => ({ ...p, priority: pr }))}
                    className={cn("flex-1 py-2 text-xs font-bold rounded-lg border transition-all",
                      newG.priority === pr ? PRIORITY_COLOR[pr] + " border-current" : "border-gray-200 text-gray-400")}>{pr}</button>
                ))}
              </div>
            </div>
            <button onClick={() => {
              if (!newG.agent_id || !newG.subject || !newG.description) return;
              handleAction("grievance", { 
                agent_id: newG.agent_id, 
                subject: newG.subject, 
                description: newG.description, 
                priority: newG.priority 
              });
              setNewG({ agent_id: "", subject: "", description: "", priority: "Medium" });
            }} className="btn-primary w-full text-xs py-2.5 gap-2">
              <AlertCircle className="w-3.5 h-3.5" /> Submit Grievance
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
