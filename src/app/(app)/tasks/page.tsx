"use client";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
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
import { PageHeader, EmptyState, TaskTypeBadge, Pagination } from "@/components/ui";
import TaskCard from "@/components/TaskCard";
import { createClient } from "@/lib/supabase";
import { sendAdminNotification } from "@/lib/notifications";
import { cn, toDbDateString } from "@/lib/utils";
import type { Task, Customer, Order, TaskType, TaskStatus } from "@/types";
import toast from "react-hot-toast";
import { logAuditEvent } from "@/lib/audit";

const TYPES: { label: string; value: string }[] = [
  { label: "All Types", value: "all" },
  { label: "Recovery", value: "recovery" },
  { label: "Welcome Call", value: "welcome_call" },
  { label: "VIP / Whale", value: "vip_followup" },
  { label: "Win-back", value: "win_back" },
  { label: "COD Verify", value: "cod_verify" },
  { label: "NDR / Issue", value: "ndr" },
  { label: "Review", value: "review" },
  { label: "Reorder", value: "reorder" },
  { label: "Flagged", value: "flagged" },
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
  { label: "Flagged", value: "flagged" },
];

import { useCurrentProfile } from "@/hooks/useCurrentProfile";

export default function TasksPage() {
  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState<(Task & { customer: Customer; order: Order })[]>([]);
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [counts, setCounts] = useState({ due: 0, overdue: 0, pending: 0, done: 0, flagged: 0 });
  const [waSettings, setWaSettings] = useState<any>(null);
  const [syncing, setSyncing] = useState(false);
  const [agents, setAgents] = useState<{ id: string; name: string }[]>([]);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [showFilters, setShowFilters] = useState(true);
  const [dueStart, setDueStart] = useState("");
  const [dueEnd, setDueEnd] = useState("");
  const [agentFilter, setAgentFilter] = useState("all");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkReassignTo, setBulkReassignTo] = useState("");
  const [bulkActing, setBulkActing] = useState(false);
  const [onCallByTaskId, setOnCallByTaskId] = useState<Record<string, string>>({});
  const PAGE_SIZE = 20;
  const { profile, loading: profileLoading } = useCurrentProfile();
  // useCurrentProfile hands back a new profile object on every auth token
  // refresh, and live_state (the shift timer etc.) genuinely changes on
  // every heartbeat - so `profile` churns constantly even when the fields
  // that actually affect this page's query (id/role/segments/types) haven't
  // moved. Depending on this stable key instead of `profile` itself keeps
  // fetchTasks (and its mount effect) from tearing down and re-fetching on
  // every heartbeat, which used to silently close whatever task card was open.
  const profileKey = useMemo(() => (
    profile ? JSON.stringify({ id: profile.id, role: profile.role, segs: profile.assigned_segments, types: profile.assigned_task_types }) : null
  ), [profile]);
  const requestIdRef = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  const scrollTabs = (direction: "left" | "right") => {
    if (scrollRef.current) {
      const scrollAmount = 300;
      scrollRef.current.scrollBy({
        left: direction === "left" ? -scrollAmount : scrollAmount,
        behavior: "smooth"
      });
    }
  };


  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    // Read URL parameters on mount to support incoming links from Dashboard KPI cards or Chat threads
    const params = new URLSearchParams(window.location.search);
    const initialStatus = params.get("status");
    const initialType = params.get("type");
    const initialId = params.get("id");
    
    if (initialId) {
      setSearch(initialId);
      return;
    }
    if (initialStatus && STATUSES.some(s => s.value === initialStatus)) {
      setStatusFilter(initialStatus);
      return; 
    }
    if (initialType && TYPES.some(t => t.value === initialType)) {
      setTypeFilter(initialType);
      return;
    }
  }, []); // Only run once on mount
  
  // 1. Debounce Search
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search);
    }, 500);
    return () => clearTimeout(handler);
  }, [search]);

  // 2. Reset Page on Filter Change
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, typeFilter, statusFilter, agentFilter, dueStart, dueEnd]);

  // Helper to apply specialization filters
  const applyAgentFilters = useCallback((query: any, prof: any) => {
    if (prof?.role !== 'agent') return query;
    
    const segs = prof.assigned_segments || [];
    const types = prof.assigned_task_types || [];
    
    // Strict Logic: Agent MUST match specialization to see ANY task
    // AND it must be either assigned to them or unassigned
    let filteredQuery = query.or(`assigned_to.eq.${prof.id},assigned_to.is.null`);

    if (segs.length > 0) {
      filteredQuery = filteredQuery.filter('customer.segment', 'in', `(${segs.join(",")})`);
    }
    if (types.length > 0) {
      filteredQuery = filteredQuery.in('task_type', types);
    }
    
    return filteredQuery;
  }, []);

  const fetchTasks = useCallback(async (silent = false) => {
    const requestId = ++requestIdRef.current;
    if (!profile) return; // Security boundary: must have a profile
    
    // Check for Demo Mode
    const isDemo = document.cookie.includes("crm-demo-mode=true");
    if (isDemo) {
      if (!silent) setLoading(true);
      const { MOCK_TASKS } = await import("@/lib/mockData");
      
      // Apply search and paging to mock data for consistent UX
      let filtered = [...MOCK_TASKS];
      if (debouncedSearch) {
        const s = debouncedSearch.toLowerCase();
        filtered = filtered.filter(t => 
          t.customer?.name?.toLowerCase().includes(s) || 
          t.customer?.phone?.includes(s) ||
          t.order_id?.toLowerCase().includes(s)
        );
      }
      
      setTotalCount(filtered.length);
      setTasks(filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE) as any);
      setCounts({ due: 1, overdue: 0, pending: 1, done: 12, flagged: 0 });
      setLoading(false);
      return;
    }

    if (!silent) setLoading(true);
    const todayDate = new Date();
    const today = toDbDateString(todayDate);
    
    // Staleness Thresholds
    const thirtyDaysAgoDate = new Date();
    thirtyDaysAgoDate.setDate(todayDate.getDate() - 30);
    const thirtyDaysAgo = toDbDateString(thirtyDaysAgoDate);

    const fourDaysAgoDate = new Date();
    fourDaysAgoDate.setDate(todayDate.getDate() - 4);
    const fourDaysAgo = toDbDateString(fourDaysAgoDate);

    const fourteenDaysAgoDate = new Date();
    fourteenDaysAgoDate.setDate(todayDate.getDate() - 14);
    const fourteenDaysAgo = toDbDateString(fourteenDaysAgoDate);
    let matchingCustomerIds: string[] | null = null;
    let matchingOrderIds: string[] | null = null;
    let matchingCartIds: string[] | null = null;

    if (debouncedSearch) {
      const cleanSearch = debouncedSearch.trim().replace(/^#/, "");
      const isPhone = /^\d{7,15}$/.test(cleanSearch.replace(/\s/g, ""));

      // Parallelize lookups for massive performance gains
      const [customersRes, ordersRes, cartsRes] = await Promise.all([
        supabase.from("customers")
          .select("id")
          .or(`name.ilike.%${cleanSearch}%,phone.ilike.%${cleanSearch}%,shopify_customer_id.ilike.%${cleanSearch}%,email.ilike.%${cleanSearch}%`)
          .limit(100),
        supabase.from("orders")
          .select("id")
          .or(`order_number.ilike.%${cleanSearch}%,shopify_order_id.ilike.%${cleanSearch}%,tracking_number.ilike.%${cleanSearch}%`),
        supabase.from("abandoned_carts")
          .select("id")
          .or(`cart_token.ilike.%${cleanSearch}%,phone.ilike.%${cleanSearch}%`)
      ]);

      matchingCustomerIds = (customersRes.data || []).map((c) => c.id);
      matchingOrderIds = (ordersRes.data || []).map((o) => o.id);
      matchingCartIds = (cartsRes.data || []).map((c) => c.id);

      if (matchingCustomerIds.length === 0 && matchingOrderIds.length === 0 && matchingCartIds.length === 0) {
        setTasks([]);
        setCounts({ due: 0, overdue: 0, pending: 0, done: 0, flagged: 0 });
        setLoading(false);
        return;
      }
    }
    
    // Core Tasks Query
    let query = supabase
      .from("tasks")
      .select("*, customer:customers!inner(*), order:orders(*), abandoned_cart:abandoned_carts(*), assigned_profile:profiles!tasks_assigned_to_fkey(id,name,email,live_state)", { count: "exact" });

    if (debouncedSearch) {
      const cleanSearch = debouncedSearch.trim().replace(/^#/, "");
      let orStrings = [];
      if (matchingCustomerIds && matchingCustomerIds.length > 0) orStrings.push(`customer_id.in.(${matchingCustomerIds.join(",")})`);
      if (matchingOrderIds && matchingOrderIds.length > 0) orStrings.push(`order_id.in.(${matchingOrderIds.join(",")})`);
      if (matchingCartIds && matchingCartIds.length > 0) orStrings.push(`abandoned_cart_id.in.(${matchingCartIds.join(",")})`);
      
      // Support direct Task ID search (UUID)
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanSearch)) {
        orStrings.push(`id.eq.${cleanSearch}`);
      }
      
      if (orStrings.length > 0) {
        query = query.or(orStrings.join(","));
      }
    }

    // Core Filters
    if (profile.role === "agent") {
      query = applyAgentFilters(query, profile);
    }

    if (typeFilter === "flagged") {
      query = query.eq("manager_action", "rejected");
    } else if (typeFilter !== "all") {
      query = query.eq("task_type", typeFilter);
    }

    if (agentFilter === "unassigned") {
      query = query.is("assigned_to", null);
    } else if (agentFilter !== "all") {
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
      query = query.eq("due_date", today).not("status", "in", '("done","cancelled","skipped")');
    } else if (statusFilter === "overdue") {
      query = query.lt("due_date", today).gte("due_date", fourDaysAgo).not("status", "in", '("done","cancelled","skipped")');
      // Additional safety for recovery:
      query = query.or(`task_type.neq.recovery,due_date.gte.${fourteenDaysAgo}`);
    } else if (statusFilter === "pending") {
      query = query.gt("due_date", today).not("status", "in", '("done","cancelled","skipped")');
    } else if (statusFilter === "flagged") {
      query = query.eq("manager_action", "rejected");
    } else if (statusFilter !== "all") {
      query = query.eq("status", statusFilter);
    } else {
      // Default "All" view: Still apply staleness guard to prevent ghost tasks from months ago
      query = query.gte("due_date", thirtyDaysAgo);
    }

    // Redundant filter removed to fix OR logic with search term

    const { data: tasksData, count: totalMatching } = await query
      .order("priority_score", { ascending: false })
      .order("due_date", { ascending: true })
      .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

    setTotalCount(totalMatching || 0);

    // Accurate Stats Engine
    const statsQuery = (status: string) => {
      let q = supabase.from("tasks").select("*, customer:customers!inner(id, segment)", { count: "exact", head: true });
      if (profile.role === "agent") q = applyAgentFilters(q, profile);
      
      // Apply search filters to stats if active
      if (debouncedSearch) {
        let orStrings = [];
        if (matchingCustomerIds && matchingCustomerIds.length > 0) orStrings.push(`customer_id.in.(${matchingCustomerIds.join(",")})`);
        if (matchingOrderIds && matchingOrderIds.length > 0) orStrings.push(`order_id.in.(${matchingOrderIds.join(",")})`);
        if (matchingCartIds && matchingCartIds.length > 0) orStrings.push(`abandoned_cart_id.in.(${matchingCartIds.join(",")})`);
        if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(debouncedSearch.trim().replace(/^#/, ""))) {
          orStrings.push(`id.eq.${debouncedSearch.trim().replace(/^#/, "")}`);
        }
        if (orStrings.length > 0) q = q.or(orStrings.join(","));
      }

      if (status === "done") return q.eq("status", "done");
      if (status === "overdue") return q.lt("due_date", today).gte("due_date", fourDaysAgo).not("status", "in", '("done","cancelled","skipped")');
      if (status === "due") return q.eq("due_date", today).not("status", "in", '("done","cancelled","skipped")');
      if (status === "pending") return q.gt("due_date", today).not("status", "in", '("done","cancelled","skipped")');
      // Global Staleness for generic counts
      return q.gte("due_date", thirtyDaysAgo);
    };

    const [dueRes, overdueRes, pendingRes, doneRes, flaggedRes] = await Promise.all([
      statsQuery("due"),
      statsQuery("overdue"),
      statsQuery("pending"),
      statsQuery("done"),
      (() => {
          let q = supabase.from("tasks").select("id", { count: "exact", head: true }).eq("manager_action", "rejected");
          if (profile.role === "agent") q = applyAgentFilters(q, profile);
          if (debouncedSearch) {
              let orStrings = [];
              if (matchingCustomerIds && matchingCustomerIds.length > 0) orStrings.push(`customer_id.in.(${matchingCustomerIds.join(",")})`);
              if (matchingOrderIds && matchingOrderIds.length > 0) orStrings.push(`order_id.in.(${matchingOrderIds.join(",")})`);
              if (matchingCartIds && matchingCartIds.length > 0) orStrings.push(`abandoned_cart_id.in.(${matchingCartIds.join(",")})`);
              if (orStrings.length > 0) q = q.or(orStrings.join(","));
          }
          return q;
      })()
    ]);

    const c = { 
      due: dueRes.count || 0, 
      overdue: overdueRes.count || 0, 
      pending: pendingRes.count || 0, 
      done: doneRes.count || 0,
      flagged: flaggedRes.count || 0
    };

    // settings itself is admin-only RLS (it holds API secrets) - this view
    // exposes only the WhatsApp template text TaskCard actually needs.
    const { data: ws } = await supabase.from("settings_public").select("*").eq("id", "00000000-0000-0000-0000-000000000000").maybeSingle();
    setWaSettings(ws);

    // --- SENTINEL: Auto-Heal Stale Tasks on Sight ---
    const rawTasks = (tasksData || []) as any[];
    const healedTasks = rawTasks.filter(task => {
      const isLogisticsTask = ["issue_resolution", "transit_update"].includes(task.task_type);
      const isDelivered = task.order && ["delivered", "Delivered"].includes(task.order.delivery_status);
      
      const dueDate = new Date(task.due_date);
      const now = new Date();
      const ageInDays = (now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24);
      const isStale = (task.task_type === "recovery" && ageInDays > 14) || ageInDays > 30;

      if (isStale && ["pending", "rescheduled"].includes(task.status)) {
        // Silently cancel stale ghost tasks
        supabase.from("tasks").update({ status: "cancelled" } as any).eq("id", task.id).then(() => {
            supabase.from("call_logs").insert({
                task_id: task.id,
                customer_id: task.customer_id,
                outcome: "skipped",
                note: `Auto-Archived: Task exceeded ${task.task_type === 'recovery' ? '14' : '30'}-day staleness threshold.`,
                agent_name: "System Sentinel",
                called_at: new Date().toISOString()
            });
        });
        return false;
      }

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

    if (requestId !== requestIdRef.current) return; // Stale request protection
    setTasks(healedTasks);
    setCounts(c);
    setLoading(false);
    // profileKey, not profile: see the comment on profileKey above.
  }, [profileKey, debouncedSearch, typeFilter, agentFilter, dueStart, dueEnd, statusFilter, page, supabase, applyAgentFilters]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (profileLoading) return; // Wait for the security profile to establish identity before fetching tasks
    
    if (profile?.role === "admin" || profile?.role === "manager") {
      supabase.from("profiles")
        .select("id, name")
        .eq("role", "agent") // Strictly Agents for assignment
        .eq("is_active", true)
        .not("email", "ilike", "%demo%")
        .not("name", "ilike", "%demo%")
        .or('is_demo.is.null,is_demo.eq.false')
        .then(({ data }) => {
          if (data) setAgents(data);
        });
    }

    let refreshTimeout: NodeJS.Timeout;
    const debouncedRefresh = () => {
      // Sentinel: Prevent jarring refreshes if agent is currently typing or has a modal open
      const isInteracting = document.activeElement?.tagName === 'INPUT' || 
                           document.activeElement?.tagName === 'TEXTAREA' ||
                           document.querySelector('[role="dialog"]'); // Modal check
      
      if (isInteracting) return;

      clearTimeout(refreshTimeout);
      refreshTimeout = setTimeout(() => fetchTasks(true), 3000);
    };

    fetchTasks();
    const pollInterval = setInterval(() => debouncedRefresh(), 60000);

    // ── Supabase real-time: refresh on any task mutation ──
    const channel = supabase
      .channel("tasks-live")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "tasks" }, debouncedRefresh)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "tasks" }, debouncedRefresh)
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "tasks" }, debouncedRefresh)
      .subscribe();

    return () => {
      if (typeof pollInterval !== "undefined") clearInterval(pollInterval);
      clearTimeout(refreshTimeout);
      supabase.removeChannel(channel);
    };
    // profileKey, not profile: see the comment on profileKey above.
  }, [profileKey, profileLoading, fetchTasks, supabase]); // eslint-disable-line react-hooks/exhaustive-deps

  // Selection references this page's rows only - clear it whenever the
  // page or filters change so a stale id from a previous view can't be
  // silently carried into a bulk action on a different set of tasks.
  useEffect(() => {
    setSelectedIds([]);
  }, [page, typeFilter, statusFilter, agentFilter, debouncedSearch, dueStart, dueEnd]);

  // Collision warning: two agents could call the same customer at once
  // with no signal either way. /api/calls/webhook (see that route) already
  // sets profiles.live_state = {action: "on_call", entityId: task_id} the
  // moment a real call starts and clears it when the call ends - this
  // reuses that existing signal instead of building new presence infra.
  // A ~20s poll is plenty fresh for a courtesy heads-up; not wired to
  // realtime to avoid subscribing to the whole (high-churn) profiles table.
  useEffect(() => {
    if (profileLoading) return;
    let active = true;
    async function fetchOnCall() {
      const { data } = await supabase.from("profiles").select("id, name, live_state").not("live_state", "is", null);
      if (!active) return;
      const map: Record<string, string> = {};
      (data || []).forEach((p: any) => {
        if (p.id === profile?.id) return; // don't warn agents about their own call
        if (p.live_state?.action === "on_call" && p.live_state?.entityId) {
          map[p.live_state.entityId] = p.name || "Another agent";
        }
      });
      setOnCallByTaskId(map);
    }
    fetchOnCall();
    const interval = setInterval(fetchOnCall, 20000);
    return () => { active = false; clearInterval(interval); };
  }, [profileLoading, profile?.id, supabase]);

  const canBulkManage = profile?.role === "admin" || profile?.role === "manager";

  function toggleSelected(id: string) {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  function toggleSelectAll() {
    setSelectedIds(prev => prev.length === tasks.length ? [] : tasks.map(t => t.id));
  }

  async function handleBulkCancel() {
    if (selectedIds.length === 0 || !canBulkManage) return;
    const isDemo = document.cookie.includes("crm-demo-mode=true");
    if (isDemo) {
      toast.success(`Demo: Cancelled ${selectedIds.length} tasks (local only)`);
      setTasks(prev => prev.filter(t => !selectedIds.includes(t.id)));
      setSelectedIds([]);
      return;
    }
    setBulkActing(true);
    const { error } = await supabase.from("tasks").update({ status: "cancelled" } as any).in("id", selectedIds);
    setBulkActing(false);
    if (error) return toast.error("Bulk cancel failed");
    await logAuditEvent({ entityType: "task", entityId: selectedIds.join(","), action: "bulk_cancel", summary: `Bulk-cancelled ${selectedIds.length} tasks`, metadata: { ids: selectedIds } });
    toast.success(`Cancelled ${selectedIds.length} tasks`);
    setSelectedIds([]);
    fetchTasks(true);
  }

  async function handleBulkReassign() {
    if (selectedIds.length === 0 || !bulkReassignTo || !canBulkManage) return;
    const isDemo = document.cookie.includes("crm-demo-mode=true");
    if (isDemo) {
      toast.success(`Demo: Reassigned ${selectedIds.length} tasks (local only)`);
      setTasks(prev => prev.map(t => selectedIds.includes(t.id) ? { ...t, assigned_to: bulkReassignTo } : t));
      setSelectedIds([]);
      setBulkReassignTo("");
      return;
    }
    setBulkActing(true);
    const { error } = await supabase.from("tasks").update({ assigned_to: bulkReassignTo } as any).in("id", selectedIds);
    setBulkActing(false);
    if (error) return toast.error("Bulk reassign failed");
    await logAuditEvent({ entityType: "task", entityId: selectedIds.join(","), action: "bulk_reassign", summary: `Bulk-reassigned ${selectedIds.length} tasks`, metadata: { ids: selectedIds, newOwnerId: bulkReassignTo } });
    toast.success(`Reassigned ${selectedIds.length} tasks`);
    setSelectedIds([]);
    setBulkReassignTo("");
    fetchTasks(true);
  }

  async function handleReassign(id: string, newOwnerId: string) {
    if (!newOwnerId) return;
    const isDemo = document.cookie.includes("crm-demo-mode=true");
    if (isDemo) {
      toast.success("Demo: Task reassigned (local only)");
      setTasks(prev => prev.map(t => t.id === id ? { ...t, assigned_to: newOwnerId } : t));
      return;
    }
    if (profile?.role !== "admin" && profile?.role !== "manager") {
      return toast.error("Unauthorized: Only Admins/Managers can assign tasks.");
    }
    // Optimistic UI Update
    setTasks(prev => prev.map(t => t.id === id ? { ...t, assigned_to: newOwnerId } : t));

    const { error } = await supabase.from("tasks").update({ assigned_to: newOwnerId } as any).eq("id", id);
    if (error) {
      fetchTasks(true); // Revert on error
      return toast.error("Failed to reassign task");
    }
    
    // Optionally log audit event
    await logAuditEvent({
      entityType: "task",
      entityId: id,
      action: "reassign",
      summary: `Manually reassigned task to different agent`,
      metadata: { newOwnerId }
    });
    
    toast.success("Task formally reassigned!");
    fetchTasks(true);
  }

  async function handleComplete(id: string, outcome: string, note: string, disposition?: string, followUpAction?: string) {
    const isDemo = document.cookie.includes("crm-demo-mode=true");
    if (isDemo) {
      toast.success("Demo: Task marked as completed (local only)");
      setTasks(prev => prev.filter(t => t.id !== id));
      return;
    }
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
    if (!user) return toast.error("User session not found. Please log in again.");
    
    // 1. Call the Centralized API for Task Completion (Guarantees Audit & Sheet Sync)
    try {
      const res = await fetch(`/api/tasks/${id}/complete`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          outcome, 
          note, 
          agent_name: user.email,
          agent_email: user.email 
        })
      });
      if (!res.ok) throw new Error("API failed");
    } catch (err) {
      console.error("Tasks API sync failed:", err);
      // Fallback
      await supabase.from("tasks").update({ status: "done", completed_at: new Date().toISOString() }).eq("id", id);
    }

    const task = tasks.find(t => t.id === id);
    const customerName = task?.customer?.name || "Customer";
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

      // Log to Agent Activity for Live Pulse (Synced)
      if (user) {
        const { logActivity } = await import("@/lib/activity-logger");
        logActivity({
          agent_id: user.id,
          activity_type: "task_completed",
          description: `Completed ${task?.task_type || "task"} for ${customerName}`,
          metadata: {
              agent_email: user.email,
              task_id: id,
              task_type: task.task_type,
              customer_name: customerName,
              outcome: outcome,
              note: note, // Added note for Task_Resolutions sheet
              order_id: task.order_id,
              cart_id: task.abandoned_cart_id,
              // Full linked order value credited on completion - see the
              // same note in TaskCard.tsx's handleDone for the
              // double-counting tradeoff.
              revenue: task.order?.total_price || 0
          }
        });
      }
    }
    
    await logAuditEvent({
      entityType: "task",
      entityId: id,
      action: "complete",
      summary: `Completed ${task?.task_type || "task"}`,
      metadata: { outcome, disposition, followUpAction },
    });

    // 4. Notify Admin (NEW)
    const orderId = task?.order?.order_number || task?.order?.shopify_order_id || "N/A";
    const cartId = task?.abandoned_cart?.cart_token || "N/A";
    
    await sendAdminNotification(
        `✅ *Task Finished*\nAgent: ${profile?.email}\nTask: ${task?.task_type.toUpperCase()}\nCustomer: ${customerName}\nOrder: #${orderId}\nCart: #${cartId}`, 
        "info"
    );

    toast.success("Call logged & sent to Manager for Audit");
    fetchTasks(true);
  }

  async function handleReschedule(id: string, date: string, reason: string) {
    const isDemo = document.cookie.includes("crm-demo-mode=true");
    if (isDemo) {
      toast.success(`Demo: Task rescheduled to ${date} (local only)`);
      setTasks(prev => prev.map(t => t.id === id ? { ...t, due_date: date } : t));
      return;
    }
    try {
      const res = await fetch(`/api/tasks/${id}/reschedule`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ new_date: date, reason })
      });
      if (!res.ok) throw new Error("API failed");
    } catch (err) {
      await supabase.from("tasks").update({ status: "rescheduled", due_date: date, rescheduled_to: date } as any).eq("id", id);
    }

    const task = tasks.find(t => t.id === id);
    if (task) {
      await supabase.from("call_logs").insert({
        task_id: id,
        customer_id: task.customer_id,
        outcome: "rescheduled",
        disposition: "callback_requested",
        follow_up_action: reason || "Rescheduled",
        note: `Rescheduled to ${date}${reason ? `: ${reason}` : ""}`,
        agent_name: profile?.email || "Agent",
        called_at: new Date().toISOString()
      });

      // Log to Agent Activity for Live Pulse (Synced)
      if (profile?.id) {
        const { logActivity } = await import("@/lib/activity-logger");
        logActivity({
          agent_id: profile.id,
          activity_type: "task_rescheduled",
          description: `Rescheduled ${task?.task_type || "task"} to ${date}`,
          metadata: {
              agent_email: profile.email,
              task_id: id,
              task_type: task.task_type,
              customer_name: task.customer?.name,
              new_date: date,
              order_id: task.order_id,
              cart_id: task.abandoned_cart_id
          }
        });
      }
    }

    await logAuditEvent({
      entityType: "task",
      entityId: id,
      action: "reschedule",
      summary: `Rescheduled task to ${date}`,
      metadata: { reason },
    });
    toast.success("Task rescheduled");
    fetchTasks(true);
  }

  async function handleSkip(id: string) {
    const isDemo = document.cookie.includes("crm-demo-mode=true");
    if (isDemo) {
      toast.success("Demo: Task skipped (local only)");
      setTasks(prev => prev.filter(t => t.id !== id));
      return;
    }
    try {
      const res = await fetch(`/api/tasks/${id}/skip`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({})
      });
      if (!res.ok) throw new Error("API failed");
    } catch (err) {
      await supabase.from("tasks").update({ status: "skipped" } as any).eq("id", id);
    }

    const task = tasks.find(t => t.id === id);
    if (task) {
      await supabase.from("call_logs").insert({
        task_id: id,
        customer_id: task.customer_id,
        outcome: "skipped",
        disposition: "follow_up_later",
        follow_up_action: "Skipped",
        note: "Task skipped",
        agent_name: profile?.email || "Agent",
        called_at: new Date().toISOString()
      });

      // Log to Agent Activity for Live Pulse (Synced)
      if (profile?.id) {
        const { logActivity } = await import("@/lib/activity-logger");
        logActivity({
          agent_id: profile.id,
          activity_type: "task_skipped",
          description: `Skipped ${task?.task_type || "task"} for ${task.customer?.name}`,
          metadata: {
              agent_email: profile.email,
              task_id: id,
              task_type: task.task_type,
              customer_name: task.customer?.name,
              order_id: task.order_id,
              cart_id: task.abandoned_cart_id
          }
        });
      }
    }
    await logAuditEvent({
      entityType: "task",
      entityId: id,
      action: "skip",
      summary: "Skipped task",
    });
    toast.success("Task skipped");
    fetchTasks(true);
  }

  async function handleGlobalSync() {
    const isDemo = document.cookie.includes("crm-demo-mode=true");
    if (isDemo) {
      toast.success("Demo: Global system sync simulated!");
      return;
    }
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
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
      
      // Log this administrative action (Synced)
      if (user) {
        const { logActivity } = await import("@/lib/activity-logger");
        logActivity({
          agent_id: user.id,
          activity_type: "manual_sync",
          description: `Triggered global system sync: ${data.report?.logs?.processed || 0} logs processed.`,
          metadata: {
            agent_email: user.email,
            sync_report: data.report
          }
        });
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
      <PageHeader title="All Tasks" subtitle={`${totalCount} tasks matching filters`} 
        actions={
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button 
              onClick={() => setShowFilters(!showFilters)}
              className={cn("btn-secondary flex-1 sm:flex-none flex items-center justify-center gap-1.5 py-1.5 px-3", showFilters && "bg-[#1c1c1c]/10 border-[#1c1c1c] text-[#1c1c1c]")}
            >
              <Filter className="w-3.5 h-3.5" />
              <span className="text-[10px] font-black uppercase tracking-widest">{showFilters ? "Hide" : "Filters"}</span>
            </button>

            <button 
              onClick={handleGlobalSync} 
              disabled={syncing}
              className={cn(
                "btn-secondary flex-1 sm:flex-none flex items-center justify-center gap-1.5 py-1.5 px-3",
                syncing && "opacity-50 cursor-not-allowed"
              )}
            >
              <RefreshCw className={cn("w-3.5 h-3.5", syncing && "animate-spin")} />
              <span className="text-[10px] font-black uppercase tracking-widest">{syncing ? "Syncing" : "Sync"}</span>
            </button>
          </div>
        }
      />

      {/* Advanced Filter Panel */}
      {showFilters && (
        <div className="card p-4 mb-5 border-[#1c1c1c]/10 animate-slide-down bg-white shadow-lg overflow-visible z-10">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">Due Date From</label>
              <input type="date" className="input text-xs" value={dueStart} onChange={e => setDueStart(e.target.value)} />
            </div>
            <div>
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">Due Date To</label>
              <input type="date" className="input text-xs" value={dueEnd} onChange={e => setDueEnd(e.target.value)} />
            </div>
            {(profile?.role === "admin" || profile?.role === "manager") && (
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">Assigned To</label>
                <select className="select text-xs" value={agentFilter} onChange={e => setAgentFilter(e.target.value)}>
                  <option value="all">All Agents</option>
                  <option value="unassigned">Unassigned Only</option>
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
              // Filters already apply live as each field changes (see the
              // fetchTasks dependency array above); this button had no
              // handler at all. Give it a real job: close the panel.
              onClick={() => setShowFilters(false)}
              className="btn-primary py-2 px-6 text-xs"
            >
              Apply Filters
            </button>
          </div>
        </div>
      )}


      {/* Filters */}
      <div className="flex flex-col lg:flex-row gap-3 mb-5 lg:items-center w-full">
        {/* Search */}
        <div className="relative w-full lg:w-64 flex-shrink-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input 
            type="text" 
            placeholder="Search name or phone..." 
            className="input pl-9 text-xs w-full" 
            value={search} 
            onChange={e => setSearch(e.target.value)} 
          />
        </div>
        
        {/* Scrollable Tabs Wrapper */}
        <div className="flex-1 min-w-0 w-full relative group bg-white rounded-lg border border-gray-200 flex items-center">
          
          {/* Left Scroll Trigger */}
          <button 
            onClick={() => scrollTabs("left")}
            className="absolute left-0 z-10 h-full px-1 bg-gradient-to-r from-white via-white to-transparent text-gray-400 hover:text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-auto"
            aria-label="Scroll left"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          {/* Scrollable Tabs */}
          <div 
            ref={scrollRef}
            className="flex items-center gap-1 p-1 overflow-x-auto scrollbar-hide flex-1 min-w-0 w-full [&::-webkit-scrollbar]:hidden scroll-smooth"
          >
            {TYPES.filter(t => {
              // assigned_task_types is an agent-only specialization concept
              // (see applyAgentFilters above, which only ever restricts by
              // it for role === 'agent'). This used to also gate managers/
              // HR, whose assigned_task_types is normally null/empty -
              // meaning almost every tab silently vanished for them even
              // though their actual task query was never restricted.
              if (profile?.role !== 'agent' || t.value === 'all' || t.value === 'flagged') return true;
              return profile?.assigned_task_types?.includes(t.value as any);
            }).map((t) => (
              <button
                key={t.value}
                onClick={() => setTypeFilter(t.value)}
                className={cn(
                  "px-4 py-2 rounded-lg text-[10px] font-bold whitespace-nowrap transition-all uppercase tracking-widest flex-shrink-0",
                  typeFilter === t.value
                    ? "bg-[#1c1c1c] text-white shadow-md shadow-black/10"
                    : "bg-transparent text-gray-500 hover:bg-gray-50 hover:text-gray-900"
                )}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Right Scroll Trigger */}
          <button 
            onClick={() => scrollTabs("right")}
            className="absolute right-0 z-10 h-full px-1 bg-gradient-to-l from-white via-white to-transparent text-gray-400 hover:text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-auto"
            aria-label="Scroll right"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
        
        {/* Statuses */}
        <div className="flex-shrink-0 w-full lg:w-auto">
          <select className="select w-full text-xs h-[38px] bg-white border-gray-200" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
      </div>

      {/* Summary badges */}
      <div className="flex gap-3 flex-wrap mb-4">
        {[
          { label: "Due Today", count: counts.due, color: "bg-amber-50 text-amber-700 border-amber-200" },
          { label: "Overdue", count: counts.overdue, color: "bg-rose-50 text-rose-700 border-rose-200" },
          { label: "Pending", count: counts.pending, color: "bg-[#eceae4] text-[#1c1c1c] border-[#eceae4]" },
          { label: "Flagged", count: (counts as any).flagged || 0, color: "bg-rose-50 text-rose-600 border-rose-100" },
          { label: "Done", count: counts.done, color: "bg-[#eceae4] text-[#1c1c1c] border-[#eceae4]" },
        ].map(s => (
          <div key={s.label} className={cn("px-3 py-1.5 rounded-lg border text-xs font-medium", s.color)}>
            {s.label}: <strong>{s.count}</strong>
          </div>
        ))}
      </div>

      {/* Task list */}
      {canBulkManage && tasks.length > 0 && (
        <label className="flex items-center gap-2 mb-2 text-[10px] font-bold uppercase tracking-widest text-[#5f5f5d] cursor-pointer w-fit">
          <input type="checkbox" className="checkbox w-3.5 h-3.5"
            checked={selectedIds.length === tasks.length && tasks.length > 0}
            onChange={toggleSelectAll} />
          Select all on this page
        </label>
      )}
      <div className="space-y-3">
        {loading ? (
          <div className="p-12 text-center text-gray-400 text-sm">Searching tasks...</div>
        ) : tasks.length === 0 ? (
          <EmptyState icon={<CheckSquare className="w-5 h-5" />} title="No tasks found" desc="Try adjusting your filters" />
        ) : (
          tasks.map(task => (
            <div key={task.id} className="flex items-start gap-2">
              {canBulkManage && (
                <input type="checkbox" className="checkbox w-3.5 h-3.5 mt-5 shrink-0"
                  checked={selectedIds.includes(task.id)}
                  onChange={() => toggleSelected(task.id)} />
              )}
              <div className="flex-1 min-w-0">
                {onCallByTaskId[task.id] && (
                  <div className="flex items-center gap-1.5 mb-1.5 px-2.5 py-1 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 text-[10px] font-bold w-fit">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                    {onCallByTaskId[task.id]} is on a call for this task right now
                  </div>
                )}
                <TaskCard task={task as any}
                  onComplete={handleComplete}
                  onReschedule={handleReschedule}
                  onSkip={handleSkip}
                  onWhatsApp={() => fetchTasks(true)}
                  whatsappSettings={waSettings}
                  isAdmin={profile?.role === "admin" || profile?.role === "manager"}
                  agents={agents}
                  onReassign={handleReassign}
                />
              </div>
            </div>
          ))
        )}
      </div>

      {/* Floating Bulk Action Bar - admin/manager only, mirrors the pattern
          already used on Customers and Orders pages. */}
      {canBulkManage && selectedIds.length > 0 && (
        <div className="fixed bottom-20 lg:bottom-6 left-1/2 -translate-x-1/2 z-40 animate-slide-up w-[calc(100%-2rem)] md:w-auto">
          <div className="bg-[#1c1c1c] text-white flex flex-wrap items-center gap-3 md:gap-4 px-4 md:px-6 py-3 rounded-2xl shadow-2xl min-w-0 md:min-w-[480px]">
            <div className="flex items-center gap-2 md:gap-3 border-r border-white/10 pr-3 md:pr-4">
              <div className="w-5 h-5 md:w-6 md:h-6 rounded-full bg-[#f7f4ed] text-[#1c1c1c] flex items-center justify-center text-[9px] md:text-[10px] font-bold">
                {selectedIds.length}
              </div>
              <span className="hidden xs:inline text-[9px] md:text-[10px] font-bold uppercase tracking-widest opacity-60">Selected</span>
            </div>

            <select
              className="bg-white/10 text-white text-[10px] font-bold rounded-lg px-2 py-1.5 outline-none border border-white/10"
              value={bulkReassignTo}
              onChange={e => setBulkReassignTo(e.target.value)}
              disabled={bulkActing}
            >
              <option value="">Reassign to...</option>
              {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <button
              onClick={handleBulkReassign}
              disabled={!bulkReassignTo || bulkActing}
              className="text-[10px] font-bold uppercase tracking-widest hover:text-[#eceae4] transition-colors disabled:opacity-30"
            >
              Apply
            </button>

            <button
              onClick={handleBulkCancel}
              disabled={bulkActing}
              className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-rose-400 hover:text-rose-300 transition-colors disabled:opacity-30"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Cancel Selected
            </button>

            <button onClick={() => setSelectedIds([])} className="ml-auto text-[10px] font-bold uppercase tracking-widest opacity-60 hover:opacity-100 transition-opacity">
              Clear
            </button>
          </div>
        </div>
      )}

      <Pagination 
        current={page} 
        total={totalCount} 
        pageSize={PAGE_SIZE} 
        onChange={(p) => { setPage(p); window.scrollTo(0, 0); }} 
      />
    </div>
  );
}
