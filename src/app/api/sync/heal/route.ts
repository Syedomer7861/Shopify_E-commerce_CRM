import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase";
import { resolveUnmaskedPhone } from "@/lib/unmask-utils";
import { normalizePhone } from "@/lib/phone-utils";
import { requireInternal, hasInternalSecret, getAuthenticatedSession } from "@/lib/auth-utils";
import { makeDeadline } from "@/lib/sync-logic";
import { isSuspectOrderId, findMergeCandidate } from "@/lib/order-dedup";

export const dynamic = "force-dynamic";
// Vercel Hobby caps functions at 60s; a higher value fails the deploy.
// On Pro this can go to 300. The syncs are incremental, so a cut-off run
// resumes on the next tick.
export const maxDuration = 60;

/**
 * POST /api/sync/heal
 * 
 * Comprehensive Data Healing Engine:
 * 1. Unmask phone numbers using all available sources
 * 2. Merge duplicate customers (by email match)
 * 3. Recalculate total_orders, last_order_date for every customer
 * 4. Recalculate segments (repeat, one_time, inactive, risky)
 * 5. Update RTO flags
 */
export async function POST(req: NextRequest) {
  const limited = rateLimit(req, "sync", 5, 60000);
  if (limited) return limited;

  const unauthorized = await requireInternal(req);
  if (unauthorized) return unauthorized;

  // requireInternal only checks "logged in or has a cron secret" - this
  // route merges and permanently deletes duplicate customer rows, so a
  // browser-session caller must additionally be admin (matching the
  // customers page's own bulk-delete gate, which is admin-only). Cron/sync
  // secret callers skip this since there's no profile to check.
  if (!hasInternalSecret(req)) {
    const { profile } = await getAuthenticatedSession();
    if (profile?.role !== "admin") {
      return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 });
    }
  }

  const supabase = createAdminClient();

  const { data: orgs } = await supabase.from("organizations").select("id").eq("is_active", true);
  const reports = [];
  for (const org of orgs ?? []) {
    reports.push({ orgId: org.id, ...(await healOrg(supabase, org.id)) });
  }
  return NextResponse.json({ success: true, orgs: reports });
}

async function healOrg(supabase: ReturnType<typeof createAdminClient>, orgId: string) {
  // PostgREST caps a single select at 1000 rows by default - every full-table
  // scan below was silently only ever seeing the oldest 1000 of 16k+
  // customers (confirmed by a prior run reporting exactly "1000 stats
  // fixed"). A duplicate pair created after that window never enters the
  // phone/email grouping, and re-running doesn't help since the query
  // always returns the same oldest-1000 slice. Page through with .range()
  // so every phase actually sees the full table. orderCol must be a stable,
  // never-null column so paging doesn't skip or repeat rows across pages.
  // Every call below is scoped to this org via the orgFilter column -
  // without it, this engine's merge/delete logic would merge and destroy
  // a DIFFERENT org's customer or order row the moment two tenants shared
  // a phone or email number.
  async function fetchAll(table: string, select: string, orderCol: string, orgFilterCol: string = "org_id"): Promise<any[]> {
    const PAGE = 1000;
    const all: any[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from(table)
        .select(select)
        .eq(orgFilterCol, orgId)
        .order(orderCol, { ascending: true })
        .range(from, from + PAGE - 1);
      if (error || !data || data.length === 0) break;
      all.push(...data);
      if (data.length < PAGE) break;
    }
    return all;
  }

  const report = {
    unmasked: 0,
    merged: 0,
    ordersLinked: 0,
    segmentsUpdated: 0,
    statsRecalculated: 0,
    duplicatesFound: 0,
    namesCleaned: 0,
    ordersMerged: 0,
    ordersAmbiguous: 0,
    errors: 0,
    truncated: false,
  };

  // Vercel Hobby kills the function at 60s. Each phase below writes one row
  // at a time (no batch update in supabase-js), and with 16k+ customers a
  // full pass is minutes, not seconds - stop admitting new work once the
  // budget's spent so the request always returns a real report instead of
  // a 504 with nothing. report.truncated tells the caller (and the "Sync
  // System" button) to just click it again to keep making progress.
  const deadline = makeDeadline({ budgetMs: 50_000 });

  // Strips junk tokens (a lone "," or "." etc.) that slipped into a stored
  // name before the ingestion-side fix existed. Per-word, not whole-string,
  // since junk is usually stuck to one word ("A ." -> "A", ",subash ." ->
  // "subash"). Returns null when there's nothing safe to change to, so
  // callers never overwrite a name with an empty string.
  function cleanJunkName(raw: string | null): string | null {
    if (!raw) return null;
    const cleaned = raw
      .split(/\s+/)
      .map(w => w.replace(/^[,.\-_]+|[,.\-_]+$/g, ""))
      .filter(Boolean)
      .join(" ");
    return cleaned && cleaned !== raw ? cleaned : null;
  }

  try {
    // ═══════════════════════════════════════════════════════════
    // PHASE 1: MERGE DUPLICATES BY EMAIL
    // If two customers share the same email, merge the masked one
    // into the unmasked one (the "Golden Record")
    // ═══════════════════════════════════════════════════════════
    console.log("🔧 Phase 1: Merging duplicates by email...");

    const allCustomers = await fetchAll("customers", "id, name, phone, email, total_orders, created_at", "created_at");

    if (allCustomers) {
      // Group by normalized email
      const emailGroups: Record<string, typeof allCustomers> = {};
      for (const c of allCustomers) {
        if (!c.email || c.email === "noreply@shiprocket.com" || c.email === "") continue;
        const key = c.email.toLowerCase().trim();
        if (!emailGroups[key]) emailGroups[key] = [];
        emailGroups[key].push(c);
      }

      for (const [email, group] of Object.entries(emailGroups)) {
        if (deadline.expired()) { report.truncated = true; break; }
        if (group.length <= 1) continue;

        report.duplicatesFound += group.length - 1;

        // Pick the best "Golden Record": prefer unmasked phone, then oldest created
        const golden = group.find(c => !c.phone.includes("x") && !c.phone.includes("_SR_")) || group[0];
        const duplicates = group.filter(c => c.id !== golden.id);

        for (const dup of duplicates) {
          try {
            // If golden has masked phone but dup has real phone -> update golden's phone
            if ((golden.phone.includes("x") || golden.phone.includes("_SR_")) && 
                !dup.phone.includes("x") && !dup.phone.includes("_SR_")) {
              await supabase.from("customers").update({ phone: dup.phone }).eq("id", golden.id);
            }

            // If golden has a generic name, use dup's name
            if ((!golden.name || golden.name === "Shiprocket Customer" || golden.name === "Unknown Customer") &&
                dup.name && dup.name !== "Shiprocket Customer" && dup.name !== "Unknown Customer") {
              await supabase.from("customers").update({ name: dup.name }).eq("id", golden.id);
            }

            // Move all related records to golden
            await Promise.all([
              supabase.from("orders").update({ customer_id: golden.id }).eq("customer_id", dup.id),
              supabase.from("tasks").update({ customer_id: golden.id }).eq("customer_id", dup.id),
              supabase.from("abandoned_carts").update({ customer_id: golden.id }).eq("customer_id", dup.id),
              supabase.from("call_logs").update({ customer_id: golden.id }).eq("customer_id", dup.id),
            ]);

            // Delete the duplicate
            await supabase.from("customers").delete().eq("id", dup.id);
            report.merged++;
          } catch (e) {
            console.error(`Merge failed for ${dup.id}:`, e);
            report.errors++;
          }
        }
      }
    }

    // ═══════════════════════════════════════════════════════════
    // PHASE 1b: MERGE DUPLICATES BY NORMALIZED PHONE
    // Four independent write paths (Shopify sync, Shiprocket sync, Excel
    // import, manual add) each cleaned phone numbers differently until they
    // were unified onto normalizePhone() - before that fix, the same real
    // number could be stored as "7667724595" from one path and
    // "917667724595" from another, so Phase 1's email-based merge (and
    // every onConflict:"phone" upsert) never recognized them as one
    // customer. This groups by the normalized value to catch what raw
    // string comparison misses.
    // ═══════════════════════════════════════════════════════════
    console.log("🔧 Phase 1b: Merging duplicates by normalized phone...");

    const phoneCustomers = await fetchAll("customers", "id, name, phone, email, total_orders, created_at", "created_at");

    if (phoneCustomers) {
      const phoneGroups: Record<string, typeof phoneCustomers> = {};
      for (const c of phoneCustomers) {
        if (!c.phone || c.phone.includes("x") || c.phone.includes("X") || c.phone.includes("_SR_") || c.phone.startsWith("NO-") || c.phone.startsWith("MISSING")) continue;
        const key = normalizePhone(c.phone);
        if (key.length !== 10) continue;
        if (!phoneGroups[key]) phoneGroups[key] = [];
        phoneGroups[key].push(c);
      }

      for (const [normalized, group] of Object.entries(phoneGroups)) {
        if (deadline.expired()) { report.truncated = true; break; }
        if (group.length <= 1) continue;

        report.duplicatesFound += group.length - 1;

        const golden = group.find(c => c.phone === normalized) || group[0];
        const duplicates = group.filter(c => c.id !== golden.id);

        for (const dup of duplicates) {
          try {
            if (golden.phone !== normalized) {
              await supabase.from("customers").update({ phone: normalized }).eq("id", golden.id);
            }

            if ((!golden.name || golden.name === "Shiprocket Customer" || golden.name === "Unknown Customer" || golden.name === "Checkout Guest") &&
                dup.name && dup.name !== "Shiprocket Customer" && dup.name !== "Unknown Customer" && dup.name !== "Checkout Guest") {
              await supabase.from("customers").update({ name: dup.name }).eq("id", golden.id);
            }

            await Promise.all([
              supabase.from("orders").update({ customer_id: golden.id }).eq("customer_id", dup.id),
              supabase.from("tasks").update({ customer_id: golden.id }).eq("customer_id", dup.id),
              supabase.from("abandoned_carts").update({ customer_id: golden.id }).eq("customer_id", dup.id),
              supabase.from("call_logs").update({ customer_id: golden.id }).eq("customer_id", dup.id),
            ]);

            await supabase.from("customers").delete().eq("id", dup.id);
            report.merged++;
          } catch (e) {
            console.error(`Phone merge failed for ${dup.id}:`, e);
            report.errors++;
          }
        }
      }
    }

    // ═══════════════════════════════════════════════════════════
    // PHASE 1c: CLEAN JUNK NAMES
    // Standalone rows (no duplicate to merge against) that still carry a
    // junk fragment from before the ingestion-side fix, e.g. ",subash ."
    // ═══════════════════════════════════════════════════════════
    console.log("🔧 Phase 1c: Cleaning junk names...");

    if (phoneCustomers) {
      for (const c of phoneCustomers) {
        if (deadline.expired()) { report.truncated = true; break; }
        const cleaned = cleanJunkName(c.name);
        if (cleaned) {
          try {
            await supabase.from("customers").update({ name: cleaned }).eq("id", c.id);
            report.namesCleaned++;
          } catch (e) {
            console.error(`Name cleanup failed for ${c.id}:`, e);
            report.errors++;
          }
        }
      }
    }

    // ═══════════════════════════════════════════════════════════
    // PHASE 1d: MERGE DUPLICATE ORDERS
    // The webhook handler used to prioritize Shiprocket's own internal
    // order_id over channel_order_id (Shopify's order number, as
    // Shiprocket reports it) - now fixed at the source, but orders already
    // created that way are still duplicated: a real numbered order
    // ("21412") and a second row keyed on a raw Shiprocket id
    // ("6a8bf01c240c3") for the same actual purchase.
    //
    // There's no shared id to group these by after the fact (that's the
    // bug), so this only merges a "suspect" order (non-numeric
    // shopify_order_id - a real Shopify order id is always digits) into
    // a same-customer "clean" numeric order when they also share at
    // least one line-item name and were placed within 72h of each other.
    // Ambiguous cases (0 or 2+ candidates) are left alone and counted -
    // a wrong merge here is worse than leaving a duplicate visible.
    // ═══════════════════════════════════════════════════════════
    console.log("🔧 Phase 1d: Merging duplicate orders...");

    const allOrdersForDedup = await fetchAll(
      "orders",
      "id, customer_id, shopify_order_id, total_price, ordered_at, line_items",
      "id"
    );

    const ordersByCustomerForDedup: Record<string, any[]> = {};
    for (const o of allOrdersForDedup) {
      if (!o.customer_id) continue;
      (ordersByCustomerForDedup[o.customer_id] ||= []).push(o);
    }

    for (const [customerId, custOrders] of Object.entries(ordersByCustomerForDedup)) {
      if (deadline.expired()) { report.truncated = true; break; }
      if (custOrders.length < 2) continue;

      const suspects = custOrders.filter(o => isSuspectOrderId(o.shopify_order_id));
      const clean = custOrders.filter(o => o.shopify_order_id && !isSuspectOrderId(o.shopify_order_id));
      if (!suspects.length || !clean.length) continue;

      for (const suspect of suspects) {
        if (deadline.expired()) { report.truncated = true; break; }

        const golden = findMergeCandidate(suspect, clean);
        if (!golden) {
          // findMergeCandidate returns null for both zero and multiple
          // matches - only count it as ambiguous (not just "no match") to
          // avoid inflating the count with orders that simply have no
          // duplicate at all.
          const anyOverlap = clean.some(c => {
            if (!suspect.ordered_at || !c.ordered_at) return false;
            const hoursApart = Math.abs(new Date(c.ordered_at).getTime() - new Date(suspect.ordered_at).getTime()) / 3_600_000;
            return hoursApart <= 72;
          });
          if (anyOverlap) report.ordersAmbiguous++;
          continue;
        }

        try {
          await supabase.from("tasks").update({ order_id: golden.id }).eq("order_id", suspect.id);
          await supabase.from("orders").delete().eq("id", suspect.id);
          report.ordersMerged++;
        } catch (e) {
          console.error(`Order merge failed for ${suspect.id}:`, e);
          report.errors++;
        }
      }
    }

    // ═══════════════════════════════════════════════════════════
    // PHASE 2: UNMASK REMAINING MASKED PHONES
    // Try to resolve xxxxxxxxxx_SR_XXXXX style phones
    // ═══════════════════════════════════════════════════════════
    console.log("🔧 Phase 2: Unmasking phone numbers...");

    const { data: maskedCustomers } = await supabase
      .from("customers")
      .select("id, phone, name, email")
      .or("phone.ilike.%x%,phone.ilike.%_SR_%")
      .eq("org_id", orgId)
      .limit(200);

    if (maskedCustomers) {
      for (const cust of maskedCustomers) {
        try {
          const { data: order } = await supabase
            .from("orders")
            .select("shopify_order_id")
            .eq("customer_id", cust.id)
            .order("ordered_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          const phone = await resolveUnmaskedPhone(
            supabase,
            cust.id,
            cust.email || null,
            order?.shopify_order_id || null,
            null
          );

          if (phone && !phone.includes("x") && !phone.includes("X") && !phone.includes("_SR_")) {
            // Check for existing customer with this phone (dedup on merge)
            const { data: existing } = await supabase
              .from("customers")
              .select("id, name")
              .eq("phone", phone)
              .eq("org_id", orgId)
              .neq("id", cust.id)
              .maybeSingle();

            if (existing) {
              // Merge INTO existing
              await Promise.all([
                supabase.from("orders").update({ customer_id: existing.id }).eq("customer_id", cust.id),
                supabase.from("tasks").update({ customer_id: existing.id }).eq("customer_id", cust.id),
                supabase.from("abandoned_carts").update({ customer_id: existing.id }).eq("customer_id", cust.id),
                supabase.from("call_logs").update({ customer_id: existing.id }).eq("customer_id", cust.id),
              ]);
              await supabase.from("customers").delete().eq("id", cust.id);
              report.merged++;
            } else {
              await supabase.from("customers").update({ phone }).eq("id", cust.id);
            }
            report.unmasked++;
          }
        } catch (e) {
          report.errors++;
        }
      }
    }

    // ═══════════════════════════════════════════════════════════
    // PHASE 3: RECALCULATE ORDER COUNTS & STATS FOR EVERY CUSTOMER
    // This fixes the "0 orders" problem
    // ═══════════════════════════════════════════════════════════
    console.log("🔧 Phase 3: Recalculating order stats...");

    const remainingCustomers = await fetchAll(
      "customers",
      "id, total_orders, last_order_date, segment, rto_flag, rto_count",
      "id"
    );

    if (remainingCustomers.length) {
      // Batch: get ALL orders once to avoid N+1 queries
      const allOrders = await fetchAll("orders", "customer_id, ordered_at, delivery_status, total_price", "id");

      const ordersByCustomer: Record<string, any[]> = {};
      allOrders?.forEach(o => {
        if (!ordersByCustomer[o.customer_id]) ordersByCustomer[o.customer_id] = [];
        ordersByCustomer[o.customer_id].push(o);
      });

      const INACTIVE_DAYS = 45;
      const inactiveThreshold = new Date();
      inactiveThreshold.setDate(inactiveThreshold.getDate() - INACTIVE_DAYS);

      for (const cust of remainingCustomers) {
        if (deadline.expired()) { report.truncated = true; break; }
        try {
          const orders = ordersByCustomer[cust.id] || [];
          const totalOrders = orders.length;

          // Find last order date
          let lastOrderDate: string | null = null;
          if (orders.length > 0) {
            const sorted = orders.sort((a, b) => new Date(b.ordered_at).getTime() - new Date(a.ordered_at).getTime());
            lastOrderDate = sorted[0].ordered_at;
          }

          // Count RTOs
          const rtoCount = orders.filter(o => o.delivery_status === "rto" || o.delivery_status === "failed").length;
          const rtoFlag = rtoCount >= 2;

          // Determine segment
          let segment: string;
          if (totalOrders === 0) {
            segment = "one_time"; // No orders yet
          } else if (totalOrders >= 2) {
            segment = "repeat";
          } else if (lastOrderDate && new Date(lastOrderDate) < inactiveThreshold) {
            segment = "inactive";
          } else {
            segment = "one_time";
          }

          // Check if risky (RTO flagged)
          if (rtoFlag && rtoCount >= 2) {
            segment = "risky";
          }

          // Skip the write entirely when nothing changed - with 16k+
          // customers this is what makes a budget-truncated run still
          // converge over a few clicks instead of re-spending the whole
          // budget on rows that were already correct.
          const unchanged =
            cust.total_orders === totalOrders &&
            cust.last_order_date === lastOrderDate &&
            cust.segment === segment &&
            cust.rto_flag === rtoFlag &&
            cust.rto_count === rtoCount;

          if (!unchanged) {
            await supabase.from("customers").update({
              total_orders: totalOrders,
              last_order_date: lastOrderDate,
              segment,
              rto_flag: rtoFlag,
              rto_count: rtoCount,
            }).eq("id", cust.id);
          }

          report.statsRecalculated++;
        } catch (e) {
          report.errors++;
        }
      }
    }

    // ═══════════════════════════════════════════════════════════
    // PHASE 4: BACKFILL delivered_at FOR ALL DELIVERED ORDERS
    // ═══════════════════════════════════════════════════════════
    console.log("🔧 Phase 4: Backfilling delivered_at timestamps...");

    const { data: missingDeliveredAt, error: deliveredErr } = await supabase
      .from("orders")
      .select("id, ordered_at")
      .eq("delivery_status", "delivered")
      .eq("org_id", orgId)
      .is("delivered_at", null);

    if (missingDeliveredAt && missingDeliveredAt.length > 0) {
      for (const order of missingDeliveredAt) {
        await supabase.from("orders").update({
          delivered_at: order.ordered_at || new Date().toISOString()
        }).eq("id", order.id);
        report.ordersLinked++;
      }
    }

    // ═══════════════════════════════════════════════════════════
    // PHASE 5: SELF-HEAL TASK STATE (SAFETY SWEEP)
    // Cancel Issue/Transit tasks for Delivered orders
    // ═══════════════════════════════════════════════════════════
    console.log("🔧 Phase 5: Self-healing task mismatches...");

    const { data: mismatchedTasks } = await supabase
      .from("tasks")
      .select("id, customer_id, order_id, orders!inner(delivery_status)")
      .in("task_type", ["issue_resolution", "transit_update"])
      .not("status", "in", '("done","cancelled","skipped")')
      .eq("orders.delivery_status", "delivered")
      .eq("org_id", orgId);

    if (mismatchedTasks && mismatchedTasks.length > 0) {
      for (const task of mismatchedTasks) {
        await supabase.from("tasks")
          .update({ status: "cancelled" })
          .eq("id", task.id);

        await supabase.from("call_logs").insert({
          org_id: orgId,
          task_id: task.id,
          customer_id: task.customer_id,
          outcome: "done",
          note: "Self-Healed: Order delivery verified via global sync sweep.",
          agent_name: "Auto-Heal"
        });
      }
      console.log(`🧹 Repaired ${mismatchedTasks.length} stale tasks.`);
    }

    console.log(`✅ Data Healing Complete for org ${orgId}:`, report);

    return {
      report,
      message: `Healed: ${report.merged} duplicate customers merged, ${report.ordersMerged} duplicate orders merged, ${report.unmasked} phones unmasked, ${report.statsRecalculated} customer stats recalculated, ${report.ordersLinked} delivery dates fixed.`
    };

  } catch (err: any) {
    console.error(`❌ Data Healing Error (org ${orgId}):`, err);
    return { error: err.message };
  }
}
