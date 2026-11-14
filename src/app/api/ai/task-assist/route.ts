import { NextRequest, NextResponse } from "next/server";
import { memberScope } from "@/lib/auth-utils";
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
  const scope = await memberScope(req);
  if (scope.error) return scope.error;

  const supabase = getServiceSupabase(req);
  // sentiment/is_urgent aren't real tasks columns (no migration ever added
  // them - see the dead escalation code in api/webhooks/whatsapp/route.ts),
  // so they're accepted from the caller like rtoProbability rather than
  // selected from the DB.
  const { taskId, mode, disposition, rtoProbability, sentiment, isUrgent, agentName, agentId } = await req.json();

  if (!taskId || !["battle_script", "call_note", "upsell"].includes(mode)) {
    return NextResponse.json({ error: "taskId and a valid mode are required" }, { status: 400 });
  }

  try {
    const { data: task, error: taskErr } = await supabase
      .from("tasks")
      .select("org_id, task_type, metadata, customer:customers!inner(name, segment), order:orders(order_number, total_price, delivery_status, line_items)")
      .eq("id", taskId)
      .eq(scope.orgId ? "org_id" : "id", scope.orgId ?? taskId)
      .maybeSingle();

    if (taskErr) throw new Error(`Task lookup failed: ${taskErr.message}`);
    if (!task) throw new Error("Task not found");

    const customer = Array.isArray(task.customer) ? task.customer[0] : task.customer;
    const order = Array.isArray(task.order) ? task.order[0] : task.order;
    const firstName = (customer?.name || "there").split(" ")[0];
    const product = order?.line_items?.[0]?.name || "your order";
    const aiCache = task.metadata?.ai_cache || {};

    if (mode === "upsell") return await handleUpsell(supabase, taskId, task.org_id, task.metadata, aiCache, order, product);

    // Battle script is cached per (task, agent) - the greeting names the
    // calling agent, so a cached script only reuses cleanly for the same
    // agent reopening the same task, not for a different agent. This is
    // what turns a repeat open of the same task from a several-second AI
    // call into an instant response.
    if (mode === "battle_script" && aiCache.battle_script && aiCache.battle_script_agent_id === agentId) {
      return NextResponse.json({ text: aiCache.battle_script, isMock: false, cached: true });
    }

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
    const greetingInstruction = agentName
      ? `Start with a proper greeting introducing yourself by name and company - e.g. "Hello ${firstName === "there" ? "sir/ma'am" : firstName}, this is ${agentName} calling from CureForever regarding your order..."`
      : `No agent name was given - do NOT invent one. Start with a proper greeting introducing yourself as a member of the CureForever team (no personal name), e.g. "Hello ${firstName === "there" ? "sir/ma'am" : firstName}, this is the CureForever team reaching out regarding your order..."`;
    const prompt = mode === "battle_script"
      ? `You are ${agentName || "a CureForever team member"}, a sales/retention rep for "CureForever", a premium wellness brand, about to call or WhatsApp ${firstName} about this task. Write ONE short, professional opening (under 45 words). ${greetingInstruction} - then get to the point for this specific task. Professional and courteous tone, never casual or salesy-desperate. Match urgency/sentiment in word choice, not in dropping the greeting. ${outputRules}\n\nContext:\n${context}`
      : `You are logging a customer support call outcome for "CureForever". Write a short internal call note (1-2 sentences, under 40 words) describing what happened, consistent with a "${disposition || "general"}" outcome for ${firstName} regarding ${product}. ${outputRules}\n\nContext:\n${context}`;

    const result = await generateAiText(prompt);
    if (!result) return NextResponse.json({ text: null, isMock: true });

    if (mode === "battle_script") {
      await supabase.from("tasks").update({
        metadata: { ...task.metadata, ai_cache: { ...aiCache, battle_script: result.text, battle_script_agent_id: agentId } },
      }).eq("id", taskId);
    }

    return NextResponse.json({ text: result.text, isMock: false, provider: result.provider });
  } catch (e: any) {
    console.error("task-assist endpoint error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

async function handleUpsell(supabase: any, taskId: string, orgId: string, taskMetadata: any, aiCache: any, order: any, currentProduct: string) {
  // Unlike battle_script, upsell picks aren't tied to a specific agent -
  // the same task always gets the same real product-pairing answer, so
  // this is safe to reuse for any agent who reopens the task.
  if (aiCache.upsell) {
    return NextResponse.json({ suggestions: aiCache.upsell, isMock: false, cached: true });
  }

  const { data: catalog } = await supabase
    .from("product_catalog")
    .select("name, price, description, tags, product_type")
    .eq("org_id", orgId)
    .eq("active", true)
    .not("price", "is", null)
    .order("name")
    .limit(300);

  if (!catalog || catalog.length === 0) {
    return NextResponse.json({ suggestions: [], isMock: true, reason: "product catalog empty - run /api/cron/refresh-product-catalog" });
  }

  const cartNames = new Set(
    (order?.line_items || []).map((i: any) => String(i.name || i.title || "").toLowerCase())
  );
  const candidates = catalog.filter((p: any) => !cartNames.has(p.name.toLowerCase()));

  const catalogList = candidates
    .map((p: any) => `- ${p.name} | Rs.${p.price} | ${p.product_type || ""} ${(p.tags || []).join(", ")} | ${(p.description || "").slice(0, 120)}`)
    .join("\n");

  const prompt = `You are a product-pairing expert for "CureForever", a wellness/supplement brand. A customer is buying: "${currentProduct}".

Here is CureForever's REAL current product catalog (name | price | type/tags | description) - you may ONLY suggest products from this exact list, using the EXACT name and price shown:
${catalogList}

Pick 1-3 products from that list that genuinely complement "${currentProduct}" (real health/use-case synergy, not random). For each, give a short customer-facing reason and a natural one-line upsell script an agent could say. Keep reason and script each under 25 words.

Your entire response must be nothing but the raw JSON array below - the first character must be [ and the last must be ]. No markdown fences, no preamble like "Here are...", no commentary before or after.
[{"product_name":"...","reason":"...","script":"..."}]`;

  const result = await generateAiText(prompt, 3000);
  if (!result) return NextResponse.json({ suggestions: [], isMock: true });

  let parsed: any[] = [];
  try {
    // Models routinely wrap the array in prose or ```json fences despite
    // being told not to - pull out the first [...] block rather than
    // trusting the whole response to be bare JSON.
    const match = result.text.match(/\[[\s\S]*\]/);
    parsed = JSON.parse(match ? match[0] : result.text);
  } catch {
    console.error("upsell: AI response wasn't valid JSON:", result.text.slice(0, 500));
    return NextResponse.json({ suggestions: [], isMock: true, reason: "AI response wasn't valid JSON" });
  }

  // Never trust the model's price - resolve every suggestion back to the
  // real catalog row by name so a hallucinated or drifted price/product can
  // never reach an agent's screen.
  const byName = new Map<string, any>(candidates.map((p: any) => [p.name.toLowerCase(), p]));
  const suggestions = (Array.isArray(parsed) ? parsed : [])
    .map((s: any) => {
      const real = byName.get(String(s.product_name || "").toLowerCase());
      if (!real) return null;
      return { product_name: real.name, price: real.price, reason: s.reason || "", script: s.script || "" };
    })
    .filter(Boolean)
    .slice(0, 3);

  if (suggestions.length > 0) {
    await supabase.from("tasks").update({
      metadata: { ...taskMetadata, ai_cache: { ...aiCache, upsell: suggestions } },
    }).eq("id", taskId);
  }

  return NextResponse.json({ suggestions, isMock: false, provider: result.provider });
}
