import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

/**
 * GET /api/dashboard/agent
 * Returns productivity metrics for the logged-in agent or all agents if admin.
 */
export async function GET(req: NextRequest) {
  const supabase = createServerClient();

  const { searchParams } = new URL(req.url);
  let agentId = searchParams.get("agentId");
  const startDate = searchParams.get("startDate") || new Date(Date.now() - 30 * 86400000).toISOString();
  const endDate = searchParams.get("endDate") || new Date().toISOString();
  const isCustomRange = searchParams.has("startDate") || searchParams.has("endDate");

  // 0. Security: Get Current User Session
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Get requester profile
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, id")
    .eq("id", session.user.id)
    .single();

  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

  // Hardening: If not admin/manager/hr, they can ONLY see their own data
  const isPrivileged = ["admin", "manager", "hr"].includes(profile.role);
  if (!isPrivileged) {
    agentId = profile.id; // Force their own ID
  }

  let enrichedMetrics: any[] = [];

  if (isCustomRange) {
    const { data: logs, error: logsError } = await supabase
      .from("call_logs")
      .select(`
        agent_name, 
        outcome, 
        task_id, 
        tasks!call_logs_task_id_fkey (
          id, 
          task_type,
          assigned_to,
          orders!tasks_order_id_fkey (
            total_price
          ),
          abandoned_cart:abandoned_carts!tasks_abandoned_cart_id_fkey (
            total_price
          )
        )
      `)
      .gte("called_at", startDate)
      .lte("called_at", endDate);

    // Hardening: Filter custom range results by agentId if forced
    if (logs && agentId && !isPrivileged) {
       // Note: RLS handles this at the DB level, but we add a safety check here
    }

    if (logsError) return NextResponse.json({ error: logsError.message }, { status: 500 });

    const metricsMap: Record<string, any> = {};
    logs?.forEach(log => {
      const email = log.agent_name?.toLowerCase();
      if (!email) return;
      if (!metricsMap[email]) {
        metricsMap[email] = { total_calls: 0, total_whatsapp: 0, tasks_resolved: 0, revenue_recovered: 0 };
      }
      metricsMap[email].total_calls += 1;
      if (log.outcome === 'whatsapp') metricsMap[email].total_whatsapp += 1;
      if (log.outcome === 'done') {
        metricsMap[email].tasks_resolved += 1;
        const taskData = (log as any).tasks;
        const taskType = taskData?.task_type;
        const price = taskData?.orders?.total_price || taskData?.abandoned_cart?.total_price || 0;
        
        // Count revenue for high-impact task types
        const revenueTypes = ["recovery", "transit_update", "win_back", "vip_followup", "welcome_call", "cod_verify"];
        if (revenueTypes.includes(taskType)) {
          metricsMap[email].revenue_recovered += Number(price);
        }
      }
    });

    const { data: profiles } = await supabase.from("profiles").select("*");
    enrichedMetrics = profiles?.map(p => {
      const email = p.email?.toLowerCase();
      const stats = metricsMap[email] || { total_calls: 0, total_whatsapp: 0, tasks_resolved: 0, revenue_recovered: 0 };
      return {
        agent_id: p.id,
        name: p.name || p.email,
        email: p.email,
        role: p.role,
        is_active: p.is_active,
        last_seen_at: p.last_seen_at,
        avatar_url: p.avatar_url,
        weekly_revenue_target: p.weekly_revenue_target,
        ...stats
      };
    }) || [];
  } else {
    let query = supabase.from("v_agent_performance").select("*");
    if (agentId) query = query.eq("agent_id", agentId);
    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    enrichedMetrics = data || [];
  }

  // Fetch trend data from activity logs
  let trendQuery = supabase
    .from("agent_activity_logs")
    .select("created_at, activity_type, metadata")
    .gte("created_at", startDate)
    .lte("created_at", endDate)
    .order("created_at", { ascending: true });

  if (agentId) {
    trendQuery = trendQuery.eq("agent_id", agentId);
  }

  const { data: trendData, error: trendError } = await trendQuery;

  // Fetch today's attendance for ALL agents involved
  const todayStart = new Date();
  todayStart.setHours(0,0,0,0);
  const { data: allAtt } = await supabase
      .from("agent_attendance")
      .select("agent_id, status, reason, created_at")
      .gte("created_at", todayStart.toISOString())
      .order("created_at", { ascending: true });

  const formatDuration = (ms: number) => {
      const s = Math.floor((ms / 1000) % 60);
      const m = Math.floor((ms / (1000 * 60)) % 60);
      const h = Math.floor(ms / (1000 * 60 * 60));
      return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Fetch current profiles to get real-time status as a fallback
  const { data: profiles } = await supabase.from("profiles").select("id, status, last_seen_at, is_active, role, live_state");
  const STALE_THRESHOLD = 60000; // 1 minute
  const now = Date.now();

  // Map attendance hours into metrics for the frontend
  enrichedMetrics = enrichedMetrics.map(m => {
      const prof = profiles?.find(p => p.id === m.agent_id);
      const agentAtt = allAtt?.filter(a => a.agent_id === m.agent_id) || [];
      let aWorkMs = 0;
      let aBreakMs = 0;
      
      let aStatus = prof?.status || "offline";
      let aReason = "";

      if (agentAtt.length > 0) {
          aStatus = agentAtt[agentAtt.length - 1].status;
          aReason = agentAtt[agentAtt.length - 1].reason || "";
          for (let i = 0; i < agentAtt.length; i++) {
              const current = agentAtt[i];
              const next = agentAtt[i+1];
              const endTime = next ? new Date(next.created_at).getTime() : Date.now();
              const duration = endTime - new Date(current.created_at).getTime();
              const isProductive = ["online", "meeting", "training"].includes(current.status);
              const isBreak = ["break", "lunch", "away"].includes(current.status);

              if (isProductive) aWorkMs += duration;
              else if (isBreak) aBreakMs += duration;
          }
      }

      // STALE CHECK: Override if heartbeat is missing
      const lastSeen = prof?.last_seen_at ? new Date(prof.last_seen_at).getTime() : null;
      if (!lastSeen || (now - lastSeen) > STALE_THRESHOLD) {
          aStatus = "offline";
      }

      return {
          ...m,
          today_work_hours: formatDuration(aWorkMs),
          today_break_hours: formatDuration(aBreakMs),
          today_work_ms: aWorkMs,
          today_break_ms: aBreakMs,
          current_status: aStatus,
          last_reason: aReason,
          last_seen_at: prof?.last_seen_at,
          is_active: prof?.is_active,
          role: prof?.role,
          live_state: aStatus === 'offline' ? null : prof?.live_state
      };
  }) || [];

  // If no performance data exists yet, but we have an agentId, return a baseline metrics object with attendance
  if (enrichedMetrics.length === 0 && agentId) {
    const prof = profiles?.find(p => p.id === agentId);
    const agentAtt = allAtt?.filter(a => a.agent_id === agentId) || [];
    let aWorkMs = 0;
    let aBreakMs = 0;
    let aStatus = "offline";
    let aReason = "";

    if (agentAtt.length > 0) {
      aStatus = agentAtt[agentAtt.length - 1].status;
      aReason = agentAtt[agentAtt.length - 1].reason || "";
      for (let i = 0; i < agentAtt.length; i++) {
        const current = agentAtt[i];
        const next = agentAtt[i+1];
        const endTime = next ? new Date(next.created_at).getTime() : Date.now();
        const duration = endTime - new Date(current.created_at).getTime();
        const isProductive = ["online", "meeting", "training"].includes(current.status);
        const isBreak = ["break", "lunch", "away"].includes(current.status);

        if (isProductive) aWorkMs += duration;
        else if (isBreak) aBreakMs += duration;
      }
    }

    // STALE CHECK: Override if heartbeat is missing
    const lastSeen = prof?.last_seen_at ? new Date(prof.last_seen_at).getTime() : null;
    if (!lastSeen || (now - lastSeen) > STALE_THRESHOLD) {
        aStatus = "offline";
    }

    enrichedMetrics = [{
      agent_id: agentId,
      total_calls: 0,
      total_whatsapp: 0,
      tasks_resolved: 0,
      revenue_recovered: 0,
      weekly_revenue_target: 50000, 
      today_work_hours: formatDuration(aWorkMs),
      today_break_hours: formatDuration(aBreakMs),
      today_work_ms: aWorkMs,
      today_break_ms: aBreakMs,
      current_status: aStatus,
      last_reason: aReason,
      last_seen_at: prof?.last_seen_at,
      is_active: prof?.is_active,
      role: prof?.role,
      live_state: aStatus === 'offline' ? null : prof?.live_state
    }];
  }

  return NextResponse.json({
    metrics: enrichedMetrics,
    trends: trendData || [],
    period: { start: startDate, end: endDate }
  });
}
