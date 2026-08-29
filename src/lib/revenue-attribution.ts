import { SupabaseClient } from "@supabase/supabase-js";

// Only task types that plausibly CAUSED the order, not routine follow-ups
// servicing one that was already happening (review, cod_verify,
// transit_update, welcome_call, etc.). recovery = converted an abandoned
// cart into a real order; reorder = drove a repeat purchase; win_back =
// brought a churned customer back to buy again.
const REVENUE_ELIGIBLE_TASK_TYPES = new Set(["recovery", "reorder", "win_back"]);

/**
 * Credits an order's value to the agent whose task closing plausibly drove
 * it - exactly once per order, ever. order_id is the table's primary key,
 * so a second call for the same order (same or a different agent/task,
 * e.g. a review-call task closed later on an order a reorder call already
 * converted) is a harmless no-op via onConflict, not a second credit.
 *
 * Call this from the single real task-completion endpoint
 * (api/tasks/[id]/[action], action "complete") - not from client code -
 * so every completion path attributes the same way with no way to bypass it.
 */
export async function attributeOrderRevenue(
  supabase: SupabaseClient,
  params: { orderId: string | null | undefined; agentId: string | null | undefined; taskId: string; taskType: string }
): Promise<void> {
  const { orderId, agentId, taskId, taskType } = params;
  if (!orderId || !agentId) return;
  if (!REVENUE_ELIGIBLE_TASK_TYPES.has(taskType)) return;

  const { data: order } = await supabase.from("orders").select("total_price").eq("id", orderId).maybeSingle();
  if (!order) return;

  const { error } = await supabase.from("order_revenue_attribution").upsert(
    {
      order_id: orderId,
      agent_id: agentId,
      task_id: taskId,
      task_type: taskType,
      amount: order.total_price || 0,
    },
    { onConflict: "order_id", ignoreDuplicates: true }
  );
  if (error) console.error(`Revenue attribution failed for order ${orderId}:`, error.message);
}
