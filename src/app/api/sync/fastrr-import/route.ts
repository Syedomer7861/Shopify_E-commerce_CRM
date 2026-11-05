import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { TaskType } from "@/types";
import { assignTaskOwner, calculateTaskPriority } from "@/lib/task-engine";
import { requireInternal } from "@/lib/auth-utils";

export async function POST(req: NextRequest) {
  const unauthorized = await requireInternal(req);
  if (unauthorized) return unauthorized;

  const supabase = createAdminClient();

  try {
    const { rows } = await req.json();
    if (!rows || !Array.isArray(rows)) {
      return NextResponse.json({ error: "Invalid data format" }, { status: 400 });
    }

    const report = {
      customers: 0,
      carts: 0,
      tasks: 0,
      errors: [] as string[]
    };

    // This is an internal-secret-gated bulk import tool with no session
    // and no per-row tenant info (a spreadsheet upload), so it's scoped
    // to the seed org - same as the other single-bridge/single-org
    // internal tools (WhatsApp bridge, system-health).
    const { getDefaultOrgId } = await import("@/lib/server-settings");
    const orgId = await getDefaultOrgId();
    if (!orgId) {
      return NextResponse.json({ error: "Could not resolve an organization" }, { status: 500 });
    }

    const { data: settings } = await supabase.from("settings").select("recovery_delay_hours").eq("org_id", orgId).maybeSingle();
    const delayHours = settings?.recovery_delay_hours || 24;

    for (const row of rows) {
      try {
        // Fastrr Header Mapping (case-insensitive contains logic)
        const cartId = row["Cart ID"] || row["cart_id"] || row["CartToken"];
        const rawName = row["Customer Name"] || row["customer_name"] || row["Name"];
        
        // Complex Phone Extraction
        let phone = row["Customer Contact"] || row["Mobile"] || row["Phone"] || row["customer_phone"] || row["Customer Mobile"];
        
        // If phone is missing, try to scan ALL fields for a 10-digit number
        if (!phone) {
          const allData = JSON.stringify(row);
          const match = allData.match(/\b([6-9]\d{9})\b/);
          if (match) phone = match[1];
        }

        const value = row["Cart Value"] || row["CartValue"] || row["Total"];
        const dateStr = row["Data & Time"] || row["Abandoned Date"] || row["created_at"];
        
        if (!cartId) continue;

        // 1. Process Phone (Identity)
        let cleanPhone = String(phone || "").trim().replace(/[^\d]/g, "");
        if (cleanPhone.startsWith("91") && cleanPhone.length > 10) cleanPhone = cleanPhone.slice(cleanPhone.length - 10);
        
        const identityPhone = cleanPhone || `GUEST-${cartId}`;

        // 2. Upsert Customer
        const { data: custData, error: custErr } = await supabase.from("customers").upsert({
          org_id: orgId,
          name: rawName || (cleanPhone ? "Shopify Customer" : "Checkout Guest"),
          phone: identityPhone,
        }, { onConflict: "org_id,phone" }).select("id, rto_flag, total_orders").single();

        if (custErr || !custData) {
          report.errors.push(`Customer fail for ${cartId}: ${custErr?.message}`);
          continue;
        }
        report.customers++;

        // 3. Upsert Abandoned Cart
        const abandonedAt = dateStr ? new Date(dateStr).toISOString() : new Date().toISOString();
        const { data: cartData, error: cartErr } = await supabase.from("abandoned_carts").upsert({
          org_id: orgId,
          customer_id: custData.id,
          cart_token: String(cartId),
          phone: cleanPhone || "unknown",
          total_price: parseFloat(String(value || "0").replace(/[^\d.]/g, "")),
          recovery_status: "pending",
          abandoned_at: abandonedAt,
          source: "shiprocket_checkout",
          line_items: [{ name: row["Cart Details"] || "Imported Cart" }]
        }, { onConflict: "org_id,cart_token" }).select("id").single();

        if (cartErr || !cartData) {
          report.errors.push(`Cart fail for ${cartId}: ${cartErr?.message}`);
          continue;
        }
        report.carts++;

        // 4. Generate Task (only if not already converted)
        // Check if customer has an order AFTER this abandoned_at
        const { count: orderCount } = await supabase.from("orders")
          .select("*", { count: "exact", head: true })
          .eq("customer_id", custData.id)
          .gt("ordered_at", abandonedAt);

        if (orderCount && orderCount > 0) {
            // Mark cart as recovered automatically
            await supabase.from("abandoned_carts").update({ recovery_status: "recovered" }).eq("id", cartData.id);
            continue;
        }

        const dueDateAt = new Date(new Date(abandonedAt).getTime() + (delayHours * 60 * 60 * 1000));
        const { error: taskErr } = await supabase.from("tasks").upsert({
          org_id: orgId,
          customer_id: custData.id,
          abandoned_cart_id: cartData.id,
          assigned_to: await assignTaskOwner(supabase),
          task_type: "recovery" as TaskType,
          due_date: dueDateAt.toISOString().split("T")[0],
          priority_score: calculateTaskPriority({
             taskType: "recovery",
             rtoFlag: custData.rto_flag,
             totalOrders: custData.total_orders
          }),
          status: "pending"
        }, { onConflict: "abandoned_cart_id, task_type" });

        if (!taskErr) report.tasks++;

      } catch (rowErr: any) {
        report.errors.push(`Row processing error: ${rowErr.message}`);
      }
    }

    return NextResponse.json({ 
      success: true, 
      report: {
        processed: rows.length,
        created_customers: report.customers,
        synced_carts: report.carts,
        tasks_generated: report.tasks,
        failures: report.errors.length,
        error_samples: report.errors.slice(0, 5)
      }
    });

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
