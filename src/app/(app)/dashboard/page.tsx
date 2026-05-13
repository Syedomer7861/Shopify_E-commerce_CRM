"use client";
import { useState, useEffect } from "react";
import { AlertTriangle, Clock, CheckCircle2, TrendingUp, Phone, RefreshCw, Sun, Moon, ChevronLeft, ChevronRight } from "lucide-react";
import { StatCard, PageHeader, Avatar, Pagination } from "@/components/ui";
import TaskCard from "@/components/TaskCard";
import { AgentStats } from "@/components/AgentStats";
import { Leaderboard } from "@/components/Leaderboard";
import { createClient } from "@/lib/supabase";
import { SEGMENT_CONFIG, cn, timeAgo, toDbDateString } from "@/lib/utils";
import toast from "react-hot-toast";
import type { Task, Customer, Order, CallLog, AbandonedCart } from "@/types";
import { logAuditEvent } from "@/lib/audit";
import { sendAdminNotification } from "@/lib/notifications";
import AnnouncementFeed from "@/components/AnnouncementFeed";

export default function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<any>(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [todayTasks, setTodayTasks] = useState<(Task & { customer: Customer; order?: Order; abandoned_cart?: AbandonedCart })[]>([]);
  const [overdueTasks, setOverdueTasks] = useState<(Task & { customer: Customer; order?: Order; abandoned_cart?: AbandonedCart })[]>([]);
  const [upcomingTasks, setUpcomingTasks] = useState<(Task & { customer: Customer; order?: Order; abandoned_cart?: AbandonedCart })[]>([]);
  const [recentActivity, setRecentActivity] = useState<CallLog[]>([]);
  const [counts, setCounts] = useState({ today: 0, overdue: 0, upcoming: 0, doneThisWeek: 0 });
  const [escalations, setEscalations] = useState({ medium: 0, high: 0, critical: 0, issues: 0, shipping: 0 });
  const [webhookLogs, setWebhookLogs] = useState<{ id: string; topic: string; created_at: string; payload: any }[]>([]);
  const [waSettings, setWaSettings] = useState<any>(null);
  const [syncing, setSyncing] = useState(false);
  const [nextSyncIn, setNextSyncIn] = useState(900); // 15 mins in seconds
  const [agentMetrics, setAgentMetrics] = useState<any>(null);
  const [allAgentsMetrics, setAllAgentsMetrics] = useState<any[]>([]);
  const [trendData, setTrendData] = useState<any[]>([]);
  
  const [lastChecked, setLastChecked] = useState<Date>(new Date());
  const [agents, setAgents] = useState<{ id: string; name: string }[]>([]);
  const [stats, setStats] = useState({ activeNdr: 0 });
  const [recoveryRate, setRecoveryRate] = useState(0);
  
  const [todayPage, setTodayPage] = useState(1);
  const [overduePage, setOverduePage] = useState(1);
  const ITEMS_PER_PAGE = 10;
  
  const supabase = createClient();
  const [LivePulseFeed, setLivePulseFeed] = useState<any>(null);

  useEffect(() => {
    import("@/components/LivePulseFeed").then(m => setLivePulseFeed(() => m.default));
  }, []);

  const formatDuration = (ms: number) => {
    const seconds = Math.floor((ms / 1000) % 60);
    const minutes = Math.floor((ms / (1000 * 60)) % 60);
    const hours = Math.floor(ms / (1000 * 60 * 60));
    return [
      hours.toString().padStart(2, '0'),
      minutes.toString().padStart(2, '0'),
      seconds.toString().padStart(2, '0')
    ].join(':');
  };



  useEffect(() => {
    fetchDashboardData();
    const pollInterval = setInterval(() => debouncedRefresh(), 60000);
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    
    // HYBRID POLLING: Fallback poll every 60 seconds to ensure feed stays fresh
    const pollTimer = setInterval(() => {
      fetchDashboardData(true); // silent fetch
    }, 60000);

    let refreshTimeout: NodeJS.Timeout;
    const debouncedRefresh = () => {
      // Sentinel: Prevent refreshes during active user input or modal open
      const isInteracting = document.activeElement?.tagName === 'INPUT' || 
                           document.activeElement?.tagName === 'TEXTAREA' ||
                           document.querySelector('[role="dialog"]');
      if (isInteracting) return;

      clearTimeout(refreshTimeout);
      refreshTimeout = setTimeout(() => fetchDashboardData(true), 3000);
    };

    // REAL-TIME UPDATES: Listen for changes in tasks, orders, or logs
    

    // 15-MINUTE GLOBAL SYNC HEARTBEAT (New Requirement)
    const syncHeartbeat = setInterval(() => {
      console.log("[Heartbeat] Triggering 15-minute global sync...");
      handleGlobalSync(true); // Silent pulse
    }, 15 * 60 * 1000);

    // 1-SECOND COUNTDOWN TIMER
    const countdownTimer = setInterval(() => {
      setNextSyncIn(prev => {
        if (prev <= 1) return 900;
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (typeof pollInterval !== "undefined") clearInterval(pollInterval);
      clearInterval(timer);
      clearInterval(pollTimer);
      clearInterval(syncHeartbeat);
      clearInterval(countdownTimer);
      clearTimeout(refreshTimeout);
      
    };
  }, [todayPage, overduePage]);

  // Helper to apply specialization filters
  const applyAgentFilters = (query: any, prof: any) => {
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
  };

  async function fetchDashboardData(silent = false) {
    if (!silent) setLoading(true);
    setLastChecked(new Date());
    
    try {
      // 0. Fetch Profile Info (Optimized: use getSession() for speed)
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      let prof: any = profile;
      
      if (userId && (!prof || !silent)) {
        // Use a cached profile if possible, otherwise fetch
        const { data: profData } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
        prof = profData;
        setProfile(prof);

        if (prof?.role === "admin" && agents.length === 0) {
          const { data: agentsData } = await supabase.from("profiles").select("id, name").eq("role", "agent").eq("is_active", true);
          if (agentsData) setAgents(agentsData);
        }
      }
      
      if (!userId) return;

      const today = toDbDateString(new Date());
      
      // 1. Fetch Today's Tasks
      const queryToday = supabase
        .from("tasks")
        .select("*, customer:customers(*), order:orders(*), abandoned_cart:abandoned_carts(*), assigned_profile:profiles!tasks_assigned_to_fkey(id,name,email)", { count: "exact" })
        .eq("due_date", today)
        .in("status", ["pending", "due"])
        .order("priority_score", { ascending: false })
        .order("created_at", { ascending: false })
        .range((todayPage - 1) * ITEMS_PER_PAGE, todayPage * ITEMS_PER_PAGE - 1);

      const { data: todayData, count: todayCount } = await applyAgentFilters(queryToday, prof);
      
      // 2. Fetch Overdue Tasks
      const queryOverdue = supabase
        .from("tasks")
        .select("*, customer:customers(*), order:orders(*), abandoned_cart:abandoned_carts(*), assigned_profile:profiles!tasks_assigned_to_fkey(id,name,email)", { count: "exact" })
        .lt("due_date", today)
        .not("status", "in", '("done","skipped","cancelled")')
        .order("priority_score", { ascending: false })
        .order("due_date", { ascending: true })
        .range((overduePage - 1) * ITEMS_PER_PAGE, overduePage * ITEMS_PER_PAGE - 1);

      const { data: overdueData, count: overdueCount } = await applyAgentFilters(queryOverdue, prof);

      // 3. Fetch Upcoming Tasks (next 3 days)
      const threeDaysOut = new Date();
      threeDaysOut.setDate(threeDaysOut.getDate() + 3);
      const { data: upcomingData, count: upcomingCount } = await applyAgentFilters(
        supabase
          .from("tasks")
          .select("*, customer:customers(*), order:orders(*), abandoned_cart:abandoned_carts(*), assigned_profile:profiles!tasks_assigned_to_fkey(id,name,email)", { count: "exact" })
          .gt("due_date", today)
          .lte("due_date", toDbDateString(threeDaysOut))
          .eq("status", "pending")
          .order("priority_score", { ascending: false })
          .order("due_date", { ascending: true })
          .limit(50),
        prof
      );

      // 4. Recent Activity
      const { data: activityData } = await supabase
        .from("call_logs")
        .select("*, customer:customers(*)")
        .order("called_at", { ascending: false })
        .limit(5);

      // 5. Done This Week count
      const startOfWeek = new Date();
      startOfWeek.setDate(startOfWeek.getDate() - 7);
      const startOfWeekISO = startOfWeek.toISOString();
      let queryDone = supabase
        .from("tasks")
        .select("id", { count: "exact", head: true })
        .eq("status", "done")
        .gte("updated_at", startOfWeekISO);
      
      if (prof?.role === "agent") queryDone = queryDone.eq("assigned_to", prof.id);
      const { count: doneCount } = await queryDone;
      
      // 6. WhatsApp Settings
      const { data: ws } = await supabase.from("settings").select("*").eq("id", "00000000-0000-0000-0000-000000000000").maybeSingle();
      setWaSettings(ws);

      // 7. Recent Webhook Logs (The "Pulse")
      let logsData = [];
      try {
        const res = await fetch("/api/webhooks/recent");
        if (res.ok) {
          const json = await res.json();
          if (json.success) logsData = json.logs;
        }
      } catch(e) {}


      setTodayTasks((todayData || []) as any);
      setOverdueTasks((overdueData || []) as any);
      setUpcomingTasks((upcomingData || []) as any);
      setRecentActivity((activityData || []) as any);
      setWebhookLogs((logsData || []) as any);
      setCounts({
        today: todayCount || 0,
        overdue: overdueCount || 0,
        upcoming: upcomingCount || 0,
        doneThisWeek: doneCount || 0
      });
      // 7.5 Exact Escalation Counts (High Fidelity)
      const dayMs = 86400000;
      const nowTs = Date.now();
      
      const medDate = toDbDateString(new Date(nowTs - 1 * dayMs));
      const highDate = toDbDateString(new Date(nowTs - 3 * dayMs));
      const critDate = toDbDateString(new Date(nowTs - 7 * dayMs));

      const [
        { count: medCount },
        { count: highCount },
        { count: critCount },
        { count: issueCount },
        { count: shipCount },
        { count: ndrCount },
        { count: totalCarts },
        { count: recoveredCarts }
      ] = await Promise.all([
        supabase.from("tasks").select("id", { count: "exact", head: true }).lte("due_date", medDate).not("status", "in", '("done","skipped","cancelled")'),
        supabase.from("tasks").select("id", { count: "exact", head: true }).lte("due_date", highDate).not("status", "in", '("done","skipped","cancelled")'),
        supabase.from("tasks").select("id", { count: "exact", head: true }).lte("due_date", critDate).not("status", "in", '("done","skipped","cancelled")'),
        supabase.from("tasks").select("id", { count: "exact", head: true }).eq("task_type", "issue_resolution").not("status", "in", '("done","skipped","cancelled")'),
        supabase.from("tasks").select("id", { count: "exact", head: true }).eq("task_type", "transit_update").not("status", "in", '("done","skipped","cancelled")'),
        supabase.from("orders").select("id", { count: "exact", head: true }).in("delivery_status", ["rto", "failed", "ndr"]),
        supabase.from("abandoned_carts").select("id", { count: "exact", head: true }),
        supabase.from("abandoned_carts").select("id", { count: "exact", head: true }).eq("recovery_status", "recovered")
      ]);

      setStats({ activeNdr: ndrCount || 0 });
      setRecoveryRate(totalCarts ? Math.round(((recoveredCarts || 0) / totalCarts) * 100) : 0);

      setEscalations({
        medium: medCount || 0,
        high: highCount || 0,
        critical: critCount || 0,
        issues: issueCount || 0,
        shipping: shipCount || 0,
      });
      // 8. Fetch Agent Productivity (NEW)
      try {
        const res = await fetch(`/api/dashboard/agent${userId ? `?agentId=${userId}` : ""}`);
        if (res.ok) {
          const json = await res.json();
          const metrics = json.metrics?.[0] || null;
          // Sync current status with profile if needed
          if (metrics && prof && prof.id === metrics.agent_id) {
            metrics.current_status = prof.status || metrics.current_status;
          }
          setAgentMetrics(metrics);
          setTrendData(json.trends || []);
        }
        
        // Also fetch all agents if admin for leaderboard
        const allRes = await fetch(`/api/dashboard/agent`);
        if (allRes.ok) {
          const allJson = await allRes.json();
          setAllAgentsMetrics(allJson.metrics || []);
        }
      } catch (e) {}
    } catch (err) {
      console.error("Dashboard fetch error:", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleGlobalSync(silent = false) {
    setSyncing(true);
    let toastId = "global-sync";
    
    try {
      if (!silent) toast.loading("Starting Global CRM Sync...", { id: toastId });

      // Step 1: Main Global Sync (Orders, Tasks, Self-Heal) with Streaming
      const res = await fetch("/api/sync/all?stream=true", { method: "POST" });
      
      if (!res.ok) throw new Error("Sync API returned error status");
      if (!res.body) throw new Error("No response body from sync API");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let done = false;

      while (!done) {
        const { value, done: doneReading } = await reader.read();
        done = doneReading;
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        // Handle potential multiple JSON objects in one chunk (split by newlines if necessary, 
        // though our createSyncStream usually sends them clean)
        const lines = chunk.split('\n').filter(Boolean);
        
        for (const line of lines) {
          try {
            // Strip SSE prefix if present
            const jsonString = line.startsWith("data: ") ? line.slice(6) : line;
            const data = JSON.parse(jsonString);
            
            if (data.message && !silent) {
              toast.loading(`${data.message}`, { id: toastId });
            }
            if (data.error && !silent) {
              toast.error(`Sync Error: ${data.error}`, { id: toastId });
            }
            if (data.progress === 100) {
              if (!silent) toast.success(`Sync Complete: ${data.logs?.processed || 0} logs, ${data.tasks?.generated || 0} tasks`, { id: toastId });
              // Refresh UI as soon as we know it's done
              await fetchDashboardData(true);
            }
          } catch (e) {
            console.error("Failed to parse sync stream chunk:", e);
          }
        }
      }

      // Step 2: Auto-unmask (Non-blocking background task)
      if (profile?.role === "admin") {
        fetch("/api/sync/unmask", { method: "POST" }).then(async (unmaskRes) => {
          try {
            const unmaskData = await unmaskRes.json();
            if (!silent && unmaskData.success && unmaskData.unmaskedCount > 0) {
              toast.success(`🔓 Background: Unmasked ${unmaskData.unmaskedCount} contacts`);
            }
          } catch (e) {}
        }).catch(() => {});
      }
    } catch (err: any) {
      console.error("Global Sync Error:", err);
      if (!silent) toast.error(err.message || "Failed to sync system", { id: toastId });
    } finally {
      setSyncing(false);
    }
  }

  async function handleReassign(id: string, newOwnerId: string) {
    if (!newOwnerId) return;
    const { error } = await supabase.from("tasks").update({ assigned_to: newOwnerId } as any).eq("id", id);
    if (error) return toast.error("Failed to reassign task");
    
    await logAuditEvent({
      entityType: "task",
      entityId: id,
      action: "reassign",
      summary: `Manually reassigned task to different agent from Dashboard`,
      metadata: { newOwnerId }
    });
    
    toast.success("Task reassigned!");
    fetchDashboardData(true);
  }

  async function handleComplete(id: string, outcome: string, note: string, disposition?: string, followUpAction?: string) {
    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id;
    const userEmail = session?.user?.email;
    
    // 1. Call the Centralized API for Task Completion (Guarantees Audit & Sheet Sync)
    try {
      const res = await fetch(`/api/tasks/${id}/complete`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          outcome, 
          note, 
          agent_name: userEmail,
          agent_email: userEmail 
        })
      });
      if (!res.ok) throw new Error("API call failed");
    } catch (err) {
      console.error("Dashboard API sync failed:", err);
      // Fallback for UI continuity (minimal log)
      await supabase.from("tasks").update({ status: "done", completed_at: new Date().toISOString() }).eq("id", id);
    }

    const task = [...todayTasks, ...overdueTasks].find(t => t.id === id);
    const customerName = task?.customer?.name || "Customer";

    // 2. Special handling: If recovery task is done, mark the cart as recovered
    if (task?.task_type === "recovery" && outcome === "done" && task.abandoned_cart_id) {
        await supabase.from("abandoned_carts").update({ recovery_status: "recovered" }).eq("id", task.abandoned_cart_id);
    }

    // 3. Log to Local Agent Activity for immediate UI feedback (if needed)
    if (userId) {
      const { logActivity } = await import("@/lib/activity-logger");
      await logActivity({
        agent_id: userId,
        activity_type: "task_completed",
        description: `Completed ${task?.task_type || "task"} for ${customerName}`,
        metadata: {
          agent_email: userEmail,
          task_id: id,
          task_type: task?.task_type,
          outcome: outcome
        }
      });
    }

    await logAuditEvent({
      entityType: "task",
      entityId: id,
      action: "complete",
      summary: `Completed ${task?.task_type || "task"} for ${customerName}`,
      metadata: { outcome, disposition, followUpAction },
    });

    // 4. Notify Admin
    if (userId) {
      const orderId = task?.order?.order_number || task?.order?.shopify_order_id || "N/A";
      await sendAdminNotification(
          `✅ *Dashboard Complete*\nAgent: ${userEmail}\nTask: ${task?.task_type.toUpperCase()}\nCustomer: ${customerName}\nOrder: #${orderId}`, 
          "info"
      );
    }

    toast.success("Call logged successfully");
    fetchDashboardData(true); // Silent Refresh
  }

  async function handleReschedule(id: string, date: string, reason: string) {
    const { data: { session } } = await supabase.auth.getSession();
    const userEmail = session?.user?.email;
    try {
      const res = await fetch(`/api/tasks/${id}/reschedule`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ new_date: date, reason })
      });
      if (!res.ok) throw new Error("API failed");
    } catch (err) {
      await supabase
        .from("tasks")
        .update({ status: "rescheduled", due_date: date, rescheduled_to: date } as any)
        .eq("id", id);
    }

    const task = [...todayTasks, ...overdueTasks].find(t => t.id === id);
    if (task) {
      await supabase.from("call_logs").insert({
        task_id: id,
        customer_id: task.customer_id,
        outcome: "rescheduled",
        disposition: "callback_requested",
        follow_up_action: reason || "Rescheduled",
        note: `Rescheduled to ${date}${reason ? `: ${reason}` : ""}`,
        agent_name: userEmail || "Agent",
        called_at: new Date().toISOString()
      });
    }
    
    if (profile?.id) {
      const { logActivity } = await import("@/lib/activity-logger");
      logActivity({
        agent_id: profile.id,
        activity_type: "task_rescheduled",
        description: `Rescheduled ${task?.task_type || "task"} to ${date}`,
        metadata: {
          agent_email: profile.email,
          task_id: id,
          task_type: task?.task_type,
          customer_name: task?.customer?.name,
          new_date: date,
          reason: reason
        }
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
    fetchDashboardData();
  }

  async function handleSkip(id: string) {
    const { data: { session } } = await supabase.auth.getSession();
    const userEmail = session?.user?.email;
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

    const task = [...todayTasks, ...overdueTasks].find(t => t.id === id);
    if (task) {
      await supabase.from("call_logs").insert({
        task_id: id,
        customer_id: task.customer_id,
        outcome: "skipped",
        disposition: "follow_up_later",
        follow_up_action: "Skipped",
        note: "Task skipped",
        agent_name: userEmail || "Agent",
        called_at: new Date().toISOString()
      });
    }
    if (profile?.id) {
      const { logActivity } = await import("@/lib/activity-logger");
      logActivity({
        agent_id: profile.id,
        activity_type: "task_skipped",
        description: `Skipped ${task?.task_type || "task"} for ${task?.customer?.name || "customer"}`,
        metadata: {
          agent_email: profile.email,
          task_id: id,
          task_type: task?.task_type,
          customer_name: task?.customer?.name
        }
      });
    }

    await logAuditEvent({
      entityType: "task",
      entityId: id,
      action: "skip",
      summary: "Skipped task",
    });
    toast.success("Task skipped");
    fetchDashboardData();
  }


  if (loading && !syncing) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="flex flex-col items-center gap-3">
          <RefreshCw className="w-8 h-8 text-[#1c1c1c] animate-spin" />
          <p className="text-sm text-gray-500 font-medium">Syncing with CRM...</p>
        </div>
      </div>
    );
  }

  const hour = new Date().getHours();
  let greeting = "Good evening";
  let Icon = Moon;
  let iconClass = "text-[#1c1c1c] animate-float";

  if (hour < 12) {
    greeting = "Good morning";
    Icon = Sun;
    iconClass = "text-[#1c1c1c] animate-spin-slow";
  } else if (hour < 17) {
    greeting = "Good afternoon";
    Icon = Sun;
    iconClass = "text-[#1c1c1c] animate-pulse-slow";
  }

  const lastWebhook = webhookLogs[0];

  return (
    <div className="animate-fade-in">
      <PageHeader
        title={
          <div className="flex items-center gap-3">
            <span>{greeting}, {profile?.name?.split(' ')[0]}</span>
            <Icon className={cn("w-8 h-8", iconClass)} />
          </div>
        }
        subtitle={
          <div className="flex items-center gap-2 mt-1">
            <span className="text-gray-500 font-medium">Today is {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}</span>
            <span className="text-gray-300">|</span>
            <div className="flex items-center gap-1.5 text-[#1c1c1c] font-bold bg-[#1c1c1c]/5 px-2.5 py-1 rounded-lg border border-[#1c1c1c]/10">
              <Clock className="w-3.5 h-3.5" />
              <span>{currentTime.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true })}</span>
            </div>
          </div>
        }
        actions={
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 mt-0.5 mr-3">
              <div className="w-1.5 h-1.5 rounded-full bg-[#1c1c1c] animate-pulse" />
              <span className="text-[#5f5f5d] text-[9px] uppercase font-bold tracking-widest opacity-60">
                Pulse: {Math.floor(nextSyncIn / 60)}:{(nextSyncIn % 60).toString().padStart(2, '0')}
              </span>
            </div>
            <button 
              onClick={() => {
                handleGlobalSync();
                setNextSyncIn(900); // Reset Pulse timer on manual refresh
              }} 
              disabled={syncing}
              className={cn(
                "btn-secondary flex items-center gap-1.5 py-1.5 px-4 bg-[#1c1c1c] text-white hover:bg-black transition-all shadow-lg",
                syncing && "opacity-50 cursor-not-allowed"
              )}
            >
              <RefreshCw className={cn("w-3.5 h-3.5 text-white", syncing && "animate-spin")} />
              <span className="text-[10px] font-black uppercase tracking-widest">
                {syncing ? "Refreshing..." : "Refresh CRM"}
              </span>
            </button>
          </div>
        }
      />

      <AnnouncementFeed />


      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard 
          label="Calls Today" 
          value={counts.today} 
          sub="Due now" 
          variant="gradient"
          icon={<Phone className="w-4 h-4" />}
          href="/tasks?status=due" 
        />
        <StatCard 
          label="Overdue" 
          value={counts.overdue} 
          sub="Needs attention" 
          accent="text-red-600" 
          variant="glass"
          icon={<AlertTriangle className="w-4 h-4" />}
          href="/tasks?status=overdue" 
        />
        <StatCard 
          label="Done This Week" 
          value={counts.doneThisWeek} 
          sub="Calls completed" 
          variant="glass"
          icon={<CheckCircle2 className="w-4 h-4" />}
          href="/tasks?status=done" 
        />
        <StatCard 
          label="Recovery Rate" 
          value={`${recoveryRate}%`} 
          sub="Abandoned carts" 
          variant="glass"
          icon={<TrendingUp className="w-4 h-4" />}
          trend={recoveryRate > 30 ? "up" : "neutral"}
          trendValue="+2.4%"
        />
      </div>

      {profile?.role === "admin" && (
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        <StatCard label="Esc 1d+" value={escalations.medium} sub="Follow-up" accent="text-amber-600" href="/tasks?status=overdue" />
        <StatCard label="Esc 3d+" value={escalations.high} sub="Review" accent="text-orange-600" href="/tasks?status=overdue" />
        <StatCard label="Esc 7d+" value={escalations.critical} sub="Critical" accent="text-rose-700" href="/tasks?status=overdue" />
        <StatCard label="Issue Flow" value={escalations.issues} sub="Problems" accent="text-rose-600" href="/tasks?type=issue_resolution" />
        <StatCard label="NDR Comm" value={stats.activeNdr} sub="Shipping" accent="text-amber-600" href="/manager" />
      </div>
      )}

      {profile?.role === "agent" && agentMetrics && (
        <div className="mb-8 animate-in fade-in slide-in-from-top-4 duration-700">
           <h2 className="section-title flex items-center gap-2 mb-3">
             <TrendingUp className="w-4 h-4 text-[#1c1c1c]" />
             My Productivity Profile
           </h2>
           <AgentStats metrics={agentMetrics} trendData={trendData} />
        </div>
      )}

      {profile?.role === "admin" && allAgentsMetrics.length > 0 && (
        <div className="mb-8 animate-in fade-in slide-in-from-top-4 duration-700">
           <Leaderboard agents={allAgentsMetrics} />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        {/* Today's Calls */}
        <div className="lg:col-span-3 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="section-title mb-0 text-[#1c1c1c]">Today&apos;s Calls ({counts.today})</h2>
            <span className="text-xs text-[#1c1c1c] font-bold bg-[#1c1c1c]/5 px-2 py-0.5 rounded-full">Due Today</span>
          </div>
          {todayTasks.length === 0 ? (
            <div className="card p-8 text-center text-gray-400 text-sm">🎉 All calls done for today!</div>
          ) : (
            <>
              {todayTasks.map(task => (
                <TaskCard key={task.id} task={task} onComplete={handleComplete} onReschedule={handleReschedule} 
                  onSkip={handleSkip} onWhatsApp={fetchDashboardData} whatsappSettings={waSettings} 
                  isAdmin={profile?.role === "admin"} agents={agents} onReassign={handleReassign} />
              ))}
              <Pagination current={todayPage} total={counts.today} pageSize={ITEMS_PER_PAGE} onChange={setTodayPage} />
            </>
          )}

          {/* Overdue */}
          {overdueTasks.length > 0 && (
            <div className="pt-4 space-y-3">
              <div className="flex items-center justify-between pt-2">
                <h2 className="section-title mb-0 flex items-center gap-1.5 text-red-600">
                  <AlertTriangle className="w-3.5 h-3.5" /> Overdue / Missed ({counts.overdue})
                </h2>
              </div>
              {overdueTasks.map(task => (
                <TaskCard key={task.id} task={task} onComplete={handleComplete} onReschedule={handleReschedule}
                  onSkip={handleSkip} onWhatsApp={fetchDashboardData}
                  isAdmin={profile?.role === "admin"} agents={agents} onReassign={handleReassign} />
              ))}
              <Pagination current={overduePage} total={counts.overdue} pageSize={ITEMS_PER_PAGE} onChange={setOverduePage} />
            </div>
          )}
        </div>

          {/* Right column */}
        <div className="lg:col-span-2 space-y-5">

          {/* Upcoming */}
          <div>
            <h2 className="section-title">Upcoming (Next 3 Days)</h2>
            <div className="card divide-y divide-gray-50">
              {upcomingTasks.slice(0, 5).map(t => (
                <div key={t.id} className="px-4 py-3 flex items-center gap-3">
                  <Avatar name={t.customer?.name || "U"} size="sm" />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-bold text-[#1c1c1c] truncate">{t.customer?.name}</div>
                    <div className="text-[11px] text-gray-400">{t.order?.order_number} · {t.task_type.replace("_", " ")}</div>
                  </div>
                  <div className="text-[11px] text-gray-400 whitespace-nowrap uppercase">{t.due_date}</div>
                </div>
              ))}
              {upcomingTasks.length === 0 && (
                <div className="px-4 py-6 text-center text-xs text-gray-400">No upcoming tasks</div>
              )}
            </div>
          </div>

          {/* Recent Activity */}
          <div>
            <h2 className="section-title">Recent Activity</h2>
            <div className="card divide-y divide-gray-50">
              {recentActivity.map((log) => (
                <div key={log.id} className="px-4 py-3 flex items-start gap-3">
                  <div className={cn("w-2 h-2 rounded-full mt-1.5 flex-shrink-0",
                    log.outcome === "done" ? "bg-[#1c1c1c]" : log.outcome === "no_answer" ? "bg-[#1c1c1c]" : "bg-[#1c1c1c]"
                  )} />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-bold text-[#1c1c1c]">
                      {log.customer?.name || (log as any).metadata?.customer_name || "System Event"}
                    </div>
                    <div className="text-[11px] text-gray-400">
                      {log.outcome === "done" ? "Call completed" : log.outcome === "no_answer" ? "No answer" : log.outcome.replace('_', ' ')}
                    </div>
                    {log.note && <div className="text-[11px] text-gray-400 italic truncate">&quot;{log.note}&quot;</div>}
                  </div>
                  <div className="text-[10px] text-gray-300 whitespace-nowrap">{timeAgo(log.called_at)}</div>
                </div>
              ))}
              {recentActivity.length === 0 && (
                <div className="px-4 py-6 text-center text-xs text-gray-400">No recent activity</div>
              )}
            </div>
          </div>

          {profile?.role === "admin" && LivePulseFeed && (
            <LivePulseFeed initialLogs={webhookLogs} />
          )}
        </div>
      </div>
    </div>
  );
}
