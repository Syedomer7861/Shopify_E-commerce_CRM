import { SupabaseClient } from "@supabase/supabase-js";

// Only task types that plausibly CAUSED the order, not routine follow-ups
// servicing one that was already happening (review, cod_verify,
// transit_update, welcome_call, etc.). recovery = converted an abandoned
// cart into a real order; reorder = drove a repeat purchase; win_back =
// brought a churned customer back to buy again.
const REVENUE_ELIGIBLE_TASK_TYPES = new Set(["recovery", "reorder", "win_back"]);

// A recovery task exists BEFORE any order does - it's keyed on
// abandoned_cart_id, and tasks.order_id stays null for its whole
// lifecycle (confirmed live: an agent's 199 completed recovery tasks all
// showed no linked order). Without this, "recovery" being revenue-
// eligible was theoretical - the type most central to what a recovery
// task IS could structurally never attribute anything.
//
// Same heuristic api/sync/fastrr-import.ts already uses in production to
// decide a cart converted ("does this customer have an order placed
// after the cart was abandoned") - not new risk, an existing accepted
// one. Bounded to 45 days (matching the INACTIVE_DAYS threshold used
// elsewhere for segment classification) so a customer's unrelated
// purchase months later doesn't get misread as this recovery's result.
const CART_CONVERSION_WINDOW_DAYS = 45;

async function resolveCartConversionOrderId(
  supabase: SupabaseClient,
  customerId: string,
  abandonedCartId: string
): Promise<string | null> {
  const { data: cart } = await supabase
    .from("abandoned_carts")
    .select("abandoned_at")
    .eq("id", abandonedCartId)
    .maybeSingle();
  if (!cart?.abandoned_at) return null;

  const windowEnd = new Date(new Date(cart.abandoned_at).getTime() + CART_CONVERSION_WINDOW_DAYS * 86_400_000).toISOString();

  const { data: order } = await supabase
    .from("orders")
    .select("id")
    .eq("customer_id", customerId)
    .gt("ordered_at", cart.abandoned_at)
    .lte("ordered_at", windowEnd)
    .order("ordered_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  return order?.id || null;
}

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
  params: {
    orderId: string | null | undefined;
    agentId: string | null | undefined;
    taskId: string;
    taskType: string;
    customerId?: string | null;
    abandonedCartId?: string | null;
  }
): Promise<void> {
  const { agentId, taskId, taskType, customerId, abandonedCartId } = params;
  let { orderId } = params;
  if (!agentId) return;
  if (!REVENUE_ELIGIBLE_TASK_TYPES.has(taskType)) return;

  // A recovery task has no order_id of its own - resolve whatever order
  // the underlying cart actually turned into, if any.
  if (!orderId && taskType === "recovery" && customerId && abandonedCartId) {
    orderId = await resolveCartConversionOrderId(supabase, customerId, abandonedCartId);
  }
  if (!orderId) return;

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
