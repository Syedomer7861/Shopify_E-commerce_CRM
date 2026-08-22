import { NextRequest, NextResponse } from "next/server";
import { createServerClient, getServiceSupabase } from "@/lib/supabase";
import { getSystemSettings, getShopifyAccessToken } from "@/lib/server-settings";
import { resolveUnmaskedPhone } from "@/lib/unmask-utils";
import { createSyncStream, syncHeaders } from "@/lib/sync-stream";
import { requireInternal } from "@/lib/auth-utils";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const SHIPROCKET_BASE_URL = "https://apiv2.shiprocket.in/v1/external";

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function mapShiprocketStatus(status: string | number) {
  const s = String(status).toLowerCase();
  if (s.includes("rto") || s === "9") return "rto";
  if (s.includes("delivered") || s === "7" || s === "10") return "delivered";
  if (s.includes("shipped") || s === "6" || s === "12" || s.includes("transit")) return "in_transit";
  if (s.includes("out for delivery") || s === "13") return "out_for_delivery";
  if (s.includes("canceled") || s === "8" || s.includes("cancel")) return "failed";
  if (s.includes("new") || s === "1" || s.includes("pickup") || s === "2" || s === "3" || s === "4" || s === "5") return "pending";
  return "pending";
}

function parseShiprocketDate(dateStr: string | null | undefined): string {
  if (!dateStr) return new Date().toISOString();
  if (dateStr.includes("-")) {
    const parts = dateStr.split(" ")[0].split("-");
    if (parts[0].length === 4) {
      return new Date(dateStr).toISOString();
    } else if (parts[2]?.length === 4) {
      const [d, m, y] = parts;
      const time = dateStr.split(" ")[1] || "00:00:00";
      return new Date(`${y}-${m}-${d}T${time}`).toISOString();
    }
  }
  return new Date(dateStr).toISOString();
}

function extractCustomerName(sr: any): string {
  const billing = [sr.billing_customer_name, sr.billing_last_name].filter(Boolean).join(" ").trim();
  const shipping = [sr.shipping_customer_name, sr.shipping_last_name].filter(Boolean).join(" ").trim();
  const customer = [sr.customer_first_name, sr.customer_last_name].filter(Boolean).join(" ").trim();
  const generic = sr.customer_name?.trim();
  return billing || shipping || customer || generic || "Unknown Customer";
}

function extractPhone(sr: any): string | null {
  const candidates = [
    sr.billing_phone, sr.shipping_phone, sr.customer_phone, sr.phone_number,
    sr.mobile, sr.shipping_address?.phone, sr.billing_address?.phone,
  ].filter(Boolean).map((p: any) => String(p).trim().replace(/\s/g, ""));
  
  const unmasked = candidates.find((p: string) => !p.includes("x") && !p.includes("X") && !p.includes("*"));
  if (unmasked) {
    let cleaned = unmasked.replace(/[^\d]/g, "");
    if (cleaned.startsWith("91") && cleaned.length > 10) cleaned = cleaned.slice(cleaned.length - 10);
    return cleaned;
  }
  
  const fullJson = JSON.stringify(sr);
  const potentialNumbers = fullJson.match(/(?:(?:\+|91)?)?\b([6-9]\d{9})\b/g);
  if (potentialNumbers) {
      const merchantPhone = sr.pickup_address?.phone;
      const valid = potentialNumbers.find(n => {
          const c = n.replace(/[^\d]/g, "");
          const clean = c.length > 10 ? c.slice(c.length - 10) : c;
          return clean !== merchantPhone && clean !== '8008313180' && clean !== '7907022556' && clean.length === 10;
      });
      if (valid) {
          const c = valid.replace(/[^\d]/g, "");
          return c.length > 10 ? c.slice(c.length - 10) : c;
      }
  }

  if (candidates.length > 0) {
    let cleaned = candidates[0].replace(/[^\d]/g, "");
    if (cleaned.startsWith("91") && cleaned.length > 10) cleaned = cleaned.slice(cleaned.length - 10);
    return cleaned || candidates[0];
  }
  return null;
}

function extractEmail(sr: any): string | null {
  return sr.billing_email || sr.shipping_email || sr.customer_email || null;
}

function extractAddress(sr: any) {
  const addr1 = sr.shipping_address || sr.billing_address || "";
  const addr2 = sr.shipping_address_2 || sr.billing_address_2 || "";
  const address = [addr1, addr2].filter(Boolean).join(", ").trim();
  return {
    address: address || null,
    city: sr.shipping_city || sr.billing_city || null,
    state: sr.shipping_state || sr.billing_state || null,
    zip: sr.shipping_pincode || sr.billing_pincode || sr.customer_pincode || null,
    country: sr.shipping_country || sr.billing_country || "India",
  };
}

function extractLineItems(sr: any): any[] {
  const items = sr.order_items || sr.products || sr.line_items || [];
  if (!Array.isArray(items) || items.length === 0) {
    return [{ name: "Order Item", qty: 1, price: parseFloat(sr.total || sr.sub_total || 0) }];
  }
  return items.map((item: any) => ({
    name: item.name || item.product_name || item.title || "Product",
    qty: parseInt(item.units || item.quantity || item.qty || 1),
    price: parseFloat(item.selling_price || item.price || 0),
    sku: item.sku || null,
    product_id: item.product_id || null,
  }));
}

async function shiprocketFetch(url: string, token: string) {
  const res = await fetch(url, {
    method: "GET",
    headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
  });
  if (!res.ok) throw new Error(`Shiprocket API error: ${res.status} ${res.statusText}`);
  return res.json();
}

export async function GET(req: NextRequest) {
  return POST(req);
}

export async function POST(req: NextRequest) {
  const unauthorized = await requireInternal(req);
  if (unauthorized) return unauthorized;

  const { stream, send, close } = createSyncStream();
  const streaming = req.nextUrl.searchParams.get("stream") === "true";

  const supabase = getServiceSupabase(req);

  const authHeader = req.headers.get("x-sync-secret");
  const isInternal = authHeader === process.env.SUPABASE_SERVICE_ROLE_KEY;

  const report = { 
    orders_processed: 0, 
    orders_failed: 0,
    customers_created: 0, 
    customers_updated: 0, 
    abandoned_carts: 0,
    pages_fetched: 0 
  };

  const runSync = async () => {
    try {
      send({ progress: 2, message: "Handshaking with Shiprocket..." });
      const settings = await getSystemSettings(supabase);

      if (!settings?.shiprocket_email || !settings?.shiprocket_password) {
        send({ error: "Shiprocket credentials not configured" });
        return close();
      }

      const authRes = await fetch(`${SHIPROCKET_BASE_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: settings.shiprocket_email.trim(), password: settings.shiprocket_password.trim() })
      });

      if (!authRes.ok) {
        send({ error: "Shiprocket Authentication Failed" });
        return close();
      }

      const { token } = await authRes.json();
      send({ progress: 5, message: "Authenticated. Scanning orders..." });

      const full = req.nextUrl.searchParams.get("full") === "true";
      let currentPage = 1;
      let hasMore = true;
      const MAX_SHALLOW_PAGES = 5;

      while (hasMore) {
        if (!full && currentPage > MAX_SHALLOW_PAGES) break;

        const currentMax = full ? 500 : MAX_SHALLOW_PAGES;
        const pageProgress = 5 + Math.round((currentPage / currentMax) * 75);
        send({ progress: Math.min(90, pageProgress), message: `Fetching Shiprocket page ${currentPage}...` });
        
        const orderData = await shiprocketFetch(
          `${SHIPROCKET_BASE_URL}/orders?per_page=50&page=${currentPage}&sort=created_at&sort_dir=desc`,
          token
        );
        
        const srOrders = orderData.data || [];
        if (srOrders.length === 0) { hasMore = false; break; }
        report.pages_fetched++;

        const totalPages = orderData.meta?.pagination?.total_pages || 1;
        const baseProgress = 5 + ((currentPage - 1) / totalPages) * 90;
        const pageWeight = 90 / totalPages;

        for (let i = 0; i < srOrders.length; i++) {
          const sr = srOrders[i];
          try {
            // Granular Progress Update
            if (i % 5 === 0 || i === srOrders.length - 1) {
              const itemProgress = baseProgress + ((i + 1) / srOrders.length) * pageWeight;
              send({ 
                message: `Processing page ${currentPage}... (OK: ${report.orders_processed}, ERR: ${report.orders_failed})`, 
                progress: Math.min(99, Math.max(baseProgress + 0.1, itemProgress)) 
              });
            }
            const orderId = sr.channel_order_id || sr.id;
            const email = extractEmail(sr);
            let phone = extractPhone(sr);
            let isMasked = phone ? (phone.includes("x") || phone.includes("X") || phone.includes("*")) : true;

            if (isMasked && orderId) {
                const betterPhone = await resolveUnmaskedPhone(supabase, "", email, orderId.toString(), sr, token);
                if (betterPhone && !betterPhone.includes("x")) {
                    phone = betterPhone;
                    isMasked = false;
                }
            }

            if (!phone || phone.includes("x") || phone.includes("X")) {
                phone = `MISSING-SR-${orderId}`;
                isMasked = true;
            }

            const name = extractCustomerName(sr);
            const addressData = extractAddress(sr);
            const srCustomerId = sr.customer_id?.toString() || `SR_${orderId}`;
            let customerId: string | null = null;

            const { data: existingById } = await supabase.from("customers").select("id, name, phone, address, city, state").eq("shopify_customer_id", srCustomerId).maybeSingle();

            if (existingById) {
              customerId = existingById.id;
              const updates: any = {};
              if (name && name !== "Unknown Customer" && (existingById.name === "Shiprocket Customer" || !existingById.name)) updates.name = name;
              if (email) updates.email = email;
              if (addressData.address && !existingById.address) updates.address = addressData.address;
              if (!isMasked && phone && existingById.phone?.includes("x")) updates.phone = phone;

              if (Object.keys(updates).length > 0) {
                await supabase.from("customers").update(updates).eq("id", customerId);
                report.customers_updated++;
              }
            } else {
              if (!isMasked) {
                const { data: existingByPhone } = await supabase.from("customers").select("id, name").eq("phone", phone).maybeSingle();
                if (existingByPhone) {
                  customerId = existingByPhone.id;
                  await supabase.from("customers").update({ shopify_customer_id: srCustomerId }).eq("id", customerId);
                  report.customers_updated++;
                }
              }

              if (!customerId) {
                const uniquePhone = isMasked ? `${phone}_${srCustomerId}` : phone;
                const { data: newCust } = await supabase.from("customers").insert({
                  shopify_customer_id: srCustomerId, name, phone: uniquePhone, email,
                  address: addressData.address, city: addressData.city, state: addressData.state, zip: addressData.zip,
                }).select("id").single();
                if (newCust) { customerId = newCust.id; report.customers_created++; }
              }
            }

            // ── Guard: skip order if we couldn't resolve a customer ──────────
            if (!customerId) {
              console.warn(`⚠️ Skipping order ${orderId}: could not resolve customer_id (masked phone + Shopify 429?)`);
              report.orders_failed++;
              continue;
            }

            const crmStatus = mapShiprocketStatus(sr.status || "");
            const { error: upsertErr } = await supabase.from("orders").upsert({
              shopify_order_id: orderId.toString(),
              order_number: sr.order_no || orderId.toString(),
              customer_id: customerId,
              total_price: parseFloat(sr.total || 0),
              ordered_at: parseShiprocketDate(sr.created_at),
              source: "shiprocket",
              delivery_status: crmStatus,
              fulfillment_status: ["delivered", "in_transit", "out_for_delivery"].includes(crmStatus) ? "fulfilled" : "unfulfilled",
              tracking_number: sr.shipments?.[0]?.awb || sr.awb_code || null,
              courier_name: sr.shipments?.[0]?.courier || sr.courier_name || null,
              line_items: extractLineItems(sr),
            }, { onConflict: "shopify_order_id" });

            if (upsertErr) throw upsertErr;

            // [Self-Healing] Cancel redundant tasks if delivered
            if (crmStatus === "delivered") {
              const { data: orderRef } = await supabase
                .from("orders")
                .select("id")
                .eq("shopify_order_id", orderId.toString())
                .maybeSingle();

              if (orderRef) {
                const { data: cancelledTasks, error: cancelError } = await supabase
                  .from("tasks")
                  .update({ 
                    status: "cancelled", 
                    manager_note: "Auto-cancelled: Order marked as delivered by Shiprocket Sync." 
                  })
                  .eq("order_id", orderRef.id)
                  .in("task_type", ["ndr", "transit_update"])
                  .eq("status", "pending")
                  .select("id");

                if (!cancelError && cancelledTasks && cancelledTasks.length > 0) {
                  console.log(`🧹 Self-Healing: Cancelled ${cancelledTasks.length} redundant tasks for order ${orderId}`);
                }
              }
            }

            report.orders_processed++;
          } catch (err) {
            console.error("Order process error:", err);
            report.orders_failed++;
          }
        }

        const totalCountPages = orderData.meta?.pagination?.total_pages || Math.ceil((orderData.meta?.pagination?.total || 0) / 50);
        hasMore = currentPage < (full ? totalCountPages : MAX_SHALLOW_PAGES);
        currentPage++;
        
        if (full) await sleep(500); // Backoff for full sync
      }

      send({ progress: 95, message: "Finalizing sync report..." });
      await supabase.from("webhook_logs").insert({
        source: "shiprocket", topic: "system_sync", status: "processed",
        payload: { summary: "Shiprocket API Sync Completed", report: report }
      });

      send({ progress: 100, message: "Shiprocket Sync Complete!", report, success: true });
      close();
    } catch (err: any) {
      send({ error: err.message });
      close();
    }
  };

  if (streaming) {
    runSync();
    return new NextResponse(stream, { headers: syncHeaders });
  } else {
    await runSync();
    return NextResponse.json({ success: true, report });
  }
}
