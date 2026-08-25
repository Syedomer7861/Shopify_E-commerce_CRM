import { NextRequest, NextResponse } from "next/server";
import { requireInternal, hasInternalSecret, getAuthenticatedSession } from "@/lib/auth-utils";
import { createServerClient } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  const unauthorized = await requireInternal(req);
  if (unauthorized) return unauthorized;

  // The leaves RLS policies already block a plain agent's UPDATE here (no
  // agent-level UPDATE policy exists, only admin/hr's), so this could never
  // actually approve/reject someone else's leave - but a non-privileged
  // caller still got back {success:true} for a write that silently affected
  // 0 rows. Checking the role explicitly makes the response honest.
  if (!hasInternalSecret(req)) {
    const { profile } = await getAuthenticatedSession();
    if (profile?.role !== "admin" && profile?.role !== "hr") {
      return NextResponse.json({ error: "Forbidden: Admin or HR access required" }, { status: 403 });
    }
  }

  const supabase = createServerClient();

  try {
    const { leaveId, status, remarks } = await req.json();

    if (!leaveId || !["approved", "rejected"].includes(status)) {
      return NextResponse.json({ error: "Invalid parameters" }, { status: 400 });
    }

    const { data: leave } = await supabase.from("leaves").select("reason").eq("id", leaveId).single();
    let updateData: any = { status, updated_at: new Date().toISOString() };
    
    if (remarks && leave) {
      updateData.reason = leave.reason + `\n\n[HR Remark]: ${remarks}`;
    }

    const { error } = await supabase
      .from("leaves")
      .update(updateData)
      .eq("id", leaveId);

    if (error) throw error;

    // Fetch leave details to get the agent's name for the alert
    const { data: updatedLeave } = await supabase.from("leaves").select("agent_id, start_date, end_date").eq("id", leaveId).single();
    if (updatedLeave) {
      const { data: profile } = await supabase.from("profiles").select("name").eq("id", updatedLeave.agent_id).single();
      const agentName = profile?.name || "An Agent";
      
      const { notifyAdmin } = await import("@/lib/notifications");
      await notifyAdmin(
        `✅ *Leave ${status.toUpperCase()}*\n\nAgent: *${agentName}*\nDates: ${updatedLeave.start_date} to ${updatedLeave.end_date}\nAction by: HR\nRemarks: ${remarks || "None"}`,
        "info"
      );
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
