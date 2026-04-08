import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const SHIPROCKET_BASE_URL = "https://apiv2.shiprocket.in/v1/external";

function mapShiprocketStatus(status: string | number) {
  const s = String(status).toLowerCase();
  if (s.includes("delivered") || s === "7" || s === "10") return "delivered";
  if (s.includes("shipped") || s === "6" || s === "12" || s.includes("transit")) return "in_transit";
  if (s.includes("out for delivery") || s === "13") return "out_for_delivery";
  if (s.includes("rto") || s === "9") return "rto";
  if (s.includes("canceled") || s === "8") return "failed";
  return "pending";
}

function parseShiprocketDate(dateStr: string | null | undefined): string {
  if (!dateStr) return new Date().toISOString();
  // Shiprocket often sends "YYYY-MM-DD HH:MM:SS" or "DD-MM-YYYY HH:MM:SS"
  // JS Date behaves differently depending on the separator and order.
  // We force YYYY-MM-DD for the database.
  
  if (dateStr.includes("-")) {
    const parts = dateStr.split(" ")[0].split("-");
    if (parts[0].length === 4) {
      // YYYY-MM-DD - This is usually safe
      return new Date(dateStr).toISOString();
    } else if (parts[2].length === 4) {
      // DD-MM-YYYY - This is the ambiguous one! 08-04-2026 -> April 8th
      const [d, m, y] = parts;
      const time = dateStr.split(" ")[1] || "00:00:00";
      return new Date(`${y}-${m}-${d}T${time}`).toISOString();
    }
  }
  return new Date(dateStr).toISOString();
}

export async function POST(req: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  try {
    // 1. Get Credentials from settings
    const { data: settings } = await supabase
      .from("settings")
      .select("shiprocket_email, shiprocket_password")
      .eq("id", "00000000-0000-0000-0000-000000000000")
      .single();

    if (!settings?.shiprocket_email || !settings?.shiprocket_password) {
      return NextResponse.json({ error: "Shiprocket credentials not configured in settings" }, { status: 400 });
    }

    // 2. Authenticate with Shiprocket
    const email = settings.shiprocket_email.trim();
    const password = settings.shiprocket_password.trim();
    
    console.log(`[Shiprocket Sync] Attempting login for: ${email}`);
    const authRes = await fetch(`${SHIPROCKET_BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });

    if (!authRes.ok) {
      const authErr = await authRes.json();
      console.error(`[Shiprocket Sync] Login Failed:`, authErr);
      return NextResponse.json({ 
        error: "Shiprocket Authentication Failed", 
        details: authErr,
        message: authErr.message || "Invalid credentials provided in Settings."
      }, { status: 401 });
    }

    const { token } = await authRes.json();

    // 3. Fetch Recent Orders (Last 50)
    const ordersRes = await fetch(`${SHIPROCKET_BASE_URL}/orders?per_page=50`, {
      method: "GET",
      headers: { 
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json" 
      }
    });

    if (!ordersRes.ok) {
      return NextResponse.json({ error: "Failed to fetch orders from Shiprocket" }, { status: 500 });
    }

    const orderData = await ordersRes.json();
    const srOrders = orderData.data || [];

    let processedCount = 0;
    let customerCount = 0;

    for (const sr of srOrders) {
      const orderId = sr.channel_order_id || sr.id;
      const customerPhone = sr.customer_phone?.toString().trim().replace(/^\+/, "").replace(/^91/, "").replace(/\s/g, "");
      
      if (!customerPhone) continue;

      // A. Sync Customer (Minimal Link Only)
      const srCustomerId = sr.customer_id?.toString() || `SR_${orderId}`;
      let customerId: string | null = null;

      // 1. Try to find by Shiprocket ID
      const { data: existingById } = await supabase
        .from("customers")
        .select("id, phone")
        .eq("shopify_customer_id", srCustomerId)
        .maybeSingle();

      if (existingById) {
          customerId = existingById.id;
          // IMPORTANT: If we found them, we DO NOT update them with potentially masked data
          console.log(`[Shiprocket Sync] Customer ${srCustomerId} already exists. Skipping profile update to preserve Shopify data.`);
      } else {
          // 2. Try to find by unmasked phone
          const isMasked = customerPhone.includes("xxxx");
          if (!isMasked) {
              const { data: existingByPhone } = await supabase
                .from("customers")
                .select("id")
                .eq("phone", customerPhone)
                .maybeSingle();
              if (existingByPhone) customerId = existingByPhone.id;
          }

          // 3. Create only if totally missing
          if (!customerId) {
              const uniquePhone = isMasked ? `${customerPhone}_${srCustomerId}` : customerPhone;
              const { data: newCust, error: createCustErr } = await supabase.from("customers").insert({
                shopify_customer_id: srCustomerId,
                name: sr.customer_name || "Shiprocket Customer",
                phone: uniquePhone,
                email: sr.customer_email || null,
                zip: sr.customer_pincode || null,
              }).select("id").single();

              if (createCustErr) {
                  console.error(`❌ Customer Creation Failed:`, createCustErr);
                  continue;
              }
              customerId = newCust.id;
          }
      }
      customerCount++;

      // B. Sync Order (Status & Tracking ONLY)
      const crmStatus = mapShiprocketStatus(sr.status || "");
      
      // We only update the dynamic fields to avoid overwriting line items and product titles from Shopify
      const updatePayload: any = {
        delivery_status: crmStatus,
        tracking_number: sr.shipments?.[0]?.awb || null,
        delivered_at: crmStatus === "delivered" ? parseShiprocketDate(sr.delivered_date) : null,
      };

      // We only include customer_id and order_number IF we are creating a new row
      // Upsert with onConflict will handle the rest
      const { error: orderErr } = await supabase.from("orders").upsert({
        shopify_order_id: orderId.toString(),
        order_number: sr.order_no || orderId.toString(),
        customer_id: customerId,
        total_price: parseFloat(sr.total || 0),
        ordered_at: parseShiprocketDate(sr.created_at),
        source: "shopify",
        ...updatePayload
      }, { onConflict: "shopify_order_id" });

      if (!orderErr) processedCount++;
      else console.error(`❌ Order Sync Failed for ${orderId}:`, orderErr);
    }

    return NextResponse.json({ 
      success: true, 
      report: { 
        orders_processed: processedCount,
        customers_synced: customerCount
      } 
    });

  } catch (err: any) {
    console.error("❌ Shiprocket Sync API Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
