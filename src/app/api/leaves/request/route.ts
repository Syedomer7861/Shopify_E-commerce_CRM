import { NextRequest, NextResponse } from "next/server";
import { requireInternal } from "@/lib/auth-utils";
import { createServerClient } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  const unauthorized = await requireInternal(req);
  if (unauthorized) return unauthorized;

  const supabase = createServerClient();

  try {
    const { agentId, startDate, endDate, reason } = await req.json();

    if (!agentId || !startDate || !endDate || !reason) {
      return NextResponse.json({ error: "All fields are required" }, { status: 400 });
    }

    const { error } = await supabase
      .from("leaves")
      .insert({
        agent_id: agentId,
        start_date: startDate,
        end_date: endDate,
        reason,
        status: 'pending'
      });

    if (error) throw error;

    // Fetch agent name for the alert
    const { data: profile } = await supabase.from("profiles").select("name").eq("id", agentId).single();
    const agentName = profile?.name || "An Agent";

    // Alert Admin
    const { notifyAdmin } = await import("@/lib/notifications");
    await notifyAdmin(
      `📅 *New Leave Request*\n\nAgent: *${agentName}*\nDates: ${startDate} to ${endDate}\nReason: ${reason}`,
      "info"
    );

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
