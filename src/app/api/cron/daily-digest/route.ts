import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { getSystemSettings } from "@/lib/server-settings";

function getSupabase() {
  return createServerClient();
}

export async function POST(req: NextRequest) {
  const supabase = getSupabase();
  const now = new Date();
  const yesterday = new Date(now.getTime() - 86400000).toISOString();
  const todayDate = now.toISOString().split("T")[0];

  // 1. Get Settings
  const settings = await getSystemSettings(supabase);
  if (!settings?.whatsapp_admin_phone) return NextResponse.json({ error: "No admin phone set" });

  // Time-based blackout check (Only for Admin Digest)
  const force = req.nextUrl.searchParams.get("force") === "true";
  if (settings.whatsapp_send_time && !force) {
    const currentFormattedTime = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
    if (currentFormattedTime < settings.whatsapp_send_time.substring(0, 5)) {
      return NextResponse.json({ skipped: true, reason: `Admin digest scheduled for ${settings.whatsapp_send_time}. Current: ${currentFormattedTime}` });
    }
  }

  // 2. Fetch Strategic Stats
  // 💰 FINANCE & ATTRIBUTION
  const { data: orders } = await supabase.from("orders").select("total_price, attributed_instance_id").gte("ordered_at", yesterday);
  const totalRevenue = (orders || []).reduce((s, o) => s + (Number(o.total_price) || 0), 0);
  const waRevenue = (orders || []).filter(o => o.attributed_instance_id).reduce((s, o) => s + (Number(o.total_price) || 0), 0);
  const orderCount = orders?.length || 0;

  // 🏥 DATA HEALTH (SENTINEL)
  // Proxy: Customers updated in last 24h who no longer have masked phones
  const { count: healedCount } = await supabase
    .from("customers")
    .select("id", { count: 'exact', head: true })
    .gte("updated_at", yesterday)
    .not("phone", "ilike", "%x%")
    .not("phone", "ilike", "%_SR_%");

  // 📞 TEAM PERFORMANCE
  const { data: leaderboard } = await supabase
    .from("v_agent_performance")
    .select("name, total_calls, tasks_resolved")
    .order("total_calls", { ascending: false })
    .limit(3);

  // ⌛ TASK PIPELINE
  const { count: pendingTotal } = await supabase.from("tasks").select("id", { count: 'exact', head: true }).eq("status", "pending");
  const { data: todayTasks } = await supabase
    .from("tasks")
    .select("task_type, customer:customers(name)")
    .eq("due_date", todayDate)
    .eq("status", "pending");
  
  const reorderTasksCount = (todayTasks || []).filter(t => t.task_type === 'reorder').length;

  // 🏥 SYSTEM CHECK
  const bridgeUrl = settings.whatsapp_bridge_url || "http://localhost:3001";
  let bridgeStatus = "OFFLINE ❌";
  try {
    const bRes = await fetch(`${bridgeUrl}/status`);
    if (bRes.ok) bridgeStatus = "ONLINE ✅";
  } catch (e) {}

  // 3. Build Premium Message
  const taskList = (todayTasks || []).slice(0, 5).map((t: any) => `• ${t.customer?.name || "Customer"} (${t.task_type})`).join("\n");

  const message = 
    `📊 *CUREFOREVER INTELLIGENCE REPORT*\n` +
    `📅 _Period: Last 24 Hours_\n` +
    `──────────────────\n\n` +
    
    `💰 *FINANCE & GROWTH*\n` +
    `• New Orders: *${orderCount}* 📦\n` +
    `• Total Revenue: *₹${totalRevenue.toLocaleString()}*\n` +
    `• WA Recovered: *₹${waRevenue.toLocaleString()}* (Direct ROI) 📈\n\n` +
    
    `🏥 *SYSTEM & DATA HEALTH*\n` +
    `• Sentinel Healed: *${healedCount || 0} Records* ✨\n` +
    `• WhatsApp Bridge: *${bridgeStatus}*\n\n` +
    
    `🏆 *TEAM LEADERBOARD*\n` +
    (leaderboard?.map((a, i) => `${i+1}. ${a.name}: ${a.total_calls} Calls | ${a.tasks_resolved} Res`).join("\n") || "_No activity logged_") + "\n\n" +
    
    `📅 *TODAY'S PRIORITY PIPELINE*\n` +
    `• Total Waiting: *${pendingTotal || 0}*\n` +
    `• Active Courses: *${reorderTasksCount} Reorders* 💊\n\n` +
    
    `🔥 *TOP 5 TASKS TODAY*:\n` +
    (taskList || "_No pending priority tasks_") + "\n" +
    (todayTasks && todayTasks.length > 5 ? `_...and ${todayTasks.length - 5} more priority items._\n` : "") +
    
    `\n──────────────────\n` +
    `*Stay Focused. Stay Productive.* 🚀`;

  // 4. Send via Bridge
  try {
    const res = await fetch(`${bridgeUrl}/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: settings.whatsapp_admin_phone, message }),
    });

    const result = await res.json();
    if (!res.ok || !result.ok) throw new Error(result.error);

    return NextResponse.json({ sent: true, totalRevenue, waRevenue });
  } catch (err: any) {
    return NextResponse.json({ 
      sent: false, 
      error: err.message 
    }, { status: 500 });
  }
}
