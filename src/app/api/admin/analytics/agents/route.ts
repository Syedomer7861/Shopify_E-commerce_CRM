import { NextRequest, NextResponse } from "next/server";
import { requireInternal, hasInternalSecret, getAuthenticatedSession } from "@/lib/auth-utils";
import { createServerClient } from "@/lib/supabase";
import { hasPermission } from "@/lib/permissions";

function getSupabase() {
    return createServerClient();
}

export async function GET(req: NextRequest) {
  const unauthorized = await requireInternal(req);
  if (unauthorized) return unauthorized;

  const { searchParams } = new URL(req.url);
  const requestedAgentId = searchParams.get("agentId");

  // requireInternal only checks "someone is logged in" - this returns
  // every agent's revenue/productivity/attendance data, same tier as
  // Manager Hub/Live Floor/Recordings, all of which gate on view_analytics.
  // The Performance page needs an agent to see their OWN history though, so
  // a non-privileged caller is allowed through only when asking for
  // themselves - the response is filtered to just their rows below.
  let selfOnlyId: string | null = null;
  if (!hasInternalSecret(req)) {
    const { profile } = await getAuthenticatedSession();
    if (!hasPermission(profile, "view_analytics")) {
      if (!profile || requestedAgentId !== profile.id) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      selfOnlyId = profile.id;
    }
  }

    const start = searchParams.get("start");
    const end = searchParams.get("end");

    if (!start || !end) {
        return NextResponse.json({ error: "Missing date range" }, { status: 400 });
    }

    const supabase = getSupabase();
    
    // 1. Fetch All Agents/Admins first to ensure everyone is in the leaderboard.
    // Had no demo-account exclusion at all, unlike every other real-data
    // query in task-engine.ts - Demo_Account (demo@cureforever.in) was
    // sitting in the real production leaderboard next to actual staff.
    const { data: allProfiles } = await supabase
        .from("profiles")
        .select("id, name, email, last_seen_at, live_state, role, status")
        .or("role.eq.agent,role.eq.admin")
        .not("email", "ilike", "%demo%")
        .not("name", "ilike", "%demo%")
        .or('is_demo.is.null,is_demo.eq.false');

    const agentStats: Record<string, any> = {};
    (allProfiles || []).forEach(p => {
        agentStats[p.id] = {
            id: p.id,
            name: p.name || p.email || "Unknown",
            email: p.email || "",
            onlineSeconds: 0,
            breakSeconds: 0,
            lastStatus: p.status || 'offline',
            lastReason: null,
            lastTime: null,
            lastSeen: p.last_seen_at ? new Date(p.last_seen_at).getTime() : null,
            live_state: p.live_state || null,
            role: p.role,
            taskCount: 0,
            revenue: 0
        };
    });

    // 2. Fetch Attendance Logs for the period
    const { data: logs, error: attendanceErr } = await supabase
        .from("agent_attendance")
        .select("*, profile:profiles(name, email, last_seen_at, live_state)")
        .gte("created_at", start)
        .lte("created_at", end)
        .order("created_at", { ascending: true });

    if (attendanceErr) {
        return NextResponse.json({ error: attendanceErr.message }, { status: 500 });
    }

    // 3. Fetch Work Performance & Heartbeats
    const [callsRes, activityRes] = await Promise.all([
        supabase.from("call_logs").select("called_at, agent_name").gte("called_at", start).lte("called_at", end),
        supabase.from("agent_activity_logs").select("created_at, agent_id, activity_type, metadata").gte("created_at", start).lte("created_at", end)
    ]);

    const callsData = callsRes.data || [];
    const activityData = activityRes.data || [];

    // 4. Pre-group activity data by agent for efficient lookup
    const activityByAgent: Record<string, any[]> = {};
    activityData?.forEach(act => {
        if (!activityByAgent[act.agent_id]) activityByAgent[act.agent_id] = [];
        activityByAgent[act.agent_id].push(new Date(act.created_at).getTime());
    });

    // Sort each agent's activities once
    Object.values(activityByAgent).forEach(acts => acts.sort((a, b) => a - b));

    const dailyStats: Record<string, any> = {};

    logs?.forEach(log => {
        const agentId = log.agent_id;
        const dateKey = new Date(log.created_at).toISOString().split('T')[0];
        const key = `${dateKey}_${agentId}`;

        if (!dailyStats[key]) {
            dailyStats[key] = {
                date: dateKey,
                agentId,
                name: log.profile?.name || log.profile?.email || "Unknown",
                email: log.profile?.email || "",
                clockIn: log.created_at,
                clockOut: log.created_at, 
                onlineSeconds: 0, 
                breakSeconds: 0, 
                lastStatus: null, 
                lastTime: null,
                taskCount: 0,
                revenue: 0
            };
        }

        const stats = agentStats[agentId];
        if (!stats) return;

        const dStats = dailyStats[key];
        const currentTime = new Date(log.created_at).getTime();

        dStats.clockOut = log.created_at;

        if (stats.lastStatus && stats.lastTime) {
            const gap = currentTime - stats.lastTime;
            const diff = Math.max(0, gap / 1000);
            
            const isProductive = ["online", "meeting", "training"].includes(stats.lastStatus);
            const isBreak = ["break", "lunch", "away"].includes(stats.lastStatus);

            if (isProductive) {
                stats.onlineSeconds += diff;
                dStats.onlineSeconds += diff;
            } else if (isBreak) {
                stats.breakSeconds += diff;
                dStats.breakSeconds += diff;
            }
        }

        stats.lastStatus = log.status;
        stats.lastTime = currentTime;
        stats.lastReason = log.reason;
        dStats.lastStatus = log.status;
        dStats.lastTime = currentTime;
    });

    // 5. Handle Trailing Open Sessions
    Object.values(agentStats).forEach(stats => {
        if (stats.lastStatus && stats.lastTime && stats.lastSeen) {
            const now = stats.lastSeen; 
            if (now > stats.lastTime) {
                const gap = now - stats.lastTime;
                const activeMs = Math.min(gap, 50400000); // 14 hour max trailing for long shifts
                const diff = activeMs / 1000;

                const isProductive = ["online", "meeting", "training"].includes(stats.lastStatus);
                const isBreak = ["break", "lunch", "away"].includes(stats.lastStatus);

                if (isProductive) {
                    stats.onlineSeconds += diff;
                } else if (isBreak) {
                    stats.breakSeconds += diff;
                }

                const dateKey = new Date(stats.lastTime).toISOString().split('T')[0];
                const dKey = `${dateKey}_${stats.id}`;
                if (dailyStats[dKey]) {
                    if (isProductive) dailyStats[dKey].onlineSeconds += diff;
                    else if (isBreak) dailyStats[dKey].breakSeconds += diff;
                    // agent_attendance only gets one row per agent per day (an
                    // "online" status insert), not periodic heartbeats - so
                    // clockOut was set once at row-creation time (line ~119)
                    // and never touched again. This trailing-session block is
                    // what extends onlineSeconds/breakSeconds using the
                    // agent's live last_seen_at, but it never extended
                    // clockOut to match - so a still-active agent's ledger
                    // row showed "Login/Logout" as the identical login
                    // timestamp twice, forever, even hours into a real shift.
                    dailyStats[dKey].clockOut = new Date(now).toISOString();
                }
            }
        }
    });

    // 6. Merge Performance Data
    callsData?.forEach(call => {
        const stats = Object.values(agentStats).find(s => s.name === call.agent_name);
        if (stats) {
            stats.taskCount++;
            const callDate = new Date(call.called_at).toISOString().split("T")[0];
            const dKey = `${callDate}_${stats.id}`;
            if (dailyStats[dKey]) dailyStats[dKey].taskCount++;
        }
    });

    activityData?.forEach(act => {
        const stats = agentStats[act.agent_id];
        if (stats) {
            // dashboard/page.tsx and tasks/page.tsx both log "task_completed"
            // when a task is marked done; TaskCard.tsx logs "task_completion"
            // for the same real event via a different completion UI. Only
            // matching one spelling meant completions from two of the three
            // real call sites never counted toward taskCount/revenue here.
            if (["whatsapp", "task_completion", "task_completed"].includes(act.activity_type)) {
                stats.taskCount++;
                const logDate = new Date(act.created_at).toISOString().split("T")[0];
                const dKey = `${logDate}_${act.agent_id}`;
                if (dailyStats[dKey]) dailyStats[dKey].taskCount++;
            }

            const rev = Number((act.metadata as any)?.revenue || 0);
            if (rev > 0) {
                stats.revenue += rev;
                const logDate = new Date(act.created_at).toISOString().split("T")[0];
                const dKey = `${logDate}_${act.agent_id}`;
                if (dailyStats[dKey]) dailyStats[dKey].revenue += rev;
            }
        }
    });

    // 7. Fetch Recent Activity Logs
    const { data: activityLogs } = await supabase
        .from("agent_activity_logs")
        .select("*, profile:profiles(name)")
        .gte("created_at", start)
        .lte("created_at", end)
        .order("created_at", { ascending: false })
        .limit(50);

    const formatDuration = (seconds: number) => {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = Math.floor(seconds % 60);
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };

    const STALE_THRESHOLD = 60000; // 1 minute (Aggressive Accuracy)
    const now = Date.now();

    const summary = Object.values(agentStats).map(s => {
        const isStale = !s.lastSeen || (now - s.lastSeen) > STALE_THRESHOLD;
        const effectiveStatus = isStale ? 'offline' : s.lastStatus;

        return {
            id: s.id,
            name: s.name,
            email: s.email || "",
            status: effectiveStatus,
            lastReason: s.lastReason,
            onlineHours: formatDuration(s.onlineSeconds),
            breakHours: formatDuration(s.breakSeconds),
            onlineSeconds: s.onlineSeconds,
            breakSeconds: s.breakSeconds,
            taskCount: s.taskCount,
            revenue: s.revenue,
            role: s.role,
            productivity: s.onlineSeconds > 0 ? (s.taskCount / (s.onlineSeconds / 3600)).toFixed(1) : 0,
            liveState: effectiveStatus === 'offline' ? null : s.live_state 
        };
    });

    // 8. Generate Daily Logs for the grid
    const finalDailyLogs: any[] = [];
    Object.values(dailyStats).forEach(d => {
        finalDailyLogs.push({
            date: d.date,
            name: d.name,
            // Client (AgentIntelligence.tsx) filters dailyLogs by
            // agentEmails.has(l.email) - this field was missing entirely,
            // so that filter always compared against undefined and every
            // row silently dropped. The Daily Performance Ledger table
            // could never show data, for any agent, on any date.
            email: d.email || "",
            clockIn: new Date(d.clockIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            clockOut: new Date(d.clockOut).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            workHours: formatDuration(d.onlineSeconds),
            breakHours: formatDuration(d.breakSeconds),
            netHours: formatDuration(Math.max(0, d.onlineSeconds - d.breakSeconds)),
            tasks: d.taskCount,
            revenue: d.revenue,
            status: "Present"
        });
    });

    const dailyLogsSorted = finalDailyLogs.sort((a,b) => b.date.localeCompare(a.date) || a.name.localeCompare(b.name));

    if (selfOnlyId) {
        return NextResponse.json({
            success: true,
            data: summary.filter(s => s.id === selfOnlyId),
            dailyLogs: dailyLogsSorted.filter(d => d.email && d.email === agentStats[selfOnlyId]?.email),
            recentActivity: (activityLogs || []).filter((a: any) => a.agent_id === selfOnlyId)
        });
    }

    return NextResponse.json({
        success: true,
        data: summary,
        dailyLogs: dailyLogsSorted,
        recentActivity: activityLogs || []
    });
}
