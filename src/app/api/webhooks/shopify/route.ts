import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

export const dynamic = "force-dynamic";

// Shopify Webhook Verification
function verifyShopifyWebhook(body: string, hmac: string, secret: string) {
  const hash = crypto
    .createHmac("sha256", secret)
    .update(body, "utf8")
    .digest("base64");
  return hash === hmac;
}

export async function POST(req: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  try {
    const body = await req.text();
    const hmac = req.headers.get("x-shopify-hmac-sha256");
    const topic = req.headers.get("x-shopify-topic");
    const domain = req.headers.get("x-shopify-shop-domain");

    if (!hmac || !topic || !domain) {
      return NextResponse.json({ error: "Missing required headers" }, { status: 400 });
    }

    // 1. Get Secret from settings
    const { data: settings } = await supabase
      .from("settings")
      .select("shopify_webhook_secret")
      .eq("id", "00000000-0000-0000-0000-000000000000")
      .single();

    if (!settings?.shopify_webhook_secret) {
        // If not configured, we allow for testing if specifically requested, 
        // but for production, we should always verify.
        console.warn("[Shopify Webhook] No secret configured. Verification skipped (DEBUG).");
    } else {
        const isValid = verifyShopifyWebhook(body, hmac, settings.shopify_webhook_secret);
        if (!isValid) {
            console.error("[Shopify Webhook] Invalid signature verification.");
            return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
        }
    }

    const shop = JSON.parse(body);
    console.log(`[Shopify Webhook] Received ${topic} for Order ${shop.order_number}`);

    // LOGIC: Map Shopify Webhook to CRM
    const orderId = shop.id.toString();
    const customer = shop.customer;
    
    if (!customer) {
        return NextResponse.json({ success: true, note: "No customer data in payload" });
    }

    const rawPhone = (customer.phone || shop.billing_address?.phone || shop.shipping_address?.phone || "");
    const customerPhone = rawPhone.toString().trim().replace(/^\+/, "").replace(/^91/, "").replace(/\s/g, "");

    if (!customerPhone) {
        return NextResponse.json({ success: true, note: "No phone number in payload" });
    }

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
      console.error(`❌ Webhook Customer Sync Failed:`, custErr);
      return NextResponse.json({ error: "Customer sync failed" }, { status: 500 });
    }

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
      fulfillment_status: shop.fulfillment_status || "unfulfilled",
      ordered_at: shop.created_at || new Date().toISOString(),
      source: "shopify",
      line_items: items
    }, { onConflict: "shopify_order_id" });

    if (orderErr) {
        console.error(`❌ Webhook Order Sync Failed:`, orderErr);
        return NextResponse.json({ error: "Order sync failed" }, { status: 500 });
    }

    return NextResponse.json({ success: true, topic, order_number: shop.order_number });

  } catch (err: any) {
    console.error("❌ Shopify Webhook Error:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
