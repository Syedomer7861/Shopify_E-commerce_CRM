import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getSupabase() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export async function POST(req: NextRequest) {
  const supabase = getSupabase();
  const yesterday = new Date(Date.now() - 86400000).toISOString();

  const SETTINGS_ID = "00000000-0000-0000-0000-000000000000";

  // 1. Get Settings
  const { data: settings } = await supabase
    .from("settings")
    .select("whatsapp_admin_phone, whatsapp_bridge_url, whatsapp_send_time")
    .eq("id", SETTINGS_ID)
    .single();

  if (!settings?.whatsapp_admin_phone) return NextResponse.json({ error: "No admin phone set" });

  // Time-based blackout check (Only for Admin Digest)
  const force = req.nextUrl.searchParams.get("force") === "true";
  if (settings.whatsapp_send_time && !force) {
    const now = new Date();
    const currentFormattedTime = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
    if (currentFormattedTime < settings.whatsapp_send_time.substring(0, 5)) {
      return NextResponse.json({ skipped: true, reason: `Admin digest scheduled for ${settings.whatsapp_send_time}. Current: ${currentFormattedTime}` });
    }
  }

  // 2. Fetch Stats
  const { data: orders } = await supabase.from("orders").select("total_price").gte("ordered_at", yesterday);
  const { data: calls } = await supabase.from("call_logs").select("outcome").gte("called_at", yesterday);
  const { data: pending } = await supabase.from("tasks").select("id").eq("status", "pending");

  const revenue = (orders || []).reduce((s, o) => s + (Number(o.total_price) || 0), 0);
  const callCount = calls?.length || 0;
  const successCount = calls?.filter(c => c.outcome === "done").length || 0;

  // 2.2 Today's Tasks Summary (New)
  const today = new Date().toISOString().split("T")[0];
  const { data: todayTasks } = await supabase
    .from("tasks")
    .select("task_type, customer:customers(name)")
    .eq("due_date", today)
    .eq("status", "pending");

  const taskList = (todayTasks || []).slice(0, 10).map((t: any) => `• ${t.customer.name} (${t.task_type})`).join("\n");
  const taskCount = todayTasks?.length || 0;

  const message = `📊 *Daily Digest – CureForever*\n\n` +
    `📦 *Orders*: ${orders?.length || 0}\n` +
    `💰 *Revenue*: ₹${revenue.toLocaleString()}\n` +
    `📞 *Calls Made*: ${callCount}\n` +
    `✅ *Successful*: ${successCount}\n` +
    `⌛ *Total Pending*: ${pending?.length || 0}\n\n` +
    `📅 *Tasks for Today (${taskCount})*:\n${taskList || "No tasks scheduled for today."}\n` +
    `${taskCount > 10 ? "_...and " + (taskCount - 10) + " more._\n" : ""}\n` +
    `Have a productive day! 💊`;

  // 3. Send via Bridge
  const bridgeUrl = settings.whatsapp_bridge_url || "http://localhost:3000";
  try {
    const res = await fetch(`${bridgeUrl}/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: settings.whatsapp_admin_phone, message }),
    });

    const result = await res.json();
    
    if (!res.ok || !result.ok) {
      throw new Error(result.error || `Bridge returned ${res.status}`);
    }

    return NextResponse.json({ sent: true, revenue, calls: callCount });
  } catch (err: any) {
    console.error("Digest send error:", err.message);
    return NextResponse.json({ 
      sent: false, 
      error: err.message.includes("503") ? "WhatsApp Bridge not authenticated (QR Pending)" : err.message 
    }, { status: 500 });
  }
}
