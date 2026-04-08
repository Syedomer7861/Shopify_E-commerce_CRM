"use client";
import { useState, useEffect } from "react";
import { Filter, CheckSquare, RefreshCw, Search } from "lucide-react";
import { PageHeader, EmptyState, TaskTypeBadge } from "@/components/ui";
import TaskCard from "@/components/TaskCard";
import { createClient } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import type { Task, Customer, Order, TaskType, TaskStatus } from "@/types";
import toast from "react-hot-toast";

const TYPES: { label: string; value: string }[] = [
  { label: "All Types", value: "all" },
  { label: "Recovery", value: "recovery" },
  { label: "Review", value: "review" },
  { label: "Reorder", value: "reorder" },
  { label: "Final Follow-up", value: "final_followup" },
];
const STATUSES: { label: string; value: string }[] = [
  { label: "All Statuses", value: "all" },
  { label: "Due Today", value: "due" },
  { label: "Overdue", value: "overdue" },
  { label: "Pending", value: "pending" },
  { label: "Done", value: "done" },
  { label: "Rescheduled", value: "rescheduled" },
];

export default function TasksPage() {
  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState<(Task & { customer: Customer; order: Order })[]>([]);
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [counts, setCounts] = useState({ due: 0, overdue: 0, pending: 0, done: 0 });
  const [waSettings, setWaSettings] = useState<any>(null);
  const [syncing, setSyncing] = useState(false);

  const supabase = createClient();

  useEffect(() => {
    fetchTasks();

    // REAL-TIME UPDATES: Listen for any changes to the tasks table
    const channel = supabase
      .channel('tasks-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => fetchTasks())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [typeFilter, statusFilter, search]);

  async function fetchTasks() {
    setLoading(true);
    const today = new Date().toLocaleDateString("en-CA");
    
    // We use a join here to filter by customer fields
    let query = supabase
      .from("tasks")
      .select("*, customer:customers!inner(*), order:orders(*), abandoned_cart:abandoned_carts(*)");

    if (typeFilter !== "all") {
      query = query.eq("task_type", typeFilter);
    }

    if (statusFilter !== "all") {
      if (statusFilter === "due") {
        query = query.eq("due_date", today).neq("status", "done");
      } else if (statusFilter === "overdue") {
        query = query.lt("due_date", today).neq("status", "done");
      } else if (statusFilter === "pending") {
        query = query.gt("due_date", today).neq("status", "done");
      } else {
        query = query.eq("status", statusFilter);
      }
    }

    if (search) {
      query = query.or(`name.ilike.%${search}%,phone.ilike.%${search}%`, { foreignTable: "customers" });
    }

    const { data: tasksData } = await query.order("due_date", { ascending: true });

    // Fetch stats
    const { data: allTasks } = await supabase.from("tasks").select("status, due_date");
    const c = { due: 0, overdue: 0, pending: 0, done: 0 };
    allTasks?.forEach(t => {
      if (t.status === "done") c.done++;
      else if (t.due_date < today) c.overdue++;
      else if (t.due_date === today) c.due++;
      else c.pending++;
    });

    const { data: ws } = await supabase.from("settings").select("*").eq("id", "00000000-0000-0000-0000-000000000000").maybeSingle();
    setWaSettings(ws);

    setTasks((tasksData || []) as any);
    setCounts(c);
    setLoading(false);
  }

  async function handleComplete(id: string, outcome: string, note: string) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return toast.error("User session not found. Please log in again.");
    
    setLoading(true);
    const { error: taskErr } = await supabase.from("tasks").update({ 
      status: "done", 
      completed_at: new Date().toISOString() 
    } as any).eq("id", id);
    
    if (taskErr) {
      setLoading(false);
      return toast.error("Failed to update task");
    }

    const task = tasks.find(t => t.id === id);
    if (task) {
      await supabase.from("call_logs").insert({ task_id: id, customer_id: task.customer_id, outcome, note, agent_name: user?.email || "System" });
      
      // Sync Abandoned Cart status if this was a recovery call
      if (task.task_type === "recovery" && outcome === "done" && task.abandoned_cart_id) {
          await supabase.from("abandoned_carts").update({ recovery_status: "recovered" }).eq("id", task.abandoned_cart_id);
      }
    }
    toast.success("Call logged");
    fetchTasks();
  }

  async function handleReschedule(id: string, date: string, reason: string) {
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("tasks").update({ status: "rescheduled", due_date: date, rescheduled_to: date } as any).eq("id", id);
    if (error) return toast.error("Failed to reschedule");

    const task = tasks.find(t => t.id === id);
    if (task) {
      await supabase.from("call_logs").insert({
        task_id: id,
        customer_id: task.customer_id,
        outcome: "rescheduled",
        note: `Rescheduled to ${date}${reason ? `: ${reason}` : ""}`,
        agent_name: user?.email || "Agent"
      });
    }

    toast.success("Task rescheduled");
    fetchTasks();
  }

  async function handleSkip(id: string) {
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("tasks").update({ status: "skipped" } as any).eq("id", id);
    if (error) return toast.error("Failed to skip");

    const task = tasks.find(t => t.id === id);
    if (task) {
      await supabase.from("call_logs").insert({
        task_id: id,
        customer_id: task.customer_id,
        outcome: "skipped",
        note: "Task skipped",
        agent_name: user?.email || "Agent"
      });
    }
    toast.success("Task skipped");
    fetchTasks();
  }

  async function handleGlobalSync() {
    setSyncing(true);
    try {
      const res = await fetch("/api/sync/all", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        const { logs, tasks, whatsapp } = data.report;
        let msg = `Sync Complete: ${logs.processed} logs, ${tasks.generated} tasks processed.`;
        if (whatsapp && (whatsapp.recovery > 0 || whatsapp.reorder > 0 || whatsapp.review > 0)) {
          msg += ` Sent WhatsApps: ${whatsapp.recovery + whatsapp.reorder + whatsapp.review}`;
        }
        toast.success(msg, { duration: 5000 });
      } else {
        toast.error(data.error || "Sync failed");
      }
    } catch (err) {
      toast.error("Failed to sync system");
    } finally {
      await fetchTasks();
      setSyncing(false);
    }
  }

  return (
    <div className="animate-fade-in">
      <PageHeader title="All Tasks" subtitle={`${tasks.length} tasks matching filters`} 
        actions={
          <div className="flex items-center gap-2">
            <button 
              onClick={handleGlobalSync} 
              disabled={syncing}
              className={cn(
                "btn-secondary flex items-center gap-1.5 py-1.5 px-3",
                syncing && "opacity-50 cursor-not-allowed"
              )}
            >
              <RefreshCw className={cn("w-3.5 h-3.5", (syncing || loading) && "animate-spin")} />
              {syncing ? "Syncing..." : "Sync System"}
            </button>
          </div>
        }
      />


      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input 
            type="text" 
            placeholder="Search customer name or phone..." 
            className="input pl-9 text-xs" 
            value={search} 
            onChange={e => setSearch(e.target.value)} 
          />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 bg-white rounded-lg border border-gray-200 p-1">
            {TYPES.map(t => (
              <button key={t.value} onClick={() => setTypeFilter(t.value)}
                className={cn("px-3 py-1.5 rounded-md text-xs font-medium transition-all",
                  typeFilter === t.value ? "bg-forest text-lime shadow-sm" : "text-gray-500 hover:text-gray-700"
                )}>
                {t.label}
              </button>
            ))}
          </div>
          <select className="select w-auto text-xs" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
      </div>

      {/* Summary badges */}
      <div className="flex gap-3 flex-wrap mb-4">
        {[
          { label: "Due Today", count: counts.due, color: "bg-amber-50 text-amber-700 border-amber-200" },
          { label: "Overdue", count: counts.overdue, color: "bg-rose-50 text-rose-700 border-rose-200" },
          { label: "Pending", count: counts.pending, color: "bg-blue-50 text-blue-700 border-blue-200" },
          { label: "Done", count: counts.done, color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
        ].map(s => (
          <div key={s.label} className={cn("px-3 py-1.5 rounded-lg border text-xs font-medium", s.color)}>
            {s.label}: <strong>{s.count}</strong>
          </div>
        ))}
      </div>

      {/* Task list */}
      <div className="space-y-3">
        {loading ? (
          <div className="p-12 text-center text-gray-400 text-sm">Searching tasks...</div>
        ) : tasks.length === 0 ? (
          <EmptyState icon={<CheckSquare className="w-5 h-5" />} title="No tasks found" desc="Try adjusting your filters" />
        ) : (
          tasks.map(task => (
            <TaskCard key={task.id} task={task as any}
              onComplete={handleComplete}
              onReschedule={handleReschedule}
              onSkip={handleSkip}
              onWhatsApp={() => fetchTasks()}
              whatsappSettings={waSettings}
            />
          ))
        )}
      </div>
    </div>
  );
}
