import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { hasInternalSecret } from "@/lib/auth-utils";
import { createServerClient } from "@/lib/supabase";
import { normalizePhone } from "@/lib/phone-utils";

export const dynamic = "force-dynamic";

/**
 * Poor Man's Cloud Telephony Webhook
 * Receives signals from MacroDroid (Android) or other automation bridges.
 */
export async function POST(req: NextRequest) {
  const limited = rateLimit(req, "calls-webhook", 300, 60000);
  if (limited) return limited;

  if (!hasInternalSecret(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServerClient();

  try {
    const payload = await req.json();
    const { 
      event, // 'started', 'ended'
      agent_email, 
      customer_phone, 
      task_id, 
      duration, 
      recording_url 
    } = payload;

    // 1. Resolve Agent
    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("email", agent_email)
      .single();

    if (!profile) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    // 2. Standardize Phone
    const phone = normalizePhone(customer_phone);

    // 3. Handle Events
    if (event === "started") {
      // Clear any stale in_progress calls
      await supabase.from("raw_call_logs")
        .delete()
        .eq("agent_id", profile.id)
        .eq("status", "in_progress");

      // Insert a new raw call log
      await supabase.from("raw_call_logs").insert({
        agent_id: profile.id,
        customer_phone: phone,
        task_id: task_id || null,
        status: "in_progress",
        start_time: new Date().toISOString()
      }); // Simple logic: one active call per agent

      // Update Profile Live State
      await supabase.from("profiles").update({
        live_state: {
          path: "/tasks",
          action: "on_call",
          entityId: task_id || null,
          timestamp: new Date().toISOString()
        }
      }).eq("id", profile.id);

    } else if (event === "ended") {
      // Update the call log
      const { data: activeCall } = await supabase
        .from("raw_call_logs")
        .select("id, start_time")
        .eq("agent_id", profile.id)
        .eq("status", "in_progress")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (activeCall) {
        const startTime = new Date(activeCall.start_time);
        const endTime = new Date();
        const durationSec = duration || Math.round((endTime.getTime() - startTime.getTime()) / 1000);

        await supabase.from("raw_call_logs").update({
          status: "completed",
          end_time: endTime.toISOString(),
          duration_seconds: durationSec,
          recording_url: recording_url || null
        }).eq("id", activeCall.id);
      }

      // Clear Profile Live State
      await supabase.from("profiles").update({
        live_state: null
      }).eq("id", profile.id);
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("[CALL-WEBHOOK] Error:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
