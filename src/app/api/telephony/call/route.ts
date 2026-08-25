import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { requireInternal } from "@/lib/auth-utils";
import { createAdminClient } from "@/lib/supabase";

// Every raw_call_logs row inserted here used to omit agent_id entirely, and
// nothing on this route (or elsewhere) ever transitions these rows to
// "completed" - the /api/calls/webhook "ended" event only closes rows it
// can match by agent_id, which was always null here. Every click-to-call
// via this route left a permanent "on call" ghost with no owner and no way
// to ever close it (found live: a phantom call from 3 months ago still
// showing as active in CallMonitor.tsx). Clearing any stale in_progress
// row for this agent before inserting the new one - same pattern the
// webhook route already uses on its "started" event - keeps at most one
// live entry per agent instead of accumulating orphans forever.
async function logOutboundCall(supabase: ReturnType<typeof createAdminClient>, agentId: string | null, customerPhone: string, taskId?: string | null) {
  if (agentId) {
    await supabase.from("raw_call_logs").delete().eq("agent_id", agentId).eq("status", "in_progress");
  }
  await supabase.from("raw_call_logs").insert({
    agent_id: agentId,
    customer_phone: customerPhone,
    task_id: taskId || null,
    status: "in_progress",
    start_time: new Date().toISOString(),
    recording_url: null
  });
}

export async function POST(req: Request) {
  const limited = rateLimit(req, "outbound-call", 30, 60000);
  if (limited) return limited;

  const unauthorized = await requireInternal(req);
  if (unauthorized) return unauthorized;

  try {
    const { customerPhone, taskId, agentPhoneOverride } = await req.json();

    if (!customerPhone) {
      return NextResponse.json({ ok: false, error: "Customer phone number is required" }, { status: 400 });
    }

    // 1. Check cookies for demo mode
    const cookieHeader = req.headers.get("cookie") || "";
    const isDemo = cookieHeader.includes("crm-demo-mode=true");

    if (isDemo) {
      return NextResponse.json({
        ok: true,
        message: "Demo Mode Call Initiated!",
        sid: "mock_call_sid_" + Math.random().toString(36).substring(7),
        provider: "demo"
      });
    }

    // 2. Fetch telephony settings
    const supabase = createAdminClient();
    const { data: settings, error: settingsError } = await supabase
      .from("settings")
      .select("*")
      .eq("id", "00000000-0000-0000-0000-000000000000")
      .maybeSingle();

    if (settingsError || !settings) {
      return NextResponse.json({ ok: false, error: "Failed to load telephony settings from database" }, { status: 500 });
    }

    const provider = settings.telephony_provider || "none";
    if (provider === "none") {
      return NextResponse.json({ ok: false, error: "No cloud telephony provider is configured in Settings" }, { status: 400 });
    }

    // 3. Resolve Agent Phone Number (and identity, for raw_call_logs below)
    let agentPhone = agentPhoneOverride;
    let agentId: string | null = null;

    if (!agentPhone) {
      // In a real session, we can verify the agent using user token
      // For now, let's try to get current user from session
      const authHeader = req.headers.get("Authorization");
      let userId: string | null = null;

      if (authHeader?.startsWith("Bearer ")) {
        const token = authHeader.substring(7);
        const { data: { user } } = await supabase.auth.getUser(token);
        userId = user?.id || null;
      }

      if (!userId) {
        // Fallback: check session from cookies or headers
        // Since we are server-side, let's query the last active profile or default to caller setting
        const { data: lastProfile } = await supabase
          .from("profiles")
          .select("id, phone")
          .eq("role", "agent")
          .eq("is_active", true)
          .limit(1)
          .maybeSingle();
        agentPhone = lastProfile?.phone;
        agentId = lastProfile?.id || null;
      } else {
        const { data: profile } = await supabase
          .from("profiles")
          .select("id, phone")
          .eq("id", userId)
          .maybeSingle();
        agentPhone = profile?.phone;
        agentId = profile?.id || null;
      }
    }

    if (!agentPhone) {
      return NextResponse.json({ 
        ok: false, 
        error: "Agent phone number is missing. Please set your phone number in your Profile/settings." 
      }, { status: 400 });
    }

    // Standardize phone format (remove spaces, dashes, ensure prefix)
    const formattedAgentPhone = agentPhone.replace(/\D/g, "").replace(/^0+/, "");
    const formattedCustomerPhone = customerPhone.replace(/\D/g, "").replace(/^0+/, "");

    const finalAgentPhone = formattedAgentPhone.length === 10 ? `+91${formattedAgentPhone}` : `+${formattedAgentPhone}`;
    const finalCustomerPhone = formattedCustomerPhone.length === 10 ? `+91${formattedCustomerPhone}` : `+${formattedCustomerPhone}`;

    // 4. Place Outbound Click-to-Call
    if (provider === "demo") {
      // Log Demo Call
      try {
        await logOutboundCall(supabase, agentId, finalCustomerPhone, taskId);
      } catch (err) {
        console.error("Failed to log Demo call:", err);
      }

      return NextResponse.json({
        ok: true,
        message: "Simulated Call Initiated (Demo Mode)",
        sid: "mock_call_sid_" + Math.random().toString(36).substring(7),
        provider: "demo"
      });
    }
    if (provider === "twilio") {
      const accountSid = settings.twilio_account_sid;
      const authToken = settings.twilio_auth_token;
      const callerId = settings.twilio_caller_id;

      if (!accountSid || !authToken || !callerId) {
        return NextResponse.json({ ok: false, error: "Twilio credentials are incomplete in Settings" }, { status: 400 });
      }

      // Use Twilio Echo/Forward TwiML. When agent answers, Twilio dials the customer.
      const twimlUrl = `https://twimlets.com/forward?PhoneNumber=${encodeURIComponent(finalCustomerPhone)}`;
      const basicAuth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");

      const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls.json`, {
        method: "POST",
        headers: {
          "Authorization": `Basic ${basicAuth}`,
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: new URLSearchParams({
          From: callerId,
          To: finalAgentPhone,
          Url: twimlUrl
        })
      });

      const data = await response.json();
      if (!response.ok) {
        return NextResponse.json({ ok: false, error: data.message || "Twilio call request failed" }, { status: response.status });
      }

      // 5. Audit Log standard
      try {
        await logOutboundCall(supabase, agentId, finalCustomerPhone, taskId);
      } catch (err) {
        console.error("Failed to log click-to-call in raw_call_logs:", err);
      }

      return NextResponse.json({ ok: true, sid: data.sid, provider: "twilio" });
    }

    if (provider === "exotel") {
      const exotelSid = settings.exotel_sid;
      const exotelToken = settings.exotel_token;
      const callerId = settings.exotel_caller_id;

      if (!exotelSid || !exotelToken || !callerId) {
        return NextResponse.json({ ok: false, error: "Exotel credentials are incomplete in Settings" }, { status: 400 });
      }

      const basicAuth = Buffer.from(`${exotelSid}:${exotelToken}`).toString("base64");
      const response = await fetch(`https://api.exotel.com/v1/Accounts/${exotelSid}/Calls/connect.json`, {
        method: "POST",
        headers: {
          "Authorization": `Basic ${basicAuth}`,
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: new URLSearchParams({
          From: finalAgentPhone,
          To: finalCustomerPhone,
          CallerId: callerId
        })
      });

      const text = await response.text();
      if (!response.ok) {
        return NextResponse.json({ ok: false, error: "Exotel call request failed: " + text }, { status: response.status });
      }

      // Log Exotel Call
      try {
        await logOutboundCall(supabase, agentId, finalCustomerPhone, taskId);
      } catch (err) {
        console.error("Failed to log Exotel call:", err);
      }

      return NextResponse.json({ ok: true, message: "Exotel call placed successfully", provider: "exotel" });
    }

    return NextResponse.json({ ok: false, error: "Unsupported provider configuration" }, { status: 400 });
  } catch (err: any) {
    console.error("Click to Call API error:", err);
    return NextResponse.json({ ok: false, error: err.message || "An unexpected error occurred" }, { status: 500 });
  }
}
