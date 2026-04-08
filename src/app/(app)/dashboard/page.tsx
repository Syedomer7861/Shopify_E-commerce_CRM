"use client";
import { useState, useEffect } from "react";
import { AlertTriangle, Clock, CheckCircle2, TrendingUp, Phone, RefreshCw, Sun, Moon } from "lucide-react";
import { StatCard, PageHeader, Avatar } from "@/components/ui";
import TaskCard from "@/components/TaskCard";
import { createClient } from "@/lib/supabase";
import { SEGMENT_CONFIG, cn, timeAgo } from "@/lib/utils";
import toast from "react-hot-toast";
import type { Task, Customer, Order, CallLog, AbandonedCart } from "@/types";

export default function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<any>(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [todayTasks, setTodayTasks] = useState<(Task & { customer: Customer; order?: Order; abandoned_cart?: AbandonedCart })[]>([]);
  const [overdueTasks, setOverdueTasks] = useState<(Task & { customer: Customer; order?: Order; abandoned_cart?: AbandonedCart })[]>([]);
  const [upcomingTasks, setUpcomingTasks] = useState<(Task & { customer: Customer; order?: Order; abandoned_cart?: AbandonedCart })[]>([]);
  const [recentActivity, setRecentActivity] = useState<CallLog[]>([]);
  const [counts, setCounts] = useState({ today: 0, overdue: 0, upcoming: 0, doneThisWeek: 0 });
  const [webhookLogs, setWebhookLogs] = useState<{ id: string; topic: string; created_at: string; payload: any }[]>([]);
  const [waSettings, setWaSettings] = useState<any>(null);
  const [syncing, setSyncing] = useState(false);
  
  const [lastChecked, setLastChecked] = useState<Date>(new Date());
  
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

    return () => {
      clearInterval(timer);
      clearInterval(pollTimer);
      supabase.removeChannel(channel);
    };
  }, []);

  async function fetchDashboardData(silent = false) {
    if (!silent) setLoading(true);
    setLastChecked(new Date());
    
    // 0. Fetch Profile Info
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: prof } = await supabase.from("profiles").select("*").eq("id", user.id).single();
      setProfile(prof);
    }

    const today = new Date().toLocaleDateString("en-CA");
    
    // 1. Fetch Today's Tasks
    const { data: todayData } = await supabase
      .from("tasks")
      .select("*, customer:customers(*), order:orders(*), abandoned_cart:abandoned_carts(*)")
      .eq("due_date", today)
      .in("status", ["pending", "due"])
      .order("created_at", { ascending: false });
    
    // 2. Fetch Overdue Tasks
    const { data: overdueData } = await supabase
      .from("tasks")
      .select("*, customer:customers(*), order:orders(*), abandoned_cart:abandoned_carts(*)")
      .lt("due_date", today)
      .not("status", "in", '("done","skipped","cancelled")')
      .order("due_date", { ascending: true });

    // 3. Fetch Upcoming Tasks (next 3 days)
    const threeDaysOut = new Date();
    threeDaysOut.setDate(threeDaysOut.getDate() + 3);
    const { data: upcomingData } = await supabase
      .from("tasks")
      .select("*, customer:customers(*), order:orders(*), abandoned_cart:abandoned_carts(*)")
      .gt("due_date", today)
      .lte("due_date", threeDaysOut.toLocaleDateString("en-CA"))
      .eq("status", "pending")
      .order("due_date", { ascending: true });

    // 4. Recent Activity
    const { data: activityData } = await supabase
      .from("call_logs")
      .select("*, customer:customers(*)")
      .order("called_at", { ascending: false })
      .limit(5);

    // 5. Done This Week count
    const startOfWeek = new Date();
    startOfWeek.setDate(startOfWeek.getDate() - 7);
    const { count: doneCount } = await supabase
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("status", "done")
      .gte("completed_at", startOfWeek.toISOString());
    
    // 6. WhatsApp Settings
    const { data: ws } = await supabase.from("settings").select("*").eq("id", "00000000-0000-0000-0000-000000000000").maybeSingle();
    setWaSettings(ws);

    // 7. Recent Webhook Logs (The "Pulse")
    const { data: logsData } = await supabase
      .from("webhook_logs")
      .select("id, topic, created_at, payload")
      .order("created_at", { ascending: false })
      .limit(5);

    setTodayTasks((todayData || []) as any);
    setOverdueTasks((overdueData || []) as any);
    setUpcomingTasks((upcomingData || []) as any);
    setRecentActivity((activityData || []) as any);
    setWebhookLogs((logsData || []) as any);
    setCounts({
      today: todayData?.length || 0,
      overdue: overdueData?.length || 0,
      upcoming: upcomingData?.length || 0,
      doneThisWeek: doneCount || 0
    });
    setLoading(false);
  }

  async function handleGlobalSync() {
    setSyncing(true);
    try {
      const res = await fetch("/api/sync/all", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        toast.success(`Sync Complete: ${data.report.logs.processed} logs, ${data.report.tasks.generated} tasks`);
      } else {
        toast.error(data.error || "Sync failed");
      }
    } catch (err) {
      toast.error("Failed to sync system");
    } finally {
      await fetchDashboardData();
      setSyncing(false);
    }
  }

  async function handleComplete(id: string, outcome: string, note: string) {
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
        note,
        agent_name: user?.email || "System"
      });

      // Special handling: If recovery task is done, mark the cart as recovered
      if (task.task_type === "recovery" && outcome === "done" && task.abandoned_cart_id) {
          await supabase.from("abandoned_carts").update({ recovery_status: "recovered" }).eq("id", task.abandoned_cart_id);
      }
    }

    toast.success("Call logged successfully");
    fetchDashboardData(); // Refresh
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
        note: `Rescheduled to ${date}${reason ? `: ${reason}` : ""}`,
        agent_name: user?.email || "Agent"
      });
    }
    
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
        note: "Task skipped",
        agent_name: user?.email || "Agent"
      });
    }
    toast.success("Task skipped");
    fetchDashboardData();
  }

  if (loading && !syncing) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="flex flex-col items-center gap-3">
          <RefreshCw className="w-8 h-8 text-forest animate-spin" />
          <p className="text-sm text-gray-500 font-medium">Syncing with Supabase...</p>
        </div>
      </div>
    );
  }

  const hour = new Date().getHours();
  let greeting = "Good evening";
  let Icon = Moon;
  let iconClass = "text-indigo-500 animate-float";

  if (hour < 12) {
    greeting = "Good morning";
    Icon = Sun;
    iconClass = "text-amber-500 animate-spin-slow";
  } else if (hour < 17) {
    greeting = "Good afternoon";
    Icon = Sun;
    iconClass = "text-orange-500 animate-pulse-slow";
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
            <div className="flex items-center gap-1.5 text-forest font-bold bg-lime/10 px-2 py-0.5 rounded-md border border-lime/20">
              <Clock className="w-3.5 h-3.5" />
              <span>{currentTime.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true })}</span>
            </div>
          </div>
        }
        actions={
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-medium text-emerald-600 bg-emerald-50 px-2 py-1 rounded-md border border-emerald-100 flex items-center gap-1 mr-2">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Live System
            </span>
            <button 
              onClick={handleGlobalSync} 
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
        <StatCard label="Calls Today" value={counts.today} sub="Due now" accent="text-blue-600" />
        <StatCard label="Overdue" value={counts.overdue} sub="Needs attention" accent="text-rose-600" />
        <StatCard label="Upcoming (3d)" value={counts.upcoming} sub="In the pipeline" accent="text-amber-600" />
        <StatCard label="Done This Week" value={counts.doneThisWeek} sub="Calls completed" accent="text-emerald-600" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        {/* Today's Calls */}
        <div className="lg:col-span-3 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="section-title mb-0">Today's Calls ({counts.today})</h2>
            <span className="text-xs text-blue-600 font-medium bg-blue-50 px-2 py-0.5 rounded-full">Due Today</span>
          </div>
          {todayTasks.length === 0 ? (
            <div className="card p-8 text-center text-gray-400 text-sm">🎉 All calls done for today!</div>
          ) : (
            todayTasks.map(task => (
              <TaskCard key={task.id} task={task} onComplete={handleComplete} onReschedule={handleReschedule} 
                onSkip={handleSkip} onWhatsApp={fetchDashboardData} whatsappSettings={waSettings} />
            ))
          )}

          {/* Overdue */}
          {overdueTasks.length > 0 && (
            <>
              <div className="flex items-center justify-between pt-2">
                <h2 className="section-title mb-0 flex items-center gap-1.5 text-rose-700">
                  <AlertTriangle className="w-3.5 h-3.5" /> Overdue / Missed ({counts.overdue})
                </h2>
              </div>
              {overdueTasks.map(task => (
                <TaskCard key={task.id} task={task} onComplete={handleComplete} onReschedule={handleReschedule}
                  onSkip={handleSkip} onWhatsApp={fetchDashboardData} />
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
                    <div className="text-xs font-medium text-forest truncate">{t.customer?.name}</div>
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
                    log.outcome === "done" ? "bg-emerald-500" : log.outcome === "no_answer" ? "bg-amber-500" : "bg-rose-500"
                  )} />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-forest">{log.customer?.name}</div>
                    <div className="text-[11px] text-gray-400">{log.outcome === "done" ? "Call completed" : log.outcome === "no_answer" ? "No answer" : log.outcome}</div>
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

          {/* NEW: Live Webhook Logs */}
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
                  const name = data?.customer_name || data?.first_name || data?.email || "Unknown Customer";
                  const cartId = data?.cart_id || data?.checkout_id || "";
                  
                  return (
                    <div key={log.id} className="px-3 py-2.5 flex items-center justify-between gap-3 group">
                      <div className="flex items-center gap-2 overflow-hidden">
                        <div className={cn("w-1.5 h-1.5 rounded-full", 
                          log.topic === "order_placed" ? "bg-emerald-400" : "bg-blue-400"
                        )} />
                        <div className="min-w-0">
                          <div className="text-[11px] font-semibold text-forest truncate uppercase">
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
        </div>
      </div>
    </div>
  );
}
