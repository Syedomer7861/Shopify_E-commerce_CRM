import { NextRequest, NextResponse } from "next/server";
import { requireInternal } from "@/lib/auth-utils";
import { createAdminClient } from "@/lib/supabase";
import { fetchUnmaskedFromShopify } from "@/lib/shopify-unmask";

// ONE-TIME data repair, not a recurring cron - see the commit message for
// src/app/api/webhooks/shiprocket/route.ts's identity-resolution fix for
// the root cause. These 10 customer records were confirmed live to each
// have several-to-dozens of genuinely distinct real orders (different
// order numbers, different products, spread across full days) merged
// onto them, because the webhook matched/wrote against a stale masked
// phone instead of the real per-order one. That fix stops NEW merges;
// this route un-merges the ones that already happened, order by order,
// only ever acting on a live Shopify re-verification - never guessed or
// bulk-assumed.
const VICTIM_CUSTOMER_IDS = [
  "689b58bc-9e62-44d1-a28d-7b1f05d549f7", // Kamesh Raj
  "ef48a0d6-c80c-41cc-adf8-d413bb6f909c", // Basant Damor
  "56c1441c-f370-46c8-a731-19bf26214ca3", // SYED FARRUKH
  "b0fed2a3-5160-4179-b33a-b8edef15399f", // Sharmistha
  "2961f9d8-781d-4efd-88c7-3a8322791571", // Mariam guria
  "1986d7d2-0bad-4113-93d6-ddc56e3a1845", // akash rana
  "499d6196-c3e0-4fb5-97b9-79e7c077f077", // akash rana (phone: unknown)
  "a0852866-57db-424a-9fb7-c87040e5df82", // Ram
  "a605b619-d43d-4d38-88c2-6b284338d20d", // Mariam Guria
  "27fde551-605b-4346-bb00-ab9e6906e3f4", // Vaibhav Jain
];

export const maxDuration = 60;
const BATCH_LIMIT = 25; // Shopify API calls are the bottleneck, not DB - keep small per invocation

export async function POST(req: NextRequest) {
  const unauthorized = await requireInternal(req);
  if (unauthorized) return unauthorized;

  const supabase = createAdminClient();
  const onlyOrderId = req.nextUrl.searchParams.get("orderId");

  let query = supabase
    .from("orders")
    .select("id, order_number, customer_id, custom_meta")
    .in("customer_id", VICTIM_CUSTOMER_IDS)
    .eq("source", "shiprocket")
    .order("id");

  if (onlyOrderId) {
    query = query.eq("id", onlyOrderId);
  } else {
    // custom_meta->>identity_repair_checked marks orders already verified
    // this run, whether or not they needed fixing - guarantees each call
    // makes real progress instead of re-checking the same ones forever.
    query = query.is("custom_meta->identity_repair_checked", null).limit(BATCH_LIMIT);
  }

  const { data: orders, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!orders?.length) return NextResponse.json({ scanned: 0, fixed: 0, unresolved: 0, unchanged: 0 });

  // Cache the victim customers' current phones once, to compare against
  // Shopify's answer per order.
  const { data: victims } = await supabase.from("customers").select("id, phone").in("id", VICTIM_CUSTOMER_IDS);
  const victimPhones = new Map((victims || []).map(v => [v.id, v.phone]));

  let fixed = 0, unresolved = 0, unchanged = 0;

  for (const order of orders) {
    const result = await fetchUnmaskedFromShopify(supabase, order.order_number);
    const checkedMeta = { ...(order.custom_meta || {}), identity_repair_checked: true };

    if (!result?.phone) {
      unresolved++;
      await supabase.from("orders").update({ custom_meta: checkedMeta }).eq("id", order.id);
      continue;
    }

    const currentPhone = victimPhones.get(order.customer_id);
    if (result.phone === currentPhone) {
      // Genuinely belongs to this customer - order is fine, but its
      // tasks can still carry a customer_id from an earlier, separate
      // merge event (see the comment below on the fixed path) - sync
      // those too even though the order itself needed no change.
      unchanged++;
      await supabase.from("orders").update({ custom_meta: checkedMeta }).eq("id", order.id);
      await supabase.from("tasks").update({ customer_id: order.customer_id }).eq("order_id", order.id).neq("customer_id", order.customer_id);
      continue;
    }

    // Confirmed distinct real customer - find or create by their real phone.
    const { data: correctCustomer } = await supabase
      .from("customers")
      .upsert({ name: result.name || "Shiprocket Customer", phone: result.phone }, { onConflict: "phone" })
      .select("id")
      .single();

    if (!correctCustomer) {
      unresolved++;
      await supabase.from("orders").update({ custom_meta: checkedMeta }).eq("id", order.id);
      continue;
    }

    await supabase.from("orders").update({ customer_id: correctCustomer.id, custom_meta: checkedMeta }).eq("id", order.id);
    // Tasks on this order can carry a customer_id from an even earlier,
    // separate historical merge event (confirmed live: one order had
    // three different customer_ids across its own tasks, none matching
    // what we just corrected order.customer_id FROM). Unconditionally
    // re-syncing every task on this order_id, not just ones matching the
    // one wrong value we knew about, actually converges them all.
    await supabase.from("tasks").update({ customer_id: correctCustomer.id }).eq("order_id", order.id).neq("customer_id", correctCustomer.id);
    fixed++;
  }

  return NextResponse.json({ scanned: orders.length, fixed, unresolved, unchanged });
}

export const GET = POST;
