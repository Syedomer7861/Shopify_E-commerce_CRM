import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase";
import { resolveUnmaskedPhone } from "@/lib/unmask-utils";
import { requireInternal } from "@/lib/auth-utils";

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

  const supabase = createAdminClient();

  const report = {
    unmasked: 0,
    merged: 0,
    ordersLinked: 0,
    segmentsUpdated: 0,
    statsRecalculated: 0,
    duplicatesFound: 0,
    errors: 0,
  };

  try {
    // ═══════════════════════════════════════════════════════════
    // PHASE 1: MERGE DUPLICATES BY EMAIL
    // If two customers share the same email, merge the masked one
    // into the unmasked one (the "Golden Record")
    // ═══════════════════════════════════════════════════════════
    console.log("🔧 Phase 1: Merging duplicates by email...");

    const { data: allCustomers } = await supabase
      .from("customers")
      .select("id, name, phone, email, total_orders, created_at")
      .order("created_at", { ascending: true });

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
    // PHASE 2: UNMASK REMAINING MASKED PHONES
    // Try to resolve xxxxxxxxxx_SR_XXXXX style phones
    // ═══════════════════════════════════════════════════════════
    console.log("🔧 Phase 2: Unmasking phone numbers...");

    const { data: maskedCustomers } = await supabase
      .from("customers")
      .select("id, phone, name, email")
      .or("phone.ilike.%x%,phone.ilike.%_SR_%")
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

    const { data: remainingCustomers } = await supabase
      .from("customers")
      .select("id");

    if (remainingCustomers) {
      // Batch: get ALL orders once to avoid N+1 queries
      const { data: allOrders } = await supabase
        .from("orders")
        .select("customer_id, ordered_at, delivery_status, total_price");

      const ordersByCustomer: Record<string, any[]> = {};
      allOrders?.forEach(o => {
        if (!ordersByCustomer[o.customer_id]) ordersByCustomer[o.customer_id] = [];
        ordersByCustomer[o.customer_id].push(o);
      });

      const INACTIVE_DAYS = 45;
      const inactiveThreshold = new Date();
      inactiveThreshold.setDate(inactiveThreshold.getDate() - INACTIVE_DAYS);

      for (const cust of remainingCustomers) {
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

          // Update
          await supabase.from("customers").update({
            total_orders: totalOrders,
            last_order_date: lastOrderDate,
            segment,
            rto_flag: rtoFlag,
            rto_count: rtoCount,
          }).eq("id", cust.id);

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
      .eq("orders.delivery_status", "delivered");

    if (mismatchedTasks && mismatchedTasks.length > 0) {
      for (const task of mismatchedTasks) {
        await supabase.from("tasks")
          .update({ status: "cancelled" })
          .eq("id", task.id);
        
        await supabase.from("call_logs").insert({
          task_id: task.id,
          customer_id: task.customer_id,
          outcome: "done",
          note: "Self-Healed: Order delivery verified via global sync sweep.",
          agent_name: "Auto-Heal"
        });
      }
      console.log(`🧹 Repaired ${mismatchedTasks.length} stale tasks.`);
    }

    console.log("✅ Data Healing Complete:", report);

    return NextResponse.json({ 
      success: true, 
      report,
      message: `Healed: ${report.merged} duplicates merged, ${report.unmasked} phones unmasked, ${report.statsRecalculated} customer stats recalculated, ${report.ordersLinked} delivery dates fixed.`
    });

  } catch (err: any) {
    console.error("❌ Data Healing Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
