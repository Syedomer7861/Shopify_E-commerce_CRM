import { NextRequest, NextResponse } from "next/server";
import { ensureAdmin, hasInternalSecret } from "@/lib/auth-utils";
import { createAdminClient } from "@/lib/supabase";
import { getShopifyAccessToken, getShiprocketToken, getSystemSettings } from "@/lib/server-settings";
import { resolveUnmaskedPhone } from "@/lib/unmask-utils";
import { normalizePhone } from "@/lib/phone-utils";
import { placeholderPhone, mapShiprocketStatus, parseShiprocketDate, extractShiprocketName, extractShiprocketLineItems, reclusterCustomer } from "@/lib/sync-logic";

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/**
 * Targeted backfill for orders /api/admin/order-reconciliation already
 * proved are missing. Deliberately NOT a re-run of the general full sync:
 * that has no cross-invocation resumability (each call restarts page 1,
 * budget-capped at 22s), so repeated calls would just re-process the same
 * early pages forever and likely never reach these specific orders.
 * Instead this fetches each known-missing order individually and runs it
 * through the exact same customer/order upsert shape as sync-logic.ts's
 * bulk loop, just scoped to a known, bounded list.
 */
export async function POST(req: NextRequest) {
  let supabase;
  if (hasInternalSecret(req)) {
    supabase = createAdminClient();
  } else {
    const admin = await ensureAdmin();
    if (admin.errorResponse) return admin.errorResponse;
    supabase = admin.supabase;
  }

  const body = await req.json().catch(() => ({}));
  const shopifyIds: string[] = body.shopifyIds || [];
  const shiprocketIds: string[] = body.shiprocketIds || [];

  const settings = await getSystemSettings(supabase!);
  const orgId = settings?.org_id;
  const report = {
    shopify: { attempted: shopifyIds.length, synced: 0, failed: [] as { id: string; error: string }[] },
    shiprocket: { attempted: shiprocketIds.length, synced: 0, failed: [] as { id: string; error: string }[] },
  };

  // ── Shopify ──────────────────────────────────────────────────────────
  if (shopifyIds.length > 0) {
    const domain = String(settings?.shopify_store_domain || "").replace(/^https?:\/\//, "").replace(/\/$/, "");
    const token = await getShopifyAccessToken(supabase!);

    for (const shopifyId of shopifyIds) {
      try {
        const res = await fetch(`https://${domain}/admin/api/2024-04/orders/${shopifyId}.json`, {
          headers: { "X-Shopify-Access-Token": token },
        });
        if (!res.ok) throw new Error(`Shopify fetch HTTP ${res.status}`);
        const { order } = await res.json();
        if (!order) throw new Error("Order not found in Shopify response");

        const customerData = order.customer;
        const rawPhone = order.phone || customerData?.phone || order.shipping_address?.phone || order.billing_address?.phone || "";
        let phone = normalizePhone(rawPhone);
        const isMasked = !phone || phone.includes("x") || phone.includes("X") || phone.length < 7;

        if (isMasked) {
          const email = order.email || customerData?.email || null;
          const resolved = await resolveUnmaskedPhone(supabase, "", email, String(order.order_number || order.name), order, token);
          phone = (resolved && !resolved.includes("x") && resolved.length >= 7) ? resolved : placeholderPhone(shopifyId);
        }

        const customerRow = {
          org_id: orgId,
          name: `${customerData?.first_name || ""} ${customerData?.last_name || ""}`.trim() || "Shopify Customer",
          phone,
          email: order.email || customerData?.email || null,
          shopify_customer_id: customerData?.id ? String(customerData.id) : null,
          address: order.shipping_address?.address1 || null,
          city: order.shipping_address?.city || null,
          state: order.shipping_address?.province || null,
          zip: order.shipping_address?.zip || null,
        };

        let { data: customerArr, error: customerErr } = await supabase!
          .from("customers").upsert(customerRow, { onConflict: "org_id,phone" })
          .select("id");

        if (customerErr?.code === "23505" && customerRow.shopify_customer_id) {
          ({ data: customerArr, error: customerErr } = await supabase!
            .from("customers")
            .upsert({ ...customerRow, shopify_customer_id: null }, { onConflict: "org_id,phone" })
            .select("id"));
        }
        if (customerErr) throw new Error(`Customer upsert: ${customerErr.message}`);
        const customer = customerArr?.[0];
        if (!customer) throw new Error("Customer upsert returned no row");

        const lineItems = (order.line_items || []).map((item: any) => ({
          name: item.name, qty: item.quantity, price: parseFloat(item.price), product_id: String(item.product_id), title: item.title,
        }));
        const orderNumber = String(order.order_number || order.name);
        const currentStatus = order.fulfillment_status === "fulfilled" ? "in_transit" : "pending";

        const { error: orderErr } = await supabase!.from("orders").upsert({
          org_id: orgId,
          customer_id: customer.id,
          shopify_order_id: String(order.id),
          order_number: orderNumber,
          line_items: lineItems,
          total_price: parseFloat(order.total_price || 0),
          total_discounts: parseFloat(order.total_discounts || 0),
          fulfillment_status: order.fulfillment_status || "unfulfilled",
          delivery_status: currentStatus,
          ordered_at: order.created_at,
          source: "shopify",
        }, { onConflict: "org_id,shopify_order_id" });

        if (orderErr) throw new Error(`Order upsert: ${orderErr.message}`);

        await supabase!.from("abandoned_carts").update({ recovery_status: "recovered" }).eq("phone", phone).eq("org_id", orgId).eq("recovery_status", "pending");

        report.shopify.synced++;
      } catch (err: any) {
        report.shopify.failed.push({ id: shopifyId, error: err.message || String(err) });
      }
      await sleep(600); // Shopify REST allows ~2 req/s; stay well under it
    }
  }

  // ── Shiprocket ───────────────────────────────────────────────────────
  if (shiprocketIds.length > 0) {
    const token = await getShiprocketToken(supabase!);
    const wanted = new Set(shiprocketIds);

    // Not confident Shiprocket's /orders list actually supports filtering
    // by channel_order_id, and the whole account only has ~125 orders (a
    // few pages) - safer to pull everything once and match locally than
    // rely on an unverified query param possibly returning the wrong thing.
    const srById = new Map<string, any>();
    {
      let page = 1, totalPages = 1;
      do {
        const res = await fetch(
          `https://apiv2.shiprocket.in/v1/external/orders?per_page=50&page=${page}&sort=created_at&sort_dir=desc`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (!res.ok) throw new Error(`Shiprocket list HTTP ${res.status}`);
        const json = await res.json();
        const orders = json.data || [];
        totalPages = json.meta?.pagination?.total_pages || 1;
        for (const sr of orders) {
          const id = String(sr.channel_order_id || sr.id);
          if (wanted.has(id)) srById.set(id, sr);
        }
        page++;
      } while (page <= totalPages && page <= 500 && srById.size < wanted.size);
    }

    for (const orderId of shiprocketIds) {
      try {
        const sr = srById.get(orderId);
        if (!sr) throw new Error("Order not found in Shiprocket listing");

        const email = sr.billing_email || sr.shipping_email || sr.customer_email || null;
        const phone = await resolveUnmaskedPhone(supabase, "", email, orderId, sr, token);
        if (!phone) throw new Error("No resolvable phone number");

        const { data: custArr, error: customerErr } = await supabase!.from("customers").upsert({
          org_id: orgId,
          name: extractShiprocketName(sr),
          phone,
          email,
          address: sr.shipping_address || null,
          city: sr.shipping_city || null,
          state: sr.shipping_state || null,
          zip: sr.shipping_pincode || null,
        }, { onConflict: "org_id,phone" }).select("id");

        if (customerErr) throw new Error(`Customer upsert: ${customerErr.message}`);
        const customer = custArr?.[0];
        if (!customer) throw new Error("Customer upsert returned no row");

        const crmStatus = mapShiprocketStatus(sr.status || "");
        const { error: orderErr } = await supabase!.from("orders").upsert({
          org_id: orgId,
          shopify_order_id: orderId,
          order_number: sr.order_no || orderId,
          customer_id: customer.id,
          total_price: parseFloat(sr.total || 0),
          ordered_at: parseShiprocketDate(sr.created_at),
          source: "shiprocket",
          delivery_status: crmStatus,
          fulfillment_status: ["delivered", "in_transit", "out_for_delivery"].includes(crmStatus) ? "fulfilled" : "unfulfilled",
          tracking_number: sr.shipments?.[0]?.awb || sr.awb_code || null,
          courier_name: sr.shipments?.[0]?.courier || sr.courier_name || null,
          line_items: extractShiprocketLineItems(sr),
        }, { onConflict: "org_id,shopify_order_id" });

        if (orderErr) throw new Error(`Order upsert: ${orderErr.message}`);

        await reclusterCustomer(supabase, customer.id);
        report.shiprocket.synced++;
      } catch (err: any) {
        report.shiprocket.failed.push({ id: orderId, error: err.message || String(err) });
      }
      await sleep(600);
    }
  }

  return NextResponse.json(report);
}
