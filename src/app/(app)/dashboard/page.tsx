"use client";
import { useState, useEffect } from "react";
import { AlertTriangle, Clock, CheckCircle2, TrendingUp, Phone, RefreshCw, Sun, Moon } from "lucide-react";
import { StatCard, PageHeader, Avatar } from "@/components/ui";
import TaskCard from "@/components/TaskCard";
import { AgentStats } from "@/components/AgentStats";
import { Leaderboard } from "@/components/Leaderboard";
import { createClient } from "@/lib/supabase";
import { SEGMENT_CONFIG, cn, timeAgo, toDbDateString } from "@/lib/utils";
import toast from "react-hot-toast";
import type { Task, Customer, Order, CallLog, AbandonedCart } from "@/types";
import { logAuditEvent } from "@/lib/audit";

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
  const [agentMetrics, setAgentMetrics] = useState<any>(null);
  const [allAgentsMetrics, setAllAgentsMetrics] = useState<any[]>([]);
  const [trendData, setTrendData] = useState<any[]>([]);
  
  const [lastChecked, setLastChecked] = useState<Date>(new Date());
  const [agents, setAgents] = useState<{ id: string; name: string }[]>([]);
  
  const supabase = createClient();

  useEffect(() => {
    fetchDashboardData();
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    
    // HYBRID POLLING: Fallback poll every 10 seconds to ensure feed stays fresh
    const pollTimer = setInterval(() => {
      fetchDashboardData(true); // silent fetch
    }, 10000);

    // REAL-TIME UPDATES: Listen for changes in tasks, orders, or logs
    const channel = supabase
      .channel('dashboard-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => fetchDashboardData(true))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => fetchDashboardData(true))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'call_logs' }, () => fetchDashboardData(true))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'webhook_logs' }, () => fetchDashboardData(true))
      .subscribe();

    // 15-MINUTE GLOBAL SYNC HEARTBEAT (New Requirement)
    const syncHeartbeat = setInterval(() => {
      console.log("[Heartbeat] Triggering 15-minute global sync...");
      handleGlobalSync(true); // Silent pulse
    }, 15 * 60 * 1000);

    return () => {
      clearInterval(timer);
      clearInterval(pollTimer);
      clearInterval(syncHeartbeat);
      supabase.removeChannel(channel);
    };
  }, []);

  async function fetchDashboardData(silent = false) {
    if (!silent) setLoading(true);
    setLastChecked(new Date());
    
    // 0. Fetch Profile Info
    const { data: { user } } = await supabase.auth.getUser();
    let prof: any = null;
    if (user) {
      const { data: profData } = await supabase.from("profiles").select("*").eq("id", user.id).single();
      prof = profData;
      setProfile(prof);

      if (prof?.role === "admin") {
        const { data: agentsData } = await supabase.from("profiles").select("id, name").eq("role", "agent").eq("is_active", true);
        if (agentsData) setAgents(agentsData);
      }
    }

    const today = toDbDateString(new Date());
    
    // 1. Fetch Today's Tasks
    const { data: todayData, count: todayCount } = await supabase
      .from("tasks")
      .select("*, customer:customers(*), order:orders(*), abandoned_cart:abandoned_carts(*), assigned_profile:profiles!tasks_assigned_to_fkey(id,name,email)", { count: "exact" })
      .eq("due_date", today)
      .in("status", ["pending", "due"])
      .order("priority_score", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(50);
    
    // 2. Fetch Overdue Tasks
    const { data: overdueData, count: overdueCount } = await supabase
      .from("tasks")
      .select("*, customer:customers(*), order:orders(*), abandoned_cart:abandoned_carts(*), assigned_profile:profiles!tasks_assigned_to_fkey(id,name,email)", { count: "exact" })
      .lt("due_date", today)
      .not("status", "in", '("done","skipped","cancelled")')
      .order("priority_score", { ascending: false })
      .order("due_date", { ascending: true })
      .limit(50);

    // 3. Fetch Upcoming Tasks (next 3 days)
    const threeDaysOut = new Date();
    threeDaysOut.setDate(threeDaysOut.getDate() + 3);
    const { data: upcomingData, count: upcomingCount } = await supabase
      .from("tasks")
      .select("*, customer:customers(*), order:orders(*), abandoned_cart:abandoned_carts(*), assigned_profile:profiles!tasks_assigned_to_fkey(id,name,email)", { count: "exact" })
      .gt("due_date", today)
      .lte("due_date", toDbDateString(threeDaysOut))
      .eq("status", "pending")
      .order("priority_score", { ascending: false })
      .order("due_date", { ascending: true })
      .limit(50);

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
      { count: shipCount }
    ] = await Promise.all([
      supabase.from("tasks").select("id", { count: "exact", head: true }).lte("due_date", medDate).not("status", "in", '("done","skipped","cancelled")'),
      supabase.from("tasks").select("id", { count: "exact", head: true }).lte("due_date", highDate).not("status", "in", '("done","skipped","cancelled")'),
      supabase.from("tasks").select("id", { count: "exact", head: true }).lte("due_date", critDate).not("status", "in", '("done","skipped","cancelled")'),
      supabase.from("tasks").select("id", { count: "exact", head: true }).eq("task_type", "issue_resolution").not("status", "in", '("done","skipped","cancelled")'),
      supabase.from("tasks").select("id", { count: "exact", head: true }).eq("task_type", "transit_update").not("status", "in", '("done","skipped","cancelled")'),
    ]);

    setEscalations({
      medium: medCount || 0,
      high: highCount || 0,
      critical: critCount || 0,
      issues: issueCount || 0,
      shipping: shipCount || 0,
    });
    // 8. Fetch Agent Productivity (NEW)
    try {
      const res = await fetch(`/api/dashboard/agent${user ? `?agentId=${user.id}` : ""}`);
      if (res.ok) {
        const json = await res.json();
        setAgentMetrics(json.metrics?.[0] || null);
        setTrendData(json.trends || []);
      }
      
      // Also fetch all agents if admin for leaderboard
      const allRes = await fetch(`/api/dashboard/agent`);
      if (allRes.ok) {
        const allJson = await allRes.json();
        setAllAgentsMetrics(allJson.metrics || []);
      }
    } catch (e) {}

    setLoading(false);
  }

  async function handleGlobalSync(silent = false) {
    setSyncing(true);
    try {
      // Step 1: Full sync
      const res = await fetch("/api/sync/all", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        if (!silent) toast.success(`Sync Complete: ${data.report.logs.processed} logs, ${data.report.tasks.generated} tasks`);
      } else {
        if (!silent) toast.error(data.error || "Sync failed");
      }

      // Step 2: Auto-unmask any masked contacts (admin only, non-blocking)
      if (profile?.role === "admin") {
        try {
          const unmaskRes = await fetch("/api/sync/unmask", { method: "POST" });
          const unmaskData = await unmaskRes.json();
          if (unmaskData.success && unmaskData.unmaskedCount > 0) {
            if (!silent) toast.success(`🔓 Unmasked ${unmaskData.unmaskedCount} contacts (${unmaskData.mergedCount} merged)`);
          }
        } catch {
          // Non-critical — don't spam the user
        }
      }
    } catch (err) {
      toast.error("Failed to sync system");
    } finally {
      await fetchDashboardData();
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
    const { data: { user } } = await supabase.auth.getUser();
    
    // 1. Update Task status
    const { error: taskErr } = await supabase
      .from("tasks")
      .update({ status: "done", completed_at: new Date().toISOString() } as any)
      .eq("id", id);

    if (taskErr) return toast.error("Failed to update task");

    // 2. Log the call
    const task = [...todayTasks, ...overdueTasks].find(t => t.id === id);
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

      // Special handling: If recovery task is done, mark the cart as recovered
      if (task.task_type === "recovery" && outcome === "done" && task.abandoned_cart_id) {
          await supabase.from("abandoned_carts").update({ recovery_status: "recovered" }).eq("id", task.abandoned_cart_id);
      }
    }

    // 3. Log to Agent Activity (NEW)
    if (user) {
      await supabase.from("agent_activity_logs").insert({
        agent_id: user.id,
        activity_type: outcome === "whatsapp" ? "whatsapp" : "call",
        reference_id: id,
        metadata: {
          task_type: task?.task_type,
          customer_name: task?.customer?.name,
          revenue: task?.order?.total_price || 0
        }
      });
    }

    await logAuditEvent({
      entityType: "task",
      entityId: id,
      action: "complete",
      summary: `Completed ${task?.task_type || "task"} for ${task?.customer?.name || "customer"}`,
      metadata: { outcome, disposition, followUpAction },
    });
    toast.success("Call logged successfully");
    fetchDashboardData(true); // Silent Refresh
  }

  async function handleReschedule(id: string, date: string, reason: string) {
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("tasks")
      .update({ status: "rescheduled", due_date: date, rescheduled_to: date } as any)
      .eq("id", id);

    if (error) return toast.error("Failed to reschedule");

    const task = [...todayTasks, ...overdueTasks].find(t => t.id === id);
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
    fetchDashboardData();
  }

  async function handleSkip(id: string) {
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("tasks").update({ status: "skipped" } as any).eq("id", id);
    if (error) return toast.error("Failed to skip");

    const task = [...todayTasks, ...overdueTasks].find(t => t.id === id);
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
    fetchDashboardData();
  }

  if (loading && !syncing) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="flex flex-col items-center gap-3">
          <RefreshCw className="w-8 h-8 text-[#2D1E6F] animate-spin" />
          <p className="text-sm text-gray-500 font-medium">Syncing with CRM...</p>
        </div>
      </div>
    );
  }

  const hour = new Date().getHours();
  let greeting = "Good evening";
  let Icon = Moon;
  let iconClass = "text-[#2D1E6F] animate-float";

  if (hour < 12) {
    greeting = "Good morning";
    Icon = Sun;
    iconClass = "text-[#2D1E6F] animate-spin-slow";
  } else if (hour < 17) {
    greeting = "Good afternoon";
    Icon = Sun;
    iconClass = "text-[#2D1E6F] animate-pulse-slow";
  }

  const lastWebhook = webhookLogs[0];

  return (
    <div className="animate-fade-in">
      <PageHeader
        title={
          <div className="flex items-center gap-3">
            <span>{greeting}, {profile?.name?.split(' ')[0] || "Admin"}</span>
            <Icon className={cn("w-8 h-8", iconClass)} />
          </div>
        }
        subtitle={
          <div className="flex items-center gap-2 mt-1">
            <span className="text-gray-500 font-medium">Today is {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}</span>
            <span className="text-gray-300">|</span>
            <div className="flex items-center gap-1.5 text-[#2D1E6F] font-bold bg-[#2D1E6F]/5 px-2.5 py-1 rounded-lg border border-[#2D1E6F]/10">
              <Clock className="w-3.5 h-3.5" />
              <span>{currentTime.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true })}</span>
            </div>
          </div>
        }
        actions={
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 mt-0.5 mr-3">
              <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
              <span className="text-gray-400 text-[9px] uppercase font-bold tracking-widest">Live Engine</span>
            </div>
            <button 
              onClick={() => handleGlobalSync()} 
              disabled={syncing}
              className={cn(
                "btn-secondary flex items-center gap-1.5 py-1.5 px-3",
                syncing && "opacity-50 cursor-not-allowed"
              )}
            >
              <RefreshCw className={cn("w-3.5 h-3.5", (syncing || loading) && "animate-spin")} />
              {syncing ? "Syncing..." : "Sync Logs"}
            </button>
          </div>
        }
      />


      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Calls Today" value={counts.today} sub="Due now" accent="text-[#2D1E6F]" href="/tasks?status=due" />
        <StatCard label="Overdue" value={counts.overdue} sub="Needs attention" accent="text-red-600" href="/tasks?status=overdue" />
        <StatCard label="Upcoming (3d)" value={counts.upcoming} sub="In the pipeline" accent="text-[#2D1E6F]" href="/tasks?status=pending" />
        <StatCard label="Done This Week" value={counts.doneThisWeek} sub="Calls completed" accent="text-[#2D1E6F]" href="/tasks?status=done" />
      </div>

      {/* Escalation Row — ADMIN ONLY */}
      {profile?.role === "admin" && (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Escalation 1d+" value={escalations.medium} sub="Needs follow-up" accent="text-amber-600" href="/tasks?status=overdue" />
        <StatCard label="Escalation 3d+" value={escalations.high} sub="Manager review" accent="text-orange-600" href="/tasks?status=overdue" />
        <StatCard label="Escalation 7d+" value={escalations.critical} sub="Critical backlog" accent="text-rose-700" href="/tasks?status=overdue" />
        <StatCard label="Issue Workflows" value={escalations.issues} sub="Delivery problems" accent="text-rose-600" href="/tasks?type=issue_resolution" />
        <StatCard label="Shipping Pipeline" value={escalations.shipping} sub="Transit Updates" accent="text-[#2D1E6F]" href="/tasks?type=transit_update" />
      </div>
      )}

      {profile?.role === "agent" && agentMetrics && (
        <div className="mb-8 animate-in fade-in slide-in-from-top-4 duration-700">
           <h2 className="section-title flex items-center gap-2 mb-3">
             <TrendingUp className="w-4 h-4 text-[#2D1E6F]" />
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
            <h2 className="section-title mb-0 text-[#2D1E6F]">Today's Calls ({counts.today})</h2>
            <span className="text-xs text-[#2D1E6F] font-bold bg-[#2D1E6F]/5 px-2 py-0.5 rounded-full">Due Today</span>
          </div>
          {todayTasks.length === 0 ? (
            <div className="card p-8 text-center text-gray-400 text-sm">🎉 All calls done for today!</div>
          ) : (
            todayTasks.map(task => (
              <TaskCard key={task.id} task={task} onComplete={handleComplete} onReschedule={handleReschedule} 
                onSkip={handleSkip} onWhatsApp={fetchDashboardData} whatsappSettings={waSettings} 
                isAdmin={profile?.role === "admin"} agents={agents} onReassign={handleReassign} />
            ))
          )}

          {/* Overdue */}
          {overdueTasks.length > 0 && (
            <>
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
            </>
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
                    <div className="text-xs font-bold text-[#2D1E6F] truncate">{t.customer?.name}</div>
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
                    log.outcome === "done" ? "bg-[#2D1E6F]" : log.outcome === "no_answer" ? "bg-[#2D1E6F]" : "bg-[#2D1E6F]"
                  )} />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-bold text-[#2D1E6F]">
                      {log.customer?.name || (log.metadata as any)?.customer_name || "System Event"}
                    </div>
                    <div className="text-[11px] text-gray-400">
                      {log.outcome === "done" ? "Call completed" : log.outcome === "no_answer" ? "No answer" : log.outcome.replace('_', ' ')}
                    </div>
                    {log.note && <div className="text-[11px] text-gray-400 italic truncate">"{log.note}"</div>}
                  </div>
                  <div className="text-[10px] text-gray-300 whitespace-nowrap">{timeAgo(log.called_at)}</div>
                </div>
              ))}
              {recentActivity.length === 0 && (
                <div className="px-4 py-6 text-center text-xs text-gray-400">No recent activity</div>
              )}
            </div>
          </div>

          {/* Live Webhook Logs — ADMIN ONLY */}
          {profile?.role === "admin" && (
          <div className="animate-in slide-in-from-right duration-500">
            <div className="flex items-center justify-between mb-2">
              <h2 className="section-title mb-0">Live Sync Feed</h2>
              {lastWebhook && (
                 <span className="text-[10px] text-gray-400">Last Pulse: {timeAgo(lastWebhook.created_at)}</span>
              )}
            </div>
            <div className="card bg-gray-50/50 border-dashed border-gray-200">
              <div className="divide-y divide-gray-100">
                {webhookLogs.map((log) => {
                  const data = log.payload?.data || log.payload?.payload || log.payload;
                  let name = log.customer_name || data?.customer_name || data?.first_name || data?.email || "Unknown Customer";
                  if (log.topic === "system_sync") name = "GLOBAL CRM REFRESH";
                  const cartId = data?.cart_id || data?.checkout_id || "";
                  
                  return (
                    <div key={log.id} className="px-3 py-2.5 flex items-center justify-between gap-3 group">
                      <div className="flex items-center gap-2 overflow-hidden">
                        <div className={cn("w-1.5 h-1.5 rounded-full", 
                          log.topic === "order_placed" ? "bg-[#2D1E6F]" : "bg-[#2D1E6F]"
                        )} />
                        <div className="min-w-0">
                          <div className="text-[11px] font-bold text-[#2D1E6F] truncate uppercase">
                            {log.topic.replace('_', ' ')}
                          </div>
                          <div className="text-[10px] text-gray-500 truncate">
                            {name} {cartId && `(${cartId.slice(0, 8)})`}
                          </div>
                        </div>
                      </div>
                      <div className="text-[9px] text-gray-300 whitespace-nowrap tabular-nums">
                        {new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </div>
                    </div>
                  );
                })}
                {webhookLogs.length === 0 && (
                  <div className="px-4 py-10 text-center">
                    <div className="text-[11px] text-gray-400">Waiting for data from Shiprocket...</div>
                    <div className="text-[9px] text-gray-300 mt-1 italic">Make sure your webhooks are enabled in Shiprocket.</div>
                  </div>
                )}
              </div>
            </div>
          </div>
          )}
        </div>
      </div>
    </div>
  );
}
