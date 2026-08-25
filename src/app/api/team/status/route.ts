import { NextRequest, NextResponse } from "next/server";
import { requireInternal, hasInternalSecret, getAuthenticatedSession } from "@/lib/auth-utils";
import { createServerClient } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const unauthorized = await requireInternal(req);
  if (unauthorized) return unauthorized;

  // requireInternal only checks "logged in or has a cron secret" - this
  // route is the HR Dashboard's live-floor feed and returns full profiles
  // rows (including monthly_salary/emergency_contact) plus every leave
  // request's reason text. Only the callers who legitimately land here
  // (the HR page, admin/hr only) should get it.
  if (!hasInternalSecret(req)) {
    const { profile } = await getAuthenticatedSession();
    if (profile?.role !== "admin" && profile?.role !== "hr") {
      return NextResponse.json({ error: "Forbidden: Admin or HR access required" }, { status: 403 });
    }
  }

  const supabase = createServerClient();

  try {
    // 1. Fetch all active profiles. Same demo-account exclusion used
    // throughout task-engine.ts - without it Demo_Account shows up in the
    // real HR Dashboard's productivity chart and leaderboards.
    const { data: profiles, error: pErr } = await supabase
      .from("profiles")
      .select("*")
      .eq("is_active", true)
      .not("email", "ilike", "%demo%")
      .not("name", "ilike", "%demo%")
      .or('is_demo.is.null,is_demo.eq.false');

    if (pErr) throw pErr;

    // 2. Fetch today's attendance for everyone
    const today = new Date();
    today.setHours(0,0,0,0);
    const { data: attendance } = await supabase
      .from("agent_attendance")
      .select("*")
      .gte("created_at", today.toISOString())
      .order("created_at", { ascending: true });

    // 3. Fetch task counts per agent
    const { data: tasks } = await supabase
      .from("tasks")
      .select("assigned_to, status")
      .not("status", "in", '("done","skipped","cancelled")');

    // 4. Fetch leave requests (all for HR review)
    const { data: leaves } = await supabase
      .from("leaves")
      .select("*, profile:profiles(name, email)")
      .order("created_at", { ascending: false });

    const members = profiles.map(p => {
      const agentAtt = attendance?.filter(a => a.agent_id === p.id) || [];
      const agentTasks = tasks?.filter(t => t.assigned_to === p.id) || [];
      
      let productiveMinutes = 0;
      let breakMinutes = 0;
      let shiftStart = null;
      let statusSince = null;
      if (agentAtt.length > 0) {
        const firstEntry = agentAtt[0];
        const lastEntry = agentAtt[agentAtt.length - 1];
        
        shiftStart = new Date(firstEntry.created_at).toLocaleTimeString("en-IN", { hour: '2-digit', minute: '2-digit', hour12: false });
        statusSince = new Date(lastEntry.created_at).toLocaleTimeString("en-IN", { hour: '2-digit', minute: '2-digit', hour12: false });
        
        for (let i = 0; i < agentAtt.length; i++) {
          const curr = agentAtt[i];
          const next = agentAtt[i+1];
          const end = next ? new Date(next.created_at).getTime() : Date.now();
          const durationMs = end - new Date(curr.created_at).getTime();
          const durationMins = Math.floor(durationMs / 60000);

          if (["online", "meeting", "training"].includes(curr.status)) {
            productiveMinutes += durationMins;
          } else if (["break", "lunch", "away"].includes(curr.status)) {
            breakMinutes += durationMins;
          }
        }
      }

      let lastSeenMinutes = null;
      if (p.last_seen_at) {
        lastSeenMinutes = Math.floor((Date.now() - new Date(p.last_seen_at).getTime()) / 60000);
      }

      return {
        id: p.id,
        name: p.name || p.email.split("@")[0],
        email: p.email,
        role: p.role.charAt(0).toUpperCase() + p.role.slice(1),
        status: (p.status || "offline").charAt(0).toUpperCase() + (p.status || "offline").slice(1),
        lastSeenMinutes: (p.status === "online") ? null : lastSeenMinutes,
        shiftStart,
        statusSince,
        productiveMinutes,
        breakMinutes,
        taskCount: p.role === "admin" ? null : agentTasks.length,
        timeline: agentAtt.slice(-5).map(a => ({
          status: a.status,
          time: new Date(a.created_at).toLocaleTimeString("en-IN", { hour: '2-digit', minute: '2-digit' }),
          reason: a.reason
        }))
      };
    });

    return NextResponse.json({ 
      members, 
      leaves: leaves || [],
      stats: {
        totalBreak: members.reduce((acc, m) => acc + m.breakMinutes, 0),
        avgProductive: Math.floor(members.filter(m => m.shiftStart).reduce((acc, m) => acc + m.productiveMinutes, 0) / (members.filter(m => m.shiftStart).length || 1))
      }
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
