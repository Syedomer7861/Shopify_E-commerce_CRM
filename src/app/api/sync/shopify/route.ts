import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

function mapShopifyStatus(status: string) {
  const s = status.toLowerCase();
  if (s === "fulfilled" || s === "restocked") return "delivered"; // We refine this via Shiprocket later
  return "pending";
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
      .select("shopify_store_domain, shopify_api_key")
      .eq("id", "00000000-0000-0000-0000-000000000000")
      .single();

    if (!settings?.shopify_store_domain || !settings?.shopify_api_key) {
      return NextResponse.json({ error: "Shopify credentials not configured" }, { status: 400 });
    }

    const domain = settings.shopify_store_domain.trim().replace(/^https?:\/\//, "").replace(/\/$/, "");
    const token = settings.shopify_api_key.trim();

    // 2. Fetch Orders from Shopify
    // We get 'any' status to capture everything, last 50
    const shopifyUrl = `https://${domain}/admin/api/2024-04/orders.json?status=any&limit=50&order=created_at desc`;
    
    console.log(`[Shopify Sync] Fetching from: ${domain}`);
    const res = await fetch(shopifyUrl, {
      method: "GET",
      headers: {
        "X-Shopify-Access-Token": token,
        "Content-Type": "application/json"
      }
    });

    if (!res.ok) {
        const err = await res.json();
        console.error(`[Shopify Sync] Error:`, err);
        return NextResponse.json({ error: "Shopify API Error", details: err }, { status: res.status });
    }

    const { orders: shopifyOrders } = await res.json();

    let processedCount = 0;
    let customerCount = 0;

    for (const shop of shopifyOrders) {
      const orderId = shop.id.toString();
      const customer = shop.customer;
      
      if (!customer) continue;

      const customerPhone = (customer.phone || shop.billing_address?.phone || shop.shipping_address?.phone || "")
        .toString().trim().replace(/^\+/, "").replace(/^91/, "").replace(/\s/g, "");

      if (!customerPhone) continue;

      // A. Setup Customer
      const shopifyCustomerId = customer.id.toString();
      const { data: crmCustomer, error: custErr } = await supabase.from("customers").upsert({
        shopify_customer_id: shopifyCustomerId,
        name: `${customer.first_name || ""} ${customer.last_name || ""}`.trim() || "Shopify Customer",
        phone: customerPhone,
        email: customer.email || null,
        address: shop.shipping_address?.address1 || null,
        city: shop.shipping_address?.city || null,
        state: shop.shipping_address?.province || null,
        zip: shop.shipping_address?.zip || null,
      }, { onConflict: "phone" }).select("id").single();

      if (custErr) {
        console.error(`❌ Customer Sync Failed for ${customerPhone}:`, custErr);
        continue;
      }
      customerCount++;

      // B. Setup Order
      const items = shop.line_items.map((it: any) => ({
        id: it.id?.toString(),
        product_id: it.product_id?.toString(),
        name: it.title,
        qty: it.quantity,
        price: parseFloat(it.price || 0),
        variant_title: it.variant_title
      }));

      const { error: orderErr } = await supabase.from("orders").upsert({
        customer_id: crmCustomer.id,
        shopify_order_id: orderId,
        order_number: shop.order_number?.toString() || shop.name?.replace("#", "") || orderId,
        total_price: parseFloat(shop.total_price || 0),
        delivery_status: mapShopifyStatus(shop.fulfillment_status || "pending"),
        fulfillment_status: shop.fulfillment_status || "unfulfilled",
        ordered_at: shop.created_at || new Date().toISOString(),
        source: "shopify",
        line_items: items
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
    console.error("❌ Shopify Sync Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
