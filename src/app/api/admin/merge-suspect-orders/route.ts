import { NextRequest, NextResponse } from "next/server";
import { requireInternal } from "@/lib/auth-utils";
import { createAdminClient } from "@/lib/supabase";
import { isSuspectOrderId, findMergeCandidate, type DedupOrder } from "@/lib/order-dedup";

// ONE-TIME data repair for the ghost orders the "FASTTR FIX" fallback in
// webhooks/shiprocket/route.ts used to create (see that file's comment for
// the root cause, fixed in the same commit as this route). A Fastrr
// order_placed event with no real order id fell back to using Fastrr's own
// cart_id as shopify_order_id AND order_number - the real Shopify webhook
// then created a second, correct row under the real numeric id, since
// nothing about the ghost row could ever match it.
//
// Reuses the same customer+line-item+72h matching Phase 1d of
// /api/sync/heal already proved out (src/lib/order-dedup.ts), just scoped
// to a dedicated route so it isn't competing for budget with heal's other
// unrelated customer-merge phases.
export const maxDuration = 60;
const BATCH_LIMIT = 50; // customers per call, not orders - each pulls its full order list

export async function POST(req: NextRequest) {
  const unauthorized = await requireInternal(req);
  if (unauthorized) return unauthorized;

  const supabase = createAdminClient();
  const onlyOrderId = req.nextUrl.searchParams.get("orderId");

  // Suspect orders: shopify_order_id has a non-digit character (a real
  // Shopify id is always numeric). Regex filter runs server-side so we
  // never pull the whole orders table just to find ~100 rows.
  let suspectQuery = supabase
    .from("orders")
    .select("id, customer_id, shopify_order_id, total_price, ordered_at, line_items, custom_meta")
    .not("shopify_order_id", "is", null)
    .filter("shopify_order_id", "match", "[^0-9]")
    .order("id");

  if (onlyOrderId) {
    suspectQuery = supabase
      .from("orders")
      .select("id, customer_id, shopify_order_id, total_price, ordered_at, line_items, custom_meta")
      .eq("id", onlyOrderId);
  } else {
    suspectQuery = suspectQuery.is("custom_meta->dedup_checked", null).limit(500);
  }

  const { data: allSuspects, error: suspectErr } = await suspectQuery;
  if (suspectErr) return NextResponse.json({ error: suspectErr.message }, { status: 500 });
  if (!allSuspects?.length) return NextResponse.json({ scanned: 0, merged: 0, ambiguous: 0, failed: 0 });

  // Batch by distinct customer, not by suspect count - each customer needs
  // one extra query for their full order list regardless of how many
  // suspects they have.
  const customerIds = Array.from(new Set(allSuspects.map(s => s.customer_id).filter(Boolean)));
  const batchCustomerIds = onlyOrderId ? customerIds : customerIds.slice(0, BATCH_LIMIT);
  const suspects = allSuspects.filter(s => batchCustomerIds.includes(s.customer_id));

  let merged = 0, ambiguous = 0, failed = 0;

  for (const customerId of batchCustomerIds) {
    try {
      const { data: custOrders, error: ordersErr } = await supabase
        .from("orders")
        .select("id, shopify_order_id, ordered_at, line_items")
        .eq("customer_id", customerId);
      if (ordersErr || !custOrders) { failed++; continue; }

      const clean: DedupOrder[] = custOrders.filter(o => o.shopify_order_id && !isSuspectOrderId(o.shopify_order_id));
      const customerSuspects = suspects.filter(s => s.customer_id === customerId);

      for (const suspect of customerSuspects) {
        try {
          const golden = findMergeCandidate(suspect as DedupOrder, clean);

          if (!golden) {
            ambiguous++;
            await supabase.from("orders").update({
              custom_meta: { ...(suspect.custom_meta || {}), dedup_checked: true },
            }).eq("id", suspect.id);
            continue;
          }

          // Same UNIQUE(order_id, task_type) collision as
          // merge-duplicate-orders: drop the suspect's same-type task
          // before repointing the rest onto golden.
          const [{ data: goldenTasks }, { data: suspectTasks }] = await Promise.all([
            supabase.from("tasks").select("task_type").eq("order_id", golden.id),
            supabase.from("tasks").select("id, task_type").eq("order_id", suspect.id),
          ]);
          const goldenTaskTypes = new Set((goldenTasks || []).map(t => t.task_type));
          const collidingIds = (suspectTasks || []).filter(t => goldenTaskTypes.has(t.task_type)).map(t => t.id);
          if (collidingIds.length > 0) {
            await supabase.from("tasks").delete().in("id", collidingIds);
          }

          const { error: taskErr } = await supabase.from("tasks").update({ order_id: golden.id }).eq("order_id", suspect.id);
          if (taskErr) { failed++; continue; }
          await supabase.from("workflow_instances").update({ order_id: golden.id }).eq("order_id", suspect.id);

          const { error: delErr } = await supabase.from("orders").delete().eq("id", suspect.id);
          if (delErr) { failed++; continue; }

          merged++;
        } catch (err: any) {
          console.error(`Failed to merge suspect order ${suspect.id}:`, err.message);
          failed++;
        }
      }
    } catch (err: any) {
      console.error(`Failed processing customer ${customerId}:`, err.message);
      failed++;
    }
  }

  return NextResponse.json({ scanned: suspects.length, merged, ambiguous, failed });
}

export const GET = POST;
