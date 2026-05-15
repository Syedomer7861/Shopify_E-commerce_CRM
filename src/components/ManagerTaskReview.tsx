"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import { 
  CheckCircle, XCircle, Search, Filter, Clock, 
  MessageSquare, User, Phone, Zap, ArrowRight,
  Eye, History, AlertCircle, Loader2, Package, Truck, ShoppingBag, Info, Calendar
} from "lucide-react";
import { createClient } from "@/lib/supabase";
import { Avatar, TaskTypeBadge, Modal, Pagination } from "./ui";
import { cn, formatDate, timeAgo, getTaskProductName } from "@/lib/utils";
import ShiprocketOrderView from "./ShiprocketOrderView";
import NDRActionModal from "./NDRActionModal";
import toast from "react-hot-toast";
import type { Task, Customer, Order, AbandonedCart } from "@/types";

export default function ManagerTaskReview() {
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState<any[]>([]);
  const [ndrOrders, setNdrOrders] = useState<any[]>([]);
  const [viewMode, setViewMode] = useState<'audit' | 'ndr'>('audit');
  const [searchTerm, setSearchTerm] = useState("");
  const [agentFilter, setAgentFilter] = useState("all");
  const [uzmaOnly, setUzmaOnly] = useState(false);
  const [typeFilter, setTypeFilter] = useState("all");
  const [outcomeFilter, setOutcomeFilter] = useState("all");
  const [agents, setAgents] = useState<{ id: string; name: string }[]>([]);
  const [selectedTask, setSelectedTask] = useState<any>(null);
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [showNDRModal, setShowNDRModal] = useState(false);
  const [ndrOrderForModal, setNdrOrderForModal] = useState<any>(null);
  const [reviewNote, setReviewNote] = useState("");
  const [processing, setProcessing] = useState<string | null>(null);
  const [stats, setStats] = useState({ pending: 0, approvedToday: 0, rejectedToday: 0, activeAgents: 0, activeNdr: 0 });
  const [totalTasksCount, setTotalTasksCount] = useState(0);
  const [totalNdrCount, setTotalNdrCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [mounted, setMounted] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string>("");
  const ITEMS_PER_PAGE = 10;

  useEffect(() => {
    setMounted(true);
    setLastUpdated(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
  }, []);

  const fetchTasks = useCallback(async (silent = false) => {
    const isDemo = document.cookie.includes("crm-demo-mode=true");
    if (isDemo) {
      if (!silent && !tasks.length) setLoading(true);
      setLastUpdated(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
      setTimeout(() => {
        setStats({ pending: 8, approvedToday: 24, rejectedToday: 2, activeAgents: 5, activeNdr: 12 });
        setTasks([
          { 
            id: 't1', task_type: 'ndr', status: 'done', is_processed_by_manager: false, completed_at: new Date(Date.now() - 3600000).toISOString(),
            customer: { id: 'c1', name: 'John Doe', phone: '9876543210', city: 'Mumbai', state: 'Maharashtra' },
            assigned_profile: { name: 'Agent Rahul' },
            call_logs: [{ outcome: 'done', disposition: 'NDR_RESOLVED', note: 'Customer confirmed address change. Updated on Shiprocket.', called_at: new Date(Date.now() - 3600000).toISOString() }],
            order: { order_number: '1001', total_price: 1500 }
          },
          { 
            id: 't2', task_type: 'recovery', status: 'done', is_processed_by_manager: false, completed_at: new Date(Date.now() - 7200000).toISOString(),
            customer: { id: 'c2', name: 'Jane Smith', phone: '8877665544', city: 'Delhi', state: 'Delhi' },
            assigned_profile: { name: 'Agent Amit' },
            call_logs: [{ outcome: 'done', disposition: 'CONVERTED', note: 'Customer completed payment via link.', called_at: new Date(Date.now() - 7200000).toISOString() }],
            abandoned_cart: { total_price: 2400 }
          }
        ]);
        setTotalTasksCount(8);
        setLoading(false);
      }, 500);
      return;
    }

    if (!silent && !tasks.length) setLoading(true);
    setLastUpdated(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    try {
      // 1. Fetch Stats for Header (Silent)
      const today = new Date().toISOString().split('T')[0];
      const [pendingRes, approvedRes, rejectedRes, activeRes, ndrCountRes] = await Promise.all([
        supabase.from("tasks").select("id", { count: "exact", head: true }).eq("status", "done").eq("is_processed_by_manager", false),
        supabase.from("tasks").select("id", { count: "exact", head: true }).eq("manager_action", "approved").gte("manager_processed_at", today),
        supabase.from("tasks").select("id", { count: "exact", head: true }).eq("manager_action", "rejected").gte("manager_processed_at", today),
        supabase.from("agent_activity_logs").select("agent_id", { count: "exact", head: true }).gte("created_at", new Date(Date.now() - 3600000).toISOString()),
        supabase.from("orders").select("id", { count: "exact", head: true }).in("delivery_status", ["ndr", "rto", "failed"])
      ]);

      setStats({
        pending: pendingRes.count || 0,
        approvedToday: approvedRes.count || 0,
        rejectedToday: rejectedRes.count || 0,
        activeAgents: activeRes.count || 0,
        activeNdr: ndrCountRes.count || 0
      });

      // 2. Fetch Audit Queue with Server-side Pagination & Filters
      let selectStr = `
        *,
        customer:customers!inner(*),
        order:orders(*),
        abandoned_cart:abandoned_carts(*),
        assigned_profile:profiles!tasks_assigned_to_fkey(name, email),
        call_logs:call_logs(outcome, disposition, note, called_at, agent_name)
      `;

      // Use inner join for outcome filter if specified
      if (outcomeFilter !== "all") {
        selectStr = `
          *,
          customer:customers!inner(*),
          order:orders(*),
          abandoned_cart:abandoned_carts(*),
          assigned_profile:profiles!tasks_assigned_to_fkey(name, email),
          call_logs:call_logs!inner(outcome, disposition, note, called_at, agent_name)
        `;
      }

      let query = supabase
        .from("tasks")
        .select(selectStr, { count: "exact" })
        .eq("status", "done")
        .eq("is_processed_by_manager", false);

      if (agentFilter !== "all") query = query.eq("assigned_to", agentFilter);
      if (typeFilter !== "all") query = query.eq("task_type", typeFilter);
      if (outcomeFilter !== "all") query = query.eq("call_logs.outcome", outcomeFilter);
      
      if (searchTerm) {
        query = query.or(`name.ilike.%${searchTerm}%,phone.ilike.%${searchTerm}%`, { foreignTable: 'customers' });
      }

      const from = (currentPage - 1) * ITEMS_PER_PAGE;
      const to = from + ITEMS_PER_PAGE - 1;

      const { data, count, error } = await query
        .order("completed_at", { ascending: false })
        .range(from, to);

      if (error) throw error;
      
      let finalData = (data || []) as any[];
      if (uzmaOnly) {
        finalData = finalData.filter(t => t.assigned_profile?.name?.toLowerCase().includes("uzma"));
      }

      setTasks(finalData);
      setTotalTasksCount(count || 0);
    } catch (err: any) {
      toast.error("Failed to load review queue");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [supabase, currentPage, agentFilter, typeFilter, outcomeFilter, uzmaOnly, searchTerm]);

  const fetchNdrOrders = useCallback(async (silent = false) => {
    const isDemo = document.cookie.includes("crm-demo-mode=true");
    if (isDemo) {
      if (!silent && !ndrOrders.length) setLoading(true);
      setLastUpdated(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
      setTimeout(() => {
        setNdrOrders([
          { 
            id: 'o1', order_number: '1001', delivery_status: 'ndr', ordered_at: new Date(Date.now() - 86400000).toISOString(),
            customer: { id: 'c1', name: 'John Doe', phone: '9876543210', city: 'Mumbai', state: 'Maharashtra' },
            courier_name: 'Delhivery', tracking_number: 'AWB987654321', total_price: 1500, line_items: [{ payload: { status: 'Incorrect Address' } }]
          },
          { 
            id: 'o2', order_number: '1002', delivery_status: 'rto', ordered_at: new Date(Date.now() - 172800000).toISOString(),
            customer: { id: 'c2', name: 'Jane Smith', phone: '8877665544', city: 'Delhi', state: 'Delhi' },
            courier_name: 'BlueDart', tracking_number: 'AWB11223344', total_price: 2400, line_items: [{ payload: { status: 'Refused by Customer' } }], rto_risk: true
          }
        ]);
        setTotalNdrCount(12);
        setLoading(false);
      }, 500);
      return;
    }

    if (!silent && !ndrOrders.length) setLoading(true);
    setLastUpdated(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    try {
      let query = supabase
        .from("orders")
        .select("*, customer:customers!inner(*)", { count: "exact" })
        .in("delivery_status", ["ndr", "rto", "failed", "out_for_delivery", "delivered_exception"]);

      if (searchTerm) {
        // Pre-fetch customer IDs to avoid PostgREST cross-table OR errors
        const { data: matchedCustomers } = await supabase
          .from("customers")
          .select("id")
          .or(`name.ilike.%${searchTerm}%,phone.ilike.%${searchTerm}%`);
        
        const cIds = matchedCustomers?.map(c => c.id) || [];
        if (cIds.length > 0) {
          query = query.or(`order_number.ilike.%${searchTerm}%,tracking_number.ilike.%${searchTerm}%,customer_id.in.(${cIds.join(',')})`);
        } else {
          query = query.or(`order_number.ilike.%${searchTerm}%,tracking_number.ilike.%${searchTerm}%`);
        }
      }

      const from = (currentPage - 1) * ITEMS_PER_PAGE;
      const to = from + ITEMS_PER_PAGE - 1;

      const { data, count, error } = await query
        .order("ordered_at", { ascending: false })
        .range(from, to);

      if (error) throw error;
      setNdrOrders(data || []);
      setTotalNdrCount(count || 0);
    } catch (err) {
      console.error("NDR fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [supabase, currentPage, searchTerm]);

  useEffect(() => {
    async function fetchAgents() {
      try {
        const { data } = await supabase.from("profiles").select("id, name").eq("role", "agent").eq("is_active", true);
        if (data) setAgents(data);
      } catch (err) {
        console.error("Agents fetch error:", err);
      }
    }
    fetchAgents();
  }, [supabase]);

  useEffect(() => {
    if (viewMode === 'audit') fetchTasks();
    else fetchNdrOrders();
  }, [currentPage, agentFilter, uzmaOnly, typeFilter, outcomeFilter, viewMode, searchTerm, fetchTasks, fetchNdrOrders]);

  useEffect(() => {
    setCurrentPage(1);
  }, [agentFilter, uzmaOnly, typeFilter, outcomeFilter, viewMode, searchTerm]);

  const handleProcess = async (taskId: string, action: 'approved' | 'rejected' | 'shiprocket_updated') => {
    setProcessing(taskId);
    const isDemo = document.cookie.includes("crm-demo-mode=true");
    if (isDemo) {
      setTimeout(() => {
        toast.success(action === 'approved' ? "Demo: Task Approved" : action === 'shiprocket_updated' ? "Demo: NDR Action Logged" : "Demo: Task Flagged for Revision");
        setTasks(prev => prev.filter(t => t.id !== taskId));
        setSelectedTask(null);
        setReviewNote("");
        setProcessing(null);
      }, 800);
      return;
    }

    try {
      const { error } = await supabase
        .from("tasks")
        .update({
          is_processed_by_manager: action !== 'rejected', 
          manager_processed_at: new Date().toISOString(),
          manager_note: reviewNote,
          manager_action: action,
          status: action === 'rejected' ? 'due' : 'done' 
        })
        .eq("id", taskId);

      if (error) throw error;
      
      toast.success(action === 'approved' ? "Task Approved" : action === 'shiprocket_updated' ? "NDR Action Logged" : "Task Flagged for Revision");
      setTasks(prev => prev.filter(t => t.id !== taskId));
      setSelectedTask(null);
      setReviewNote("");
    } catch (err: any) {
      toast.error("Process failed");
    } finally {
      setProcessing(null);
    }
  };

  const filteredTasks = tasks.filter(t => 
    t.customer?.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    t.assigned_profile?.name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredNdr = ndrOrders.filter(o => 
    o.customer?.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    o.order_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    o.tracking_number?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalPages = Math.ceil((viewMode === 'audit' ? totalTasksCount : totalNdrCount) / ITEMS_PER_PAGE);
  const paginatedTasks = tasks;
  const paginatedNdr = ndrOrders;


  return (
    <div className="space-y-6 animate-in fade-in duration-700">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 pb-6 border-b border-[#eceae4]">
        <div className="flex items-center gap-1.5 p-1 bg-[#eceae4]/40 rounded-xl border border-[#eceae4] w-fit">
          <button 
            onClick={() => setViewMode('audit')}
            className={cn(
              "px-8 py-2 rounded-lg text-[10px] font-black uppercase tracking-[0.15em] transition-all",
              viewMode === 'audit' ? "bg-[#1c1c1c] text-white shadow-sm" : "text-[#5f5f5d] hover:text-[#1c1c1c]"
            )}
          >
            Audit Queue
          </button>
          <button 
            onClick={() => setViewMode('ndr')}
            className={cn(
              "px-8 py-2 rounded-lg text-[10px] font-black uppercase tracking-[0.15em] transition-all",
              viewMode === 'ndr' ? "bg-[#1c1c1c] text-white shadow-sm" : "text-[#5f5f5d] hover:text-[#1c1c1c]"
            )}
          >
            NDR Command
          </button>
        </div>

        <div className="flex items-center gap-4">
          <div className="relative group">
            <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-[#5f5f5d]/40 group-focus-within:text-[#1c1c1c] transition-colors" />
            <input 
              type="text" 
              placeholder={viewMode === 'audit' ? "Search customer or agent..." : "Search Order, AWB..."}
              className="pl-12 pr-6 py-3 text-[12px] font-bold border-[#eceae4] rounded-xl focus:ring-4 focus:ring-[#1c1c1c]/5 focus:border-[#1c1c1c] bg-[#f7f4ed] w-full lg:w-80 shadow-sm transition-all placeholder:text-[#5f5f5d]/40"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="flex flex-col items-end gap-1 mr-2">
            <span className="text-[8px] font-black text-[#5f5f5d]/40 uppercase tracking-[0.2em]">Live Pulse</span>
            <span className="text-[10px] font-bold text-[#5f5f5d] tabular-nums">
              {mounted ? lastUpdated : "--:--:--"}
            </span>
          </div>
          <button 
            onClick={() => viewMode === 'audit' ? fetchTasks() : fetchNdrOrders()} 
            className="w-12 h-12 bg-[#f7f4ed] border border-[#eceae4] rounded-xl flex items-center justify-center hover:bg-[#eceae4]/20 transition-all shadow-sm text-[#5f5f5d] hover:text-[#1c1c1c] active:scale-95 group/refresh"
            title="Refresh"
          >
            <History className={cn("w-5 h-5 transition-transform duration-500 group-active/refresh:rotate-180", loading && "animate-spin")} />
          </button>
        </div>
      </div>

        {viewMode === 'audit' ? (
          <>
            <div className="flex flex-wrap items-center gap-3 bg-[#eceae4]/40 p-2 rounded-xl border border-[#eceae4]">
              <button 
                onClick={() => setUzmaOnly(!uzmaOnly)}
                className={cn(
                  "px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all border",
                  uzmaOnly ? "bg-[#1c1c1c] text-[#f7f4ed] border-[#1c1c1c]" : "bg-[#f7f4ed] text-[#5f5f5d]/60 border-[#eceae4] hover:border-[#1c1c1c]/40"
                )}
              >
                Uzma&rsquo;s Work Only
              </button>
<CheckCircle className="w-3.5 h-3.5 text-[#5f5f5d]/40" />
              <div className="flex items-center gap-2 px-3 py-1.5 bg-[#f7f4ed] rounded-lg border border-[#eceae4]">
                <User className="w-3.5 h-3.5 text-[#5f5f5d]/40" />
                <select 
                  className="bg-transparent border-none text-[10px] font-black uppercase tracking-tight focus:ring-0 py-0 cursor-pointer text-[#1c1c1c]"
                  value={agentFilter}
                  onChange={(e) => setAgentFilter(e.target.value)}
                >
                  <option value="all">All Agents</option>
                  {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>

              <div className="flex items-center gap-2 px-3 py-1.5 bg-[#f7f4ed] rounded-lg border border-[#eceae4]">
                <Filter className="w-3.5 h-3.5 text-[#5f5f5d]/40" />
                <select 
                  className="bg-transparent border-none text-[10px] font-black uppercase tracking-tight focus:ring-0 py-0 cursor-pointer text-[#1c1c1c]"
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                >
                  <option value="all">All Types</option>
                  <option value="ndr">NDR Interaction</option>
                  <option value="issue_resolution">Issue Resolution</option>
                  <option value="transit_update">Transit Update</option>
                  <option value="recovery">Abandoned Cart</option>
                  <option value="review">Order Review</option>
                  <option value="fulfillment">Fulfillment</option>
                </select>
              </div>

              <div className="flex items-center gap-2 px-3 py-1.5 bg-[#f7f4ed] rounded-lg border border-[#eceae4]">
                <CheckCircle className="w-3.5 h-3.5 text-[#5f5f5d]/40" />
                <select 
                  className="bg-transparent border-none text-[10px] font-black uppercase tracking-tight focus:ring-0 py-0 cursor-pointer text-[#1c1c1c]"
                  value={outcomeFilter}
                  onChange={(e) => setOutcomeFilter(e.target.value)}
                >
                  <option value="all">All Outcomes</option>
                  <option value="done">Successful / Resolved</option>
                  <option value="no_answer">No Answer</option>
                  <option value="rescheduled">Rescheduled</option>
                </select>
              </div>

              {(agentFilter !== 'all' || uzmaOnly || typeFilter !== 'all' || outcomeFilter !== 'all' || searchTerm) && (
                <button 
                  onClick={() => {
                    setAgentFilter('all');
                    setUzmaOnly(false);
                    setTypeFilter('all');
                    setOutcomeFilter('all');
                    setSearchTerm('');
                  }}
                  className="text-[10px] font-black text-rose-500 uppercase tracking-widest hover:underline px-2"
                >
                  Reset Filters
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              <div className="lg:col-span-7 space-y-4">
                {loading ? (
                  <div className="flex flex-col items-center justify-center py-20 text-gray-400 gap-4">
                    <Loader2 className="w-8 h-8 animate-spin" />
                    <p className="text-xs font-bold uppercase tracking-widest">Loading audit queue...</p>
                  </div>
                ) : filteredTasks.length === 0 ? (
                  <div className="card p-24 flex flex-col items-center justify-center text-center bg-[#f7f4ed] border-dashed border-2 border-[#eceae4] rounded-2xl overflow-hidden relative group">
                    <div className="absolute inset-0 bg-[#eceae4]/20 opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
                    <div className="relative z-10 flex flex-col items-center">
                      <div className="w-20 h-20 bg-[#eceae4] rounded-full flex items-center justify-center mb-6 shadow-sm animate-bounce-subtle">
                        <CheckCircle className="w-10 h-10 text-[#1c1c1c]/40" />
                      </div>
                      <h3 className="text-xl font-black text-[#1c1c1c] uppercase tracking-tighter mb-2">Workspace Optimized</h3>
                      <p className="text-xs text-[#5f5f5d] font-bold max-w-[240px] leading-relaxed uppercase tracking-widest opacity-60">
                        Zero pending resolutions. Your administrative oversight is complete.
                      </p>
                    </div>
                  </div>
                ) : (
                  paginatedTasks.map((t) => (
                    <div 
                      key={t.id}
                      onClick={() => setSelectedTask(t)}
                      className={cn(
                        "card p-5 cursor-pointer transition-all group relative overflow-hidden",
                        selectedTask?.id === t.id ? "border-[#1c1c1c] bg-[#eceae4]/60 ring-1 ring-[#1c1c1c]/10" : "bg-[#f7f4ed] border-transparent"
                      )}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-500">
                            {t.customer?.name?.charAt(0) || "C"}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className="text-sm font-black text-[#1c1c1c]">{t.customer?.name}</h4>
                              <TaskTypeBadge type={t.task_type} />
                            </div>
                            <div className="flex items-center gap-3 mt-1">
                              <span className="flex items-center gap-1 text-[10px] font-bold text-gray-400">
                                <User className="w-3 h-3" />
                                {t.assigned_profile?.name || "Unknown Agent"}
                              </span>
                              <span className="w-1 h-1 bg-gray-200 rounded-full" />
                              <span className="flex items-center gap-1 text-[10px] font-bold text-gray-400">
                                <Clock className="w-3 h-3" />
                                Completed {timeAgo(t.completed_at)}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className="badge bg-[#f7f4ed] border-[#eceae4] text-[10px] font-black text-[#5f5f5d] uppercase tracking-tight">
                            {t.call_logs?.[0]?.outcome?.replace(/_/g, ' ') || "RESOLVED"}
                          </span>
                          <p className="text-[10px] font-bold text-emerald-600 mt-1 uppercase tracking-tighter">
                            {t.call_logs?.[0]?.disposition?.replace(/_/g, ' ') || "No Disposition"}
                          </p>
                        </div>
                      </div>
                      
                      {/* Agent Note Snippet */}
                      <div className="mt-4 p-3 bg-[#eceae4]/40 rounded-xl border border-[#eceae4] group-hover:bg-[#f7f4ed] transition-all">
                        <p className="text-[11px] font-medium text-[#5f5f5d] leading-relaxed line-clamp-2 italic">
                          &ldquo;{t.call_logs?.[0]?.note || "No comments provided by agent."}&rdquo;
                        </p>
                      </div>
                      
                      <div className="mt-4 pt-4 border-t border-[#eceae4]/60 flex items-center justify-between">
                        <div className="flex items-center gap-2 text-[10px] font-bold text-[#5f5f5d]/60">
                          <ShoppingBag className="w-3 h-3" />
                          {getTaskProductName(t)}
                          <span className="w-1 h-1 bg-[#eceae4] rounded-full" />
                          <span className="text-[#1c1c1c]">₹{(Array.isArray(t.order) ? t.order[0] : t.order)?.total_price || (Array.isArray(t.abandoned_cart) ? t.abandoned_cart[0] : t.abandoned_cart)?.total_price || 0}</span>
                        </div>
                        
                        <div className="flex items-center gap-2">
                           {(t.task_type === 'ndr' || t.order || t.order_id) && (
                              <button 
                                onClick={(e) => { e.stopPropagation(); setSelectedTask(t); setShowNDRModal(true); }}
                                className="flex items-center gap-1.5 px-3 py-1 bg-amber-50 text-amber-600 rounded-lg text-[9px] font-black uppercase tracking-widest hover:bg-amber-600 hover:text-white transition-all"
                              >
                                <Zap className="w-3 h-3" /> Resolve NDR
                              </button>
                           )}
                           <ArrowRight className="w-4 h-4 text-gray-300 opacity-0 group-hover:opacity-100 transition-all -translate-x-2 group-hover:translate-x-0" />
                        </div>
                      </div>
                    </div>
                  ))
                )}
                <Pagination current={currentPage} total={totalTasksCount} pageSize={ITEMS_PER_PAGE} onChange={setCurrentPage} />
              </div>

              <div className="lg:col-span-5">
                <div className="sticky top-6">
                  <div className="card bg-[#f7f4ed] border-[#eceae4] shadow-2xl overflow-hidden min-h-[650px] flex flex-col rounded-2xl">
                    <div className="p-4 border-b border-[#eceae4] bg-[#eceae4]/20 flex items-center justify-between">
                      <h3 className="text-[11px] font-black text-[#1c1c1c] uppercase tracking-widest flex items-center gap-2">
                        <Eye className="w-3.5 h-3.5" />
                        Audit Inspector
                      </h3>
                      {selectedTask && (
                        <button 
                          onClick={() => setShowOrderModal(true)}
                          className="w-8 h-8 rounded-lg hover:bg-[#f7f4ed] flex items-center justify-center text-[#5f5f5d] hover:text-[#1c1c1c] transition-all shadow-sm border border-transparent hover:border-[#eceae4]"
                        >
                          <History className="w-4 h-4" />
                        </button>
                      )}
                    </div>

                    {selectedTask ? (
                      <div className="flex-1 flex flex-col min-h-0">
                        <div className="flex-1 overflow-y-auto p-6 animate-in fade-in slide-in-from-right-4 duration-500">
                          <div className="space-y-6">
                            <div className="p-4 bg-[#f7f4ed] border border-[#eceae4] rounded-xl shadow-sm space-y-3">
                              <h4 className="text-[10px] font-black text-[#5f5f5d]/60 uppercase tracking-widest flex items-center gap-2">
                                <User className="w-3 h-3" /> Customer Intelligence
                              </h4>
                              <div className="space-y-2">
                                <div>
                                  <a 
                                    href={`/customers/${selectedTask.customer?.id}`}
                                    target="_blank"
                                    className="text-sm font-bold text-[#1c1c1c] block hover:underline"
                                  >
                                    {selectedTask.customer?.name}
                                  </a>
                                  <a 
                                    href={`tel:${selectedTask.customer?.phone}`}
                                    className="text-xs font-bold text-[#5f5f5d] block hover:text-[#1c1c1c] transition-colors"
                                  >
                                    {selectedTask.customer?.phone}
                                  </a>
                                  <p className="text-[10px] font-black text-[#5f5f5d]/40 uppercase tracking-[0.2em] mt-1">{selectedTask.customer?.city || "Unknown City"}, {selectedTask.customer?.state || "Unknown State"}</p>
                                </div>
                              </div>
                            </div>

                            <div className="p-5 bg-amber-50 rounded-xl border border-amber-100 space-y-4 relative overflow-hidden">
                              <div className="absolute top-0 right-0 p-3 opacity-10">
                                <MessageSquare className="w-12 h-12" />
                              </div>
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center text-amber-600 font-bold text-[10px]">
                                  {selectedTask.assigned_profile?.name?.charAt(0) || "U"}
                                </div>
                                <div>
                                  <p className="text-[9px] font-black text-amber-600 uppercase tracking-[0.2em] mb-0.5 opacity-40">Agent Verdict</p>
                                  <p className="text-xs font-black text-[#1c1c1c] uppercase tracking-tight">
                                    {selectedTask.call_logs?.[0]?.outcome?.replace(/_/g, ' ') || "DONE"}
                                    <span className="mx-2 text-[#5f5f5d]/20">/</span>
                                    <span className="text-amber-600">{selectedTask.call_logs?.[0]?.disposition?.replace(/_/g, ' ') || "No Disposition"}</span>
                                  </p>
                                </div>
                              </div>
                              <div>
                                <p className="text-[9px] font-black text-amber-600 uppercase tracking-[0.2em] mb-1.5 opacity-40">Internal Disposition Note</p>
                                <div className="bg-[#f7f4ed] p-4 rounded-xl border border-amber-100 shadow-sm">
                                  <p className="text-[11px] font-medium text-[#1c1c1c] italic leading-relaxed">
                                    &ldquo;{selectedTask.call_logs?.[0]?.note || "No notes provided by agent."}&rdquo;
                                  </p>
                                </div>
                              </div>
                            </div>

                            <div className="space-y-2">
                              <div className="flex items-center justify-between">
                                <p className="text-[9px] font-black text-[#5f5f5d]/40 uppercase tracking-[0.2em]">Manager Review Notes</p>
                                <span className="text-[9px] font-bold text-[#5f5f5d]/30 italic">Visible to agent if rejected</span>
                              </div>
                              <textarea 
                                className="w-full h-32 bg-[#f7f4ed] border-[#eceae4] rounded-xl p-4 text-xs font-bold focus:ring-[#1c1c1c] placeholder:text-[#5f5f5d]/30 shadow-inner"
                                placeholder="Add feedback or specific instructions for the agent..."
                                value={reviewNote}
                                onChange={(e) => setReviewNote(e.target.value)}
                              />
                            </div>
                          </div>
                        </div>

                        <div className="p-6 pt-4 border-t border-[#eceae4] bg-[#eceae4]/20 space-y-3">
                          <div className="flex flex-col xl:flex-row gap-3">
                            <button 
                              onClick={() => handleProcess(selectedTask.id, 'rejected')}
                              disabled={!!processing}
                              className="flex-1 flex items-center justify-center gap-2 py-3 bg-[#f7f4ed] border border-rose-100 text-rose-500 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-rose-50 transition-all active:scale-[0.98] disabled:opacity-50 shadow-sm"
                            >
                              <AlertCircle className="w-3.5 h-3.5" />
                              Flag Revision
                            </button>
                            <button 
                              onClick={() => handleProcess(selectedTask.id, 'approved')}
                              disabled={!!processing}
                              className="flex-1 flex items-center justify-center gap-2 py-3 bg-[#1c1c1c] text-[#f7f4ed] rounded-xl text-[10px] font-black uppercase tracking-widest hover:opacity-90 transition-all shadow-xl active:scale-[0.98] disabled:opacity-50"
                              style={{ boxShadow: "rgba(255,255,255,0.2) 0px 0.5px 0px 0px inset, rgba(0,0,0,0.2) 0px 0px 0px 0.5px inset, rgba(0,0,0,0.05) 0px 1px 2px 0px" }}
                            >
                              {processing === selectedTask.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                              Approve Resolution
                            </button>
                          </div>
                          
                          {(selectedTask.task_type === 'ndr' || selectedTask.order || selectedTask.order_id) && (
                            <button 
                              onClick={() => setShowNDRModal(true)}
                              className="w-full flex items-center justify-center gap-2 py-3 bg-amber-500 text-[#f7f4ed] rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-amber-600 transition-all active:scale-[0.98] shadow-lg shadow-amber-100"
                            >
                              <Zap className="w-3.5 h-3.5 fill-current" />
                              Trigger Shiprocket Action
                            </button>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="flex-1 flex flex-col items-center justify-center text-center p-10 opacity-30 grayscale">
                        <div className="w-20 h-20 bg-[#eceae4]/40 border-2 border-dashed border-[#eceae4] rounded-full flex items-center justify-center mb-4">
                          <Info className="w-8 h-8 text-[#5f5f5d]/40" />
                        </div>
                        <h3 className="text-xs font-black text-[#1c1c1c] uppercase tracking-widest">Inspector Idle</h3>
                        <p className="text-[10px] font-bold text-[#5f5f5d] mt-2 leading-relaxed opacity-60">Select a task from the queue to start auditing.</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
          <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500 pb-20">
            <div className="grid grid-cols-1 gap-4">
              {loading ? (
                <div className="py-20 text-center bg-[#f7f4ed] rounded-2xl border border-[#eceae4]">
                  <Loader2 className="w-8 h-8 animate-spin mx-auto text-[#5f5f5d]/20 mb-3" />
                  <span className="text-xs font-black text-[#5f5f5d]/40 uppercase tracking-[0.2em]">Syncing Logistics Intelligence...</span>
                </div>
              ) : filteredNdr.length === 0 ? (
                <div className="py-20 text-center bg-[#f7f4ed] rounded-2xl border border-[#eceae4] opacity-50">
                  <Package className="w-12 h-12 mx-auto text-[#5f5f5d]/20 mb-4" />
                  <p className="text-sm font-black uppercase tracking-widest text-[#5f5f5d]/40">No active NDR exceptions</p>
                </div>
              ) : (
                paginatedNdr.map((order) => {
                  const meta = (Array.isArray(order.line_items) ? order.line_items.find((i: any) => i.__metadata) : null)?.payload || {};
                  const status = order.delivery_status?.toLowerCase();
                  const isCritical = status === 'rto' || status === 'failed';
                  
                  return (
                    <div key={order.id} className="bg-[#f7f4ed] rounded-2xl border border-[#eceae4] p-6 group overflow-hidden relative">
                      {isCritical && <div className="absolute top-0 left-0 w-1 h-full bg-rose-500" />}
                      
                      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
                        {/* Order Identity */}
                        <div className="lg:col-span-3 space-y-3">
                           <div className="flex items-center gap-3">
                              <div className={cn(
                                "w-10 h-10 rounded-2xl flex items-center justify-center shadow-sm border",
                                isCritical ? "bg-rose-50 border-rose-100 text-rose-500" : "bg-emerald-50 border-emerald-100 text-emerald-500"
                              )}>
                                 <Truck className="w-5 h-5" />
                              </div>
                              <div>
                                 <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none mb-1">
                                    {order.courier_name || "Unknown Courier"}
                                 </div>
                                 <div className="text-base font-black text-[#1c1c1c] tracking-tight">
                                    #{order.order_number}
                                 </div>
                              </div>
                           </div>
                           <div className="flex items-center gap-2 text-[10px] font-bold text-[#5f5f5d]/60 bg-[#eceae4]/40 px-3 py-1.5 rounded-lg w-fit">
                              <Calendar className="w-3 h-3" />
                              {formatDate(order.ordered_at)}
                           </div>
                        </div>

                        {/* Customer Intelligence */}
                        <div className="lg:col-span-3">
                           <div className="flex items-center gap-3 mb-2">
                              <Avatar name={order.customer?.name} size="sm" />
                              <div>
                                 <a 
                                   href={`/customers/${order.customer?.id}`}
                                   target="_blank"
                                   className="text-[13px] font-black text-[#1c1c1c] hover:underline block leading-tight"
                                 >
                                   {order.customer?.name}
                                 </a>
                                 <a 
                                   href={`tel:${order.customer?.phone}`}
                                   className="text-[10px] font-bold text-gray-400 hover:text-[#1c1c1c] block mt-0.5"
                                 >
                                   {order.customer?.phone}
                                 </a>
                              </div>
                           </div>
                           <p className="text-[10px] font-black text-gray-400 uppercase tracking-tighter truncate">
                              {order.customer?.city}, {order.customer?.state}
                           </p>
                        </div>

                        {/* Shipment Telemetry */}
                        <div className="lg:col-span-3 space-y-3">
                           <div>
                              <p className="text-[9px] font-black text-[#5f5f5d]/40 uppercase tracking-widest mb-1">Tracking (AWB)</p>
                              <div className="flex items-center gap-2">
                                 <span className="text-[12px] font-black text-[#1c1c1c] tabular-nums bg-[#eceae4]/40 px-2 py-0.5 rounded-lg border border-[#eceae4]">
                                    {order.tracking_number || "AWB PENDING"}
                                 </span>
                              </div>
                           </div>
                           <div className="flex items-center gap-4">
                              <div className="flex flex-col">
                                 <span className="text-[8px] font-black text-[#5f5f5d]/40 uppercase tracking-widest">Status</span>
                                 <span className={cn(
                                   "text-[10px] font-black uppercase tracking-widest mt-0.5",
                                   isCritical ? "text-rose-600" : "text-amber-600"
                                 )}>
                                   {order.delivery_status}
                                 </span>
                              </div>
                              <div className="w-[1px] h-6 bg-[#eceae4]" />
                              <div className="flex flex-col">
                                 <span className="text-[8px] font-black text-[#5f5f5d]/40 uppercase tracking-widest">Last Reason</span>
                                 <span className="text-[10px] font-bold text-[#5f5f5d]/60 mt-0.5 line-clamp-1 max-w-[120px]">
                                   {meta.latest_status || meta.status || "Check Logistics Logs"}
                                 </span>
                              </div>
                           </div>
                        </div>

                        {/* Action Command */}
                        <div className="lg:col-span-3 flex flex-col gap-2">
                           <button 
                             onClick={() => {
                               setNdrOrderForModal(order);
                               setShowNDRModal(true);
                             }}
                             className="w-full py-3 bg-[#1c1c1c] text-[#f7f4ed] text-[10px] font-black uppercase tracking-[0.2em] rounded-xl hover:opacity-90 transition-all shadow-xl active:scale-95 flex items-center justify-center gap-2"
                             style={{ boxShadow: "rgba(255,255,255,0.2) 0px 0.5px 0px 0px inset, rgba(0,0,0,0.2) 0px 0px 0px 0.5px inset, rgba(0,0,0,0.05) 0px 1px 2px 0px" }}
                           >
                             <Zap className="w-4 h-4 fill-current" />
                             Resolve NDR
                           </button>
                           <button 
                             onClick={() => {
                               setSelectedTask({ order: [order], customer: order.customer });
                               setShowOrderModal(true);
                             }}
                             className="w-full py-2.5 bg-[#f7f4ed] border border-[#eceae4] text-[#5f5f5d] text-[9px] font-black uppercase tracking-widest rounded-xl hover:bg-[#eceae4]/20 transition-all flex items-center justify-center gap-2"
                           >
                             <Eye className="w-3.5 h-3.5" />
                             View Timeline
                           </button>
                        </div>
                      </div>

                      {/* Detail Ribbon (Hidden by default, expands on hover or just visible for context) */}
                      <div className="mt-4 pt-4 border-t border-[#eceae4]/60 flex items-center justify-between">
                         <div className="flex items-center gap-3">
                            <span className="flex items-center gap-1.5 text-[9px] font-black text-[#5f5f5d]/60 uppercase bg-[#eceae4]/40 px-2 py-1 rounded-lg">
                               <ShoppingBag className="w-3 h-3" />
                               {order.line_items?.length || 1} Products
                            </span>
                            <span className="text-[10px] font-black text-emerald-600">
                               ₹{order.total_price || 0}
                            </span>
                         </div>
                         <div className="flex items-center gap-2">
                            <span className="text-[9px] font-black text-rose-400 uppercase tracking-widest">
                               {order.rto_risk ? "⚠️ HIGH RTO RISK" : "Standard Priority"}
                            </span>
                         </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
            <Pagination current={currentPage} total={totalNdrCount} pageSize={ITEMS_PER_PAGE} onChange={setCurrentPage} />
          </div>
          </div>
        )}

      <Modal 
        open={showOrderModal} 
        onClose={() => setShowOrderModal(false)}
        title={
          selectedTask && (
            <div className="flex items-center gap-3">
              <span className="uppercase tracking-widest text-[10px] font-black opacity-50">Audit View</span>
              <span className="w-1 h-1 bg-[#eceae4] rounded-full" />
              <span className="font-black text-[#1c1c1c]">
                {selectedTask.task_type === 'recovery' ? 'Abandoned Cart' : `Order #${(Array.isArray(selectedTask.order) ? selectedTask.order[0] : selectedTask.order)?.order_number || '???'}`}
              </span>
              <span className="px-2 py-0.5 bg-[#eceae4] rounded text-[9px] font-bold text-[#5f5f5d] uppercase tracking-tighter flex gap-2">
                <a href={`/customers/${selectedTask.customer?.id}`} target="_blank" className="hover:text-[#1c1c1c] hover:underline">
                  {selectedTask.customer?.name}
                </a>
                <span>•</span>
                <a href={`tel:${selectedTask.customer?.phone}`} className="hover:text-[#1c1c1c]">
                  {selectedTask.customer?.phone}
                </a>
              </span>
            </div>
          )
        }
        maxWidth="max-w-6xl"
      >
        <div className="bg-[#f7f4ed] -m-5 -mt-4 rounded-xl overflow-hidden min-h-[70vh]">
          {(() => {
            if (!selectedTask) return null;
            const order = Array.isArray(selectedTask.order) ? selectedTask.order[0] : selectedTask.order;
            const cart = Array.isArray(selectedTask.abandoned_cart) ? selectedTask.abandoned_cart[0] : selectedTask.abandoned_cart;
            
            if (order || selectedTask.order_id) {
              return (
                <ShiprocketOrderView 
                  orderId={order?.order_number || order?.shopify_order_id || selectedTask.order_id} 
                />
              );
            }

            return (
              <div className="p-12 space-y-8 animate-in fade-in duration-500">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-[#eceae4] text-[#1c1c1c]/40 rounded-2xl flex items-center justify-center shadow-sm">
                      <History className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="text-xl font-black text-[#1c1c1c]">Abandoned Cart Audit</h3>
                      <p className="text-xs font-bold text-[#5f5f5d]/40 uppercase tracking-widest leading-relaxed">Recovery Interaction Details</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-black text-[#1c1c1c]">₹{cart?.total_price || 0}</div>
                    <div className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest bg-emerald-50 px-2 py-0.5 rounded-full inline-block">Cart Total</div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="card p-6 bg-[#f7f4ed] border-[#eceae4] shadow-sm space-y-4">
                    <h4 className="text-[10px] font-black text-[#5f5f5d]/40 uppercase tracking-[0.2em] mb-4">Customer Intelligence</h4>
                    <div className="space-y-3">
                      <div>
                        <p className="text-[9px] font-black text-[#5f5f5d]/40 uppercase tracking-widest mb-0.5">Name</p>
                        <a 
                          href={`/customers/${selectedTask.customer?.id}`}
                          target="_blank"
                          className="text-sm font-bold text-[#1c1c1c] block hover:underline"
                        >
                          {selectedTask.customer?.name}
                        </a>
                      </div>
                      <div>
                        <p className="text-[9px] font-black text-[#5f5f5d]/40 uppercase tracking-widest mb-0.5">Phone</p>
                        <a 
                          href={`tel:${selectedTask.customer?.phone}`}
                          className="text-xs font-bold text-[#5f5f5d] block hover:text-[#1c1c1c] transition-colors"
                        >
                          {selectedTask.customer?.phone}
                        </a>
                        <p className="text-[10px] font-bold text-[#5f5f5d]/40 uppercase tracking-widest">{selectedTask.customer?.city || "Unknown City"}, {selectedTask.customer?.state || "Unknown State"}</p>
                      </div>
                    </div>
                  </div>

                  <div className="card p-6 bg-[#f7f4ed] border-[#eceae4] shadow-sm space-y-4">
                    <h4 className="text-[10px] font-black text-[#5f5f5d]/40 uppercase tracking-[0.2em] mb-4">Cart Items</h4>
                    <div className="space-y-4">
                      {((cart?.line_items as any[])?.filter(i => !i.__metadata) || []).map((item, idx) => (
                        <div key={idx} className="flex items-center justify-between gap-4 border-b border-[#eceae4] pb-3 last:border-0">
                          <div>
                            <p className="text-xs font-black text-[#1c1c1c]">{item.name || item.title}</p>
                            <p className="text-[9px] font-bold text-[#5f5f5d]/40 uppercase">{item.variant || "Default Variant"}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs font-black text-[#1c1c1c]">₹{item.price}</p>
                            <p className="text-[9px] font-bold text-[#5f5f5d]/40">Qty: {item.quantity}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="card p-6 bg-[#1c1c1c] text-[#f7f4ed] border-none shadow-xl space-y-2">
                  <h4 className="text-[10px] font-black text-[#f7f4ed]/40 uppercase tracking-[0.2em]">Agent Resolution Note</h4>
                  <p className="text-sm leading-relaxed font-medium italic">&ldquo;{selectedTask.call_logs?.[0]?.note || "No notes provided by agent."}&rdquo;</p>
                </div>
              </div>
            );
          })()}
        </div>
      </Modal>

      {(viewMode === 'audit' ? selectedTask : ndrOrderForModal) && (
        <NDRActionModal 
          open={showNDRModal}
          onClose={() => {
            setShowNDRModal(false);
            setNdrOrderForModal(null);
          }}
          shipmentId={(() => {
            const ord = viewMode === 'audit' ? (Array.isArray(selectedTask.order) ? selectedTask.order[0] : selectedTask.order) : ndrOrderForModal;
            const meta = (Array.isArray(ord?.line_items) ? ord.line_items.find((i: any) => i.__metadata) : null)?.payload || {};
            return String(meta.shipment_id || ord?.tracking_number || ord?.awb_code || ord?.shopify_order_id || ord?.id || "");
          })()}
          awb={(() => {
            const ord = viewMode === 'audit' ? (Array.isArray(selectedTask.order) ? selectedTask.order[0] : selectedTask.order) : ndrOrderForModal;
            return ord?.tracking_number || ord?.awb_code || "";
          })()}
          shiprocketOrderId={(() => {
            const ord = viewMode === 'audit' ? (Array.isArray(selectedTask.order) ? selectedTask.order[0] : selectedTask.order) : ndrOrderForModal;
            const meta = (Array.isArray(ord?.line_items) ? ord.line_items.find((i: any) => i.__metadata) : null)?.payload || {};
            return meta.order_id || meta.shiprocket_order_id || (String(ord?.shopify_order_id).match(/^\d+$/) ? ord?.shopify_order_id : null) || ord?.id;
          })()}
          orderNumber={(() => {
            const ord = viewMode === 'audit' ? (Array.isArray(selectedTask.order) ? selectedTask.order[0] : selectedTask.order) : ndrOrderForModal;
            return ord?.order_number || ord?.shopify_order_id || '???';
          })()}
          onSuccess={() => {
            if (viewMode === 'audit') handleProcess(selectedTask.id, 'shiprocket_updated');
            else fetchNdrOrders();
          }}
        />
      )}
    </div>
  );
}
