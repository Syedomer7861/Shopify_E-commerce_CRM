import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getSupabase() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

const SETTINGS_ID = "00000000-0000-0000-0000-000000000000";

export async function POST(req: NextRequest) {
  const { taskId, customMessage, mediaData, mimetype, filename } = await req.json();
  if (!taskId) return NextResponse.json({ error: "Missing taskId" }, { status: 400 });

  const supabase = getSupabase();

  try {
    // 1. Fetch Task, Customer, Order, Cart and Settings
    const { data: task, error: tErr } = await supabase
      .from("tasks")
      .select("*, customer:customers(*), order:orders(*), abandoned_cart:abandoned_carts(*)")
      .eq("id", taskId)
      .single();
    
    if (tErr || !task) throw tErr || new Error("Task not found");

    const { data: settings } = await supabase.from("settings").select("*").eq("id", SETTINGS_ID).single();
    if (!settings?.whatsapp_bridge_url) throw new Error("WhatsApp bridge not configured");

    const customer = task.customer;
    const order = task.order;
    const abandonedCart = task.abandoned_cart;
    let template = "";
    let message = "";
    let productStr = "your items";
    let link = "https://cureforever.in/cart";

    // 2. Select Template based on task type
    if (task.task_type === "review") {
      template = settings.whatsapp_review_template || "Hi {{name}} 👋, thank you for ordering {{product}}! How was your experience? We'd love to hear your feedback. 🌿\n\nPlease leave us a review here: https://search.google.com/local/writereview?placeid=ChIJv5_GsCGRyzsR2_y1wjbi3Ck";
      productStr = order?.line_items?.[0]?.name || order?.line_items?.[0]?.title || "your previous order";
    } else if (task.task_type === "reorder") {
      template = settings.whatsapp_reorder_template || "Hi {{name}}! It's been a while since your last {{product}} order. Time for a refill? 💊 Use code REFILL10 for 10% off!";
      productStr = order?.line_items?.[0]?.name || "your previous order";
    } else if (task.task_type === "recovery") {
      template = settings.whatsapp_recovery_template || "Hi {{name}} 👋, we noticed you left some items in your cart! 🛒 Can we help you complete your purchase? Use code RECOVER5 for 5% off! 🌿";
      productStr = abandonedCart?.line_items?.[0]?.name || abandonedCart?.line_items?.[0]?.title || "your items";
      link = abandonedCart?.custom_meta?.ABANDONLINK || customer.custom_meta?.ABANDONLINK || link;
    } else if (task.task_type === "final_followup") {
      template = settings.whatsapp_final_template || "Hi {{name}}, just checking in one last time regarding your {{product}} journey. We're here if you need anything! 🙏";
      productStr = order?.line_items?.[0]?.name || "your previous order";
    }

    // 3. Process Placeholders or use Custom Message
    if (customMessage) {
      message = customMessage;
    } else {
      message = template
        .replace(/{{name}}/g, customer.name || "there")
        .replace(/{{product}}/g, productStr)
        .replace(/{{abandon_link}}/g, link)
        .replace(/{{order_no}}/g, order?.order_number || "your order");
    }

    // 4. Send via Bridge
    const bridgeUrl = settings.whatsapp_bridge_url;
    const res = await fetch(`${bridgeUrl}/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        phone: customer.phone, 
        message, 
        mediaData, 
        mimetype, 
        filename 
      }),
    });

    const bridgeResult = await res.json();
    if (!res.ok || !bridgeResult.ok) throw new Error(bridgeResult.error || "Bridge failed to send message");

    // 5. Mark Task Done & Log
    await supabase.from("tasks").update({ status: "done", completed_at: new Date().toISOString() }).eq("id", taskId);
    await supabase.from("call_logs").insert({
      task_id: taskId,
      customer_id: customer.id,
      outcome: "whatsapp",
      note: `System (Manual Send Now): "${message}"`,
      agent_name: "Agent Overide"
    });

    return NextResponse.json({ ok: true, message: "Manual trigger successful" });

  } catch (err: any) {
    console.error("Manual send-queued error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
