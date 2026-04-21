"use client";
import { useState, useEffect } from "react";
import { 
  Search, 
  RefreshCw, 
  Trash2, 
  MoreVertical, 
  Phone, 
  Mail, 
  Calendar, 
  MessageSquare, 
  ExternalLink, 
  AlertTriangle, 
  Filter,
  ChevronLeft,
  ChevronRight,
  CheckSquare
} from "lucide-react";
import { PageHeader, EmptyState, TaskTypeBadge } from "@/components/ui";
import TaskCard from "@/components/TaskCard";
import { createClient } from "@/lib/supabase";
import { cn, toDbDateString } from "@/lib/utils";
import type { Task, Customer, Order, TaskType, TaskStatus } from "@/types";
import toast from "react-hot-toast";
import { logAuditEvent } from "@/lib/audit";

const TYPES: { label: string; value: string }[] = [
  { label: "All Types", value: "all" },
  { label: "Recovery", value: "recovery" },
  { label: "Review", value: "review" },
  { label: "Reorder", value: "reorder" },
  { label: "Final Follow-up", value: "final_followup" },
  { label: "Issue Resolution", value: "issue_resolution" },
  { label: "Transit Inform", value: "transit_update" },
];
const STATUSES: { label: string; value: string }[] = [
  { label: "All Statuses", value: "all" },
  { label: "Due Today", value: "due" },
  { label: "Overdue", value: "overdue" },
  { label: "Pending", value: "pending" },
  { label: "Done", value: "done" },
  { label: "Rescheduled", value: "rescheduled" },
];

import { useCurrentProfile } from "@/hooks/useCurrentProfile";

export default function TasksPage() {
  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState<(Task & { customer: Customer; order: Order })[]>([]);
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [counts, setCounts] = useState({ due: 0, overdue: 0, pending: 0, done: 0 });
  const [waSettings, setWaSettings] = useState<any>(null);
  const [syncing, setSyncing] = useState(false);
  const [agents, setAgents] = useState<{ id: string; name: string }[]>([]);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [showFilters, setShowFilters] = useState(true);
  const [dueStart, setDueStart] = useState("");
  const [dueEnd, setDueEnd] = useState("");
  const [agentFilter, setAgentFilter] = useState("all");
  const PAGE_SIZE = 50;
  const { profile, loading: profileLoading } = useCurrentProfile();

  const supabase = createClient();

  useEffect(() => {
    // Read URL parameters on mount to support incoming links from Dashboard KPI cards
    const params = new URLSearchParams(window.location.search);
    const initialStatus = params.get("status");
    const initialType = params.get("type");
    
    if (initialStatus && STATUSES.some(s => s.value === initialStatus)) {
      setStatusFilter(initialStatus);
      return; 
    }
    if (initialType && TYPES.some(t => t.value === initialType)) {
      setTypeFilter(initialType);
      return;
    }
  }, []); // Only run once on mount

  useEffect(() => {
    if (profileLoading) return; // Wait for the security profile to establish identity before fetching tasks
    
    if (profile?.role === "admin") {
      supabase.from("profiles").select("id, name").eq("role", "agent").eq("is_active", true).then(({ data }) => {
        if (data) setAgents(data);
      });
    }

    fetchTasks();
    const channel = supabase
      .channel('tasks-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => fetchTasks())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [typeFilter, statusFilter, search, profileLoading, page, dueStart, dueEnd, agentFilter]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [typeFilter, statusFilter, search, dueStart, dueEnd, agentFilter]);

  async function fetchTasks() {
    if (!profile) return; // Security boundary: must have a profile
    
    setLoading(true);
    const today = toDbDateString(new Date());
    let matchingCustomerIds: string[] | null = null;
    let matchingOrderIds: string[] | null = null;
    let matchingCartIds: string[] | null = null;

    if (search) {
      const cleanSearch = search.trim().replace(/^#/, "");
      const isPhone = /^\d{7,15}$/.test(cleanSearch.replace(/\s/g, ""));

      // 1. Search Customers
      const { data: matchingCustomers } = await supabase.from("customers")
        .select("id")
        .or(`name.ilike.%${cleanSearch}%,phone.ilike.%${cleanSearch}%,shopify_customer_id.ilike.%${cleanSearch}%,email.ilike.%${cleanSearch}%`)
        .limit(50);
      matchingCustomerIds = (matchingCustomers || []).map((c) => c.id);

      // 2. Search Orders
      const { data: matchingOrders } = await supabase
        .from("orders")
        .select("id")
        .or(`order_number.ilike.%${cleanSearch}%,shopify_order_id.ilike.%${cleanSearch}%,tracking_number.ilike.%${cleanSearch}%`);
      matchingOrderIds = (matchingOrders || []).map((o) => o.id);

      // 3. Search Abandoned Carts
      const { data: matchingCarts } = await supabase
        .from("abandoned_carts")
        .select("id")
        .or(`cart_token.ilike.%${cleanSearch}%,phone.ilike.%${cleanSearch}%`);
      matchingCartIds = (matchingCarts || []).map((c) => c.id);

      if ((!matchingCustomerIds || matchingCustomerIds.length === 0) && 
          (!matchingOrderIds || matchingOrderIds.length === 0) && 
          (!matchingCartIds || matchingCartIds.length === 0)) {
        setTasks([]);
        setCounts({ due: 0, overdue: 0, pending: 0, done: 0 });
        setLoading(false);
        return;
      }
    }
    
    // Core Tasks Query
    let query = supabase
      .from("tasks")
      .select("*, customer:customers!inner(*), order:orders(*), abandoned_cart:abandoned_carts(*), assigned_profile:profiles!tasks_assigned_to_fkey(id,name,email)");

    if (search) {
      const cleanSearch = search.trim().replace(/^#/, "");
      let orStrings = [];
      if (matchingCustomerIds && matchingCustomerIds.length > 0) orStrings.push(`customer_id.in.(${matchingCustomerIds.join(",")})`);
      if (matchingOrderIds && matchingOrderIds.length > 0) orStrings.push(`order_id.in.(${matchingOrderIds.join(",")})`);
      if (matchingCartIds && matchingCartIds.length > 0) orStrings.push(`abandoned_cart_id.in.(${matchingCartIds.join(",")})`);
      
      if (orStrings.length > 0) {
        query = query.or(orStrings.join(","));
      }
    }

    // Core Filters
    if (profile.role === "agent") {
      query = query.eq("assigned_to", profile.id);
    }

    if (typeFilter !== "all") {
      query = query.eq("task_type", typeFilter);
    }

    if (agentFilter !== "all") {
      query = query.eq("assigned_to", agentFilter);
    }

    if (dueStart) {
      query = query.gte("due_date", dueStart);
    }

    if (dueEnd) {
      query = query.lte("due_date", dueEnd);
    }

    // Status logic (Dynamic vs Static)
    if (statusFilter === "due") {
      query = query.eq("due_date", today).neq("status", "done");
    } else if (statusFilter === "overdue") {
      query = query.lt("due_date", today).neq("status", "done");
    } else if (statusFilter === "pending") {
      query = query.gt("due_date", today).neq("status", "done");
    } else if (statusFilter !== "all") {
      query = query.eq("status", statusFilter);
    }

    if (matchingCustomerIds && matchingCustomerIds.length > 0) {
      query = query.in("customer_id", matchingCustomerIds);
    }

    const { data: tasksData, count: totalMatching } = await query
      .order("priority_score", { ascending: false })
      .order("due_date", { ascending: true })
      .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

    setTotalCount(totalMatching || 0);

    // Accurate Stats Engine
    const statsQuery = (status: string) => {
      let q = supabase.from("tasks").select("*", { count: "exact", head: true });
      if (profile.role === "agent") q = q.eq("assigned_to", profile.id);
      
      if (status === "done") return q.eq("status", "done");
      if (status === "overdue") return q.lt("due_date", today).neq("status", "done");
      if (status === "due") return q.eq("due_date", today).neq("status", "done");
      if (status === "pending") return q.gt("due_date", today).neq("status", "done");
      return q;
    };

    const [dueRes, overdueRes, pendingRes, doneRes] = await Promise.all([
      statsQuery("due"),
      statsQuery("overdue"),
      statsQuery("pending"),
      statsQuery("done")
    ]);

    const c = { 
      due: dueRes.count || 0, 
      overdue: overdueRes.count || 0, 
      pending: pendingRes.count || 0, 
      done: doneRes.count || 0 
    };

    const { data: ws } = await supabase.from("settings").select("*").eq("id", "00000000-0000-0000-0000-000000000000").maybeSingle();
    setWaSettings(ws);

    // --- SENTINEL: Auto-Heal Stale Tasks on Sight ---
    const rawTasks = (tasksData || []) as any[];
    const healedTasks = rawTasks.filter(task => {
      const isLogisticsTask = ["issue_resolution", "transit_update"].includes(task.task_type);
      const isDelivered = task.order && ["delivered", "Delivered"].includes(task.order.delivery_status);
      
      if (isLogisticsTask && isDelivered && ["pending", "rescheduled"].includes(task.status)) {
        // Silently heal the database in the background
        const orderNum = task.order?.order_number || task.order?.shopify_order_id || "Unknown";
        supabase.from("tasks").update({ status: "cancelled" } as any).eq("id", task.id).then(() => {
           supabase.from("call_logs").insert({
             task_id: task.id,
             customer_id: task.customer_id,
             outcome: "done",
             note: `Auto-Resolved: Order #${orderNum} verified as Delivered. Task removed from queue.`,
             agent_name: "System Sentinel",
             called_at: new Date().toISOString()
           });
        });
        return false; // Remove from display immediately
      }
      return true;
    });

    setTasks(healedTasks);
    setCounts(c);
    setLoading(false);
  }

  async function handleReassign(id: string, newOwnerId: string) {
    if (!newOwnerId) return;
    const { error } = await supabase.from("tasks").update({ assigned_to: newOwnerId } as any).eq("id", id);
    if (error) return toast.error("Failed to reassign task");
    
    // Optionally log audit event
    await logAuditEvent({
      entityType: "task",
      entityId: id,
      action: "reassign",
      summary: `Manually reassigned task to different agent`,
      metadata: { newOwnerId }
    });
    
    toast.success("Task formally reassigned!");
    fetchTasks();
  }

  async function handleComplete(id: string, outcome: string, note: string, disposition?: string, followUpAction?: string) {
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
      await supabase.from("call_logs").insert({
        task_id: id,
        customer_id: task.customer_id,
        outcome,
        disposition: disposition || null,
        follow_up_action: followUpAction || null,
        note,
        agent_name: user?.email || "System",
        called_at: new Date().toISOString()
      });
      
      // Sync Abandoned Cart status if this was a recovery call
      if (task.task_type === "recovery" && outcome === "done" && task.abandoned_cart_id) {
          await supabase.from("abandoned_carts").update({ recovery_status: "recovered" }).eq("id", task.abandoned_cart_id);
      }
    }
    await logAuditEvent({
      entityType: "task",
      entityId: id,
      action: "complete",
      summary: `Completed ${task?.task_type || "task"}`,
      metadata: { outcome, disposition, followUpAction },
    });
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
        disposition: "callback_requested",
        follow_up_action: reason || "Rescheduled",
        note: `Rescheduled to ${date}${reason ? `: ${reason}` : ""}`,
        agent_name: user?.email || "Agent",
        called_at: new Date().toISOString()
      });
    }

    await logAuditEvent({
      entityType: "task",
      entityId: id,
      action: "reschedule",
      summary: `Rescheduled task to ${date}`,
      metadata: { reason },
    });
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
        disposition: "follow_up_later",
        follow_up_action: "Skipped",
        note: "Task skipped",
        agent_name: user?.email || "Agent",
        called_at: new Date().toISOString()
      });
    }
    await logAuditEvent({
      entityType: "task",
      entityId: id,
      action: "skip",
      summary: "Skipped task",
    });
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
              onClick={() => setShowFilters(!showFilters)}
              className={cn("btn-secondary flex items-center gap-1.5 py-1.5 px-3", showFilters && "bg-[#2D1E6F]/10 border-[#2D1E6F] text-[#2D1E6F]")}
            >
              <Filter className="w-3.5 h-3.5" />
              {showFilters ? "Hide Filters" : "Filters"}
            </button>

            <button 
              onClick={handleGlobalSync} 
              disabled={syncing}
              className={cn(
                "btn-secondary flex items-center gap-1.5 py-1.5 px-3",
                syncing && "opacity-50 cursor-not-allowed"
              )}
            >
              <RefreshCw className={cn("w-3.5 h-3.5", syncing && "animate-spin")} />
              {syncing ? "Syncing..." : "Sync System"}
            </button>
          </div>
        }
      />

      {/* Advanced Filter Panel */}
      {showFilters && (
        <div className="card p-4 mb-5 border-[#2D1E6F]/10 animate-slide-down bg-white shadow-lg overflow-visible z-10">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">Due Date From</label>
              <input type="date" className="input text-xs" value={dueStart} onChange={e => setDueStart(e.target.value)} />
            </div>
            <div>
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">Due Date To</label>
              <input type="date" className="input text-xs" value={dueEnd} onChange={e => setDueEnd(e.target.value)} />
            </div>
            {profile?.role === "admin" && (
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">Assigned To</label>
                <select className="select text-xs" value={agentFilter} onChange={e => setAgentFilter(e.target.value)}>
                  <option value="all">All Agents</option>
                  {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
            )}
          </div>
          <div className="flex justify-end mt-4 pt-4 border-t border-gray-100 gap-2">
            <button 
              onClick={() => {
                setDueStart("");
                setDueEnd("");
                setAgentFilter("all");
                setTypeFilter("all");
                setStatusFilter("all");
              }}
              className="text-xs text-rose-500 font-bold hover:underline py-2 px-3"
            >
              Reset All
            </button>
            <button 
              onClick={() => {}}
              className="btn-primary py-2 px-6 text-xs"
            >
              Apply Filters
            </button>
          </div>
        </div>
      )}


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
                  typeFilter === t.value ? "bg-[#2D1E6F] text-white shadow-sm" : "text-gray-500 hover:text-gray-700"
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
          { label: "Done", count: counts.done, color: "bg-blue-50 text-blue-700 border-blue-200" },
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
              isAdmin={profile?.role === "admin"}
              agents={agents}
              onReassign={handleReassign}
            />
          ))
        )}
      </div>

      {/* Pagination Controls */}
      {totalCount > PAGE_SIZE && (
        <div className="flex items-center justify-between mt-8 pb-4">
          <p className="text-xs text-gray-500">
            Showing <strong>{(page - 1) * PAGE_SIZE + 1}</strong> to <strong>{Math.min(page * PAGE_SIZE, totalCount)}</strong> of <strong>{totalCount}</strong> tasks
          </p>
          <div className="flex items-center gap-1">
            <button 
              onClick={() => { setPage(p => Math.max(1, p - 1)); window.scrollTo(0, 0); }}
              disabled={page === 1}
              className="btn-secondary px-3 py-1.5 disabled:opacity-50 text-xs"
            >
              Previous
            </button>
            <div className="flex items-center gap-1 mx-2">
              {[...Array(Math.min(5, Math.ceil(totalCount / PAGE_SIZE)))].map((_, i) => {
                const pageNum = i + 1;
                return (
                  <button
                    key={pageNum}
                    onClick={() => { setPage(pageNum); window.scrollTo(0, 0); }}
                    className={cn(
                      "w-8 h-8 rounded-md text-xs font-medium transition-all",
                      page === pageNum ? "bg-[#2D1E6F] text-white shadow-sm" : "hover:bg-gray-100 text-gray-600"
                    )}
                  >
                    {pageNum}
                  </button>
                );
              })}
              {Math.ceil(totalCount / PAGE_SIZE) > 5 && (
                 <span className="text-gray-400 text-xs px-1">...</span>
              )}
            </div>
            <button 
              onClick={() => { setPage(p => Math.min(Math.ceil(totalCount / PAGE_SIZE), p + 1)); window.scrollTo(0, 0); }}
              disabled={page >= Math.ceil(totalCount / PAGE_SIZE)}
              className="btn-secondary px-3 py-1.5 disabled:opacity-50 text-xs"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
