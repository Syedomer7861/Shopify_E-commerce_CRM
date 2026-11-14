import { NextRequest, NextResponse } from "next/server";
import { requireOwnerOrInternal } from "@/lib/auth-utils";
import { createAdminClient } from "@/lib/supabase";

// ONE-TIME data repair - see the commit message for src/lib/sync-logic.ts's
// duplicate-order fix for the root cause. duplicate_order_pairs()
// (migrations/20260827f_duplicate_order_pairs.sql) returns every
// order_number that currently has exactly one "shopify" row and one
// "shiprocket" row - confirmed live: 100% of the 2,592 duplicate groups
// match that exact shape, no guessing needed about which row is which.
//
// The Shopify-sourced row is kept as canonical (it has the real
// shopify_order_id and came from Shopify's own order data). Useful
// shipping fields Shiprocket tracks better are merged in from the
// duplicate only where the canonical row doesn't already have them.
// tasks.order_id is FK CASCADE on orders - repointing every task off the
// duplicate BEFORE deleting it is what stops that delete from silently
// destroying real task history.
export const maxDuration = 60;
const BATCH_LIMIT = 200; // pure DB work, no external API calls - can go much bigger than tonight's Shopify-verified repair

export async function POST(req: NextRequest) {
  const unauthorized = await requireOwnerOrInternal(req);
  if (unauthorized) return unauthorized;

  const supabase = createAdminClient();
  const onlyOrderNumber = req.nextUrl.searchParams.get("orderNumber");

  let pairs: { canonical_id: string; duplicate_id: string; order_number: string }[] | null;
  if (onlyOrderNumber) {
    const { data, error } = await supabase.rpc("duplicate_order_pairs", { limit_n: 10000 });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    pairs = (data || []).filter((p: any) => p.order_number === onlyOrderNumber);
  } else {
    const { data, error } = await supabase.rpc("duplicate_order_pairs", { limit_n: BATCH_LIMIT });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    pairs = data;
  }

  if (!pairs?.length) return NextResponse.json({ scanned: 0, merged: 0, failed: 0 });

  let merged = 0, failed = 0;

  for (const pair of pairs) {
    try {
      const { data: canonical, error: cErr } = await supabase
        .from("orders")
        .select("id, delivery_status, delivered_at, tracking_number, courier_name")
        .eq("id", pair.canonical_id)
        .single();
      const { data: duplicate, error: dErr } = await supabase
        .from("orders")
        .select("id, delivery_status, delivered_at, tracking_number, courier_name")
        .eq("id", pair.duplicate_id)
        .single();

      if (cErr || dErr || !canonical || !duplicate) {
        failed++;
        continue;
      }

      const merge: any = {};
      // Prefer a non-pending shipping status over pending, matching the
      // reconciliation convention already established elsewhere in
      // sync-logic.ts - Shiprocket tracks real shipment progress, Shopify
      // doesn't.
      if ((!canonical.delivery_status || canonical.delivery_status === "pending") && duplicate.delivery_status && duplicate.delivery_status !== "pending") {
        merge.delivery_status = duplicate.delivery_status;
      }
      if (!canonical.delivered_at && duplicate.delivered_at) merge.delivered_at = duplicate.delivered_at;
      if (!canonical.tracking_number && duplicate.tracking_number) merge.tracking_number = duplicate.tracking_number;
      if (!canonical.courier_name && duplicate.courier_name) merge.courier_name = duplicate.courier_name;

      if (Object.keys(merge).length > 0) {
        const { error: mErr } = await supabase.from("orders").update(merge).eq("id", canonical.id);
        if (mErr) { failed++; continue; }
      }

      // Repoint before delete - tasks.order_id is FK CASCADE, so an
      // un-repointed task would be silently destroyed by the delete below.
      // tasks has a UNIQUE(order_id, task_type) constraint - if the
      // canonical order already has a task of a type the duplicate also
      // has, repointing would collide. The canonical's copy is the one
      // that stays (it's the real order going forward); the duplicate's
      // same-type task is redundant and gets dropped instead.
      const [{ data: canonicalTasks }, { data: duplicateTasks }] = await Promise.all([
        supabase.from("tasks").select("task_type").eq("order_id", canonical.id),
        supabase.from("tasks").select("id, task_type").eq("order_id", duplicate.id),
      ]);
      const canonicalTaskTypes = new Set((canonicalTasks || []).map((t) => t.task_type));
      const collidingIds = (duplicateTasks || []).filter((t) => canonicalTaskTypes.has(t.task_type)).map((t) => t.id);

      if (collidingIds.length > 0) {
        const { error: dropErr } = await supabase.from("tasks").delete().in("id", collidingIds);
        if (dropErr) { failed++; continue; }
      }
      const { error: taskErr } = await supabase.from("tasks").update({ order_id: canonical.id }).eq("order_id", duplicate.id);
      if (taskErr) { failed++; continue; }

      // workflow_instances.order_id is FK SET NULL - repointing preserves
      // the link instead of losing it.
      await supabase.from("workflow_instances").update({ order_id: canonical.id }).eq("order_id", duplicate.id);

      const { error: delErr } = await supabase.from("orders").delete().eq("id", duplicate.id);
      if (delErr) { failed++; continue; }

      merged++;
    } catch (err: any) {
      console.error(`Failed to merge duplicate order pair (order ${pair.order_number}):`, err.message);
      failed++;
    }
  }

  return NextResponse.json({ scanned: pairs.length, merged, failed });
}

export const GET = POST;
