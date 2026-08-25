import { NextRequest, NextResponse } from "next/server";
import { requireInternal } from "@/lib/auth-utils";
import { getServiceSupabase } from "@/lib/supabase";
import { generateAiText } from "@/lib/ai";

/**
 * Real AI generation for the two TaskCard panels that used to be static
 * hardcoded templates dressed up as "AI" ("Advanced AI Script" / the
 * auto-filled call outcome note). Returns isMock:true (with no text) if no
 * provider is configured or all three fail - the caller already has its own
 * local template fallback for that case, so this route doesn't duplicate it.
 */
export async function POST(req: NextRequest) {
  const unauthorized = await requireInternal(req);
  if (unauthorized) return unauthorized;

  const supabase = getServiceSupabase(req);
  // sentiment/is_urgent aren't real tasks columns (no migration ever added
  // them - see the dead escalation code in api/webhooks/whatsapp/route.ts),
  // so they're accepted from the caller like rtoProbability rather than
  // selected from the DB.
  const { taskId, mode, disposition, rtoProbability, sentiment, isUrgent } = await req.json();

  if (!taskId || !["battle_script", "call_note"].includes(mode)) {
    return NextResponse.json({ error: "taskId and a valid mode are required" }, { status: 400 });
  }

  try {
    const { data: task, error: taskErr } = await supabase
      .from("tasks")
      .select("task_type, customer:customers!inner(name, segment), order:orders(order_number, total_price, delivery_status, line_items)")
      .eq("id", taskId)
      .maybeSingle();

    if (taskErr) throw new Error(`Task lookup failed: ${taskErr.message}`);
    if (!task) throw new Error("Task not found");

    const customer = Array.isArray(task.customer) ? task.customer[0] : task.customer;
    const order = Array.isArray(task.order) ? task.order[0] : task.order;
    const firstName = (customer?.name || "there").split(" ")[0];
    const product = order?.line_items?.[0]?.name || "your order";

    const context = `
Customer: ${customer?.name || "Unknown"} (segment: ${customer?.segment || "one_time"})
Task type: ${task.task_type}
Product: ${product}
Order status: ${order?.delivery_status || "N/A"}
Sentiment: ${sentiment || "neutral"}
Urgent: ${isUrgent ? "yes" : "no"}
${typeof rtoProbability === "number" ? `RTO risk: ${rtoProbability}%` : ""}
`;

    const outputRules = "Output ONLY the final text itself - no quotes, no labels, no word counts, no draft numbers, no meta-commentary, no explanation of what you're doing.";
    const prompt = mode === "battle_script"
      ? `You are a sales/retention coach for "CureForever", a premium wellness brand. Write ONE short spoken call-opening line (under 45 words) an agent can read verbatim to ${firstName} for this task. Match tone to sentiment/urgency. ${outputRules}\n\nContext:\n${context}`
      : `You are logging a customer support call outcome for "CureForever". Write a short internal call note (1-2 sentences, under 40 words) describing what happened, consistent with a "${disposition || "general"}" outcome for ${firstName} regarding ${product}. ${outputRules}\n\nContext:\n${context}`;

    const result = await generateAiText(prompt);
    if (!result) return NextResponse.json({ text: null, isMock: true });

    return NextResponse.json({ text: result.text, isMock: false, provider: result.provider });
  } catch (e: any) {
    console.error("task-assist endpoint error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
