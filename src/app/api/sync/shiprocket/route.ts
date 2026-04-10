import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SHIPROCKET_BASE_URL = "https://apiv2.shiprocket.in/v1/external";

function mapShiprocketStatus(status: string | number) {
  const s = String(status).toLowerCase();
  if (s.includes("delivered") || s === "7" || s === "10") return "delivered";
  if (s.includes("shipped") || s === "6" || s === "12" || s.includes("transit")) return "in_transit";
  if (s.includes("out for delivery") || s === "13") return "out_for_delivery";
  if (s.includes("rto") || s === "9") return "rto";
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

/**
 * Extract the BEST customer name from a Shiprocket order.
 * Shiprocket has multiple name fields — we check all of them.
 */
function extractCustomerName(sr: any): string {
  // Priority: billing name > shipping name > customer name > fallback
  const billing = [sr.billing_customer_name, sr.billing_last_name].filter(Boolean).join(" ").trim();
  const shipping = [sr.shipping_customer_name, sr.shipping_last_name].filter(Boolean).join(" ").trim();
  const customer = [sr.customer_first_name, sr.customer_last_name].filter(Boolean).join(" ").trim();
  const generic = sr.customer_name?.trim();
  
  return billing || shipping || customer || generic || "Unknown Customer";
}

/**
 * Extract best phone number (unmasked preferred)
 */
function extractPhone(sr: any): string | null {
  const candidates = [
    sr.billing_phone,
    sr.shipping_phone,
    sr.customer_phone,
    sr.phone_number,
    sr.mobile,
    sr.shipping_address?.phone,
    sr.billing_address?.phone,
  ].filter(Boolean).map((p: any) => String(p).trim().replace(/\s/g, ""));
  
  // Prefer unmasked phone
  const unmasked = candidates.find((p: string) => !p.includes("x") && !p.includes("X") && !p.includes("*"));
  if (unmasked) {
    let cleaned = unmasked.replace(/[^\d]/g, "");
    if (cleaned.startsWith("91") && cleaned.length > 10) cleaned = cleaned.slice(2);
    if (cleaned.length === 10) return cleaned;
    return cleaned;
  }
  
  // DEEP SEARCH Fallback: Sometimes it's hidden in other fields in detail view
  const fullJson = JSON.stringify(sr);
  const potentialNumbers = fullJson.match(/\b([6-9]\d{9})\b/g);
  if (potentialNumbers) {
      // Filter out known merchant/static numbers
      const merchantPhone = sr.pickup_address?.phone;
      const valid = potentialNumbers.find(n => n !== merchantPhone && n !== '8008313180' && n !== '7907022556');
      if (valid) return valid;
  }

  // Fallback to first available masked
  if (candidates.length > 0) {
    let cleaned = candidates[0].replace(/[^\d]/g, "");
    if (cleaned.startsWith("91") && cleaned.length > 10) cleaned = cleaned.slice(2);
    if (!cleaned && candidates[0].match(/^[xX*]+$/)) return candidates[0];
    return cleaned || candidates[0];
  }
  return null;
}

/**
 * Extract email from all available fields
 */
function extractEmail(sr: any): string | null {
  return sr.billing_email || sr.shipping_email || sr.customer_email || null;
}

/**
 * Extract full address components
 */
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

/**
 * Extract line items from Shiprocket order
 */
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

export async function POST(req: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  try {
    // 1. Get Credentials
    const { data: settings } = await supabase
      .from("settings")
      .select("shiprocket_email, shiprocket_password")
      .eq("id", "00000000-0000-0000-0000-000000000000")
      .single();

    if (!settings?.shiprocket_email || !settings?.shiprocket_password) {
      return NextResponse.json({ error: "Shiprocket credentials not configured" }, { status: 400 });
    }

    // 2. Authenticate
    const authRes = await fetch(`${SHIPROCKET_BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: settings.shiprocket_email.trim(), password: settings.shiprocket_password.trim() })
    });

    if (!authRes.ok) {
      const authErr = await authRes.json();
      return NextResponse.json({ error: "Authentication Failed", details: authErr }, { status: 401 });
    }

    const { token } = await authRes.json();
    
    const report = { 
      orders_processed: 0, 
      orders_failed: 0,
      customers_created: 0, 
      customers_updated: 0, 
      abandoned_carts: 0,
      pages_fetched: 0 
    };

    // ═══════════════════════════════════════════════════════════════════
    // 3. SYNC ALL ORDERS (paginated — fetch ALL pages, not just first 50)
    // ═══════════════════════════════════════════════════════════════════
    let currentPage = 1;
    let hasMore = true;

    while (hasMore && currentPage <= 20) { // Safety cap: max 20 pages = 1000 orders
      console.log(`[Shiprocket Sync] Fetching orders page ${currentPage}...`);
      
      const orderData = await shiprocketFetch(
        `${SHIPROCKET_BASE_URL}/orders?per_page=50&page=${currentPage}&sort=created_at&sort_dir=desc`,
        token
      );
      
      const srOrders = orderData.data || [];
      if (srOrders.length === 0) { hasMore = false; break; }
      report.pages_fetched++;

      for (const sr of srOrders) {
        try {
          const orderId = sr.channel_order_id || sr.id;
          const phone = extractPhone(sr);
          if (!phone) continue;

          const name = extractCustomerName(sr);
          const email = extractEmail(sr);
          const addressData = extractAddress(sr);
          const isMasked = phone.includes("x") || phone.includes("X") || phone.includes("*");

          // ── CUSTOMER SYNC (Create or Update) ──
          const srCustomerId = sr.customer_id?.toString() || `SR_${orderId}`;
          let customerId: string | null = null;

          // Try find by Shiprocket ID first
          const { data: existingById } = await supabase
            .from("customers")
            .select("id, name, phone, address, city, state, email")
            .eq("shopify_customer_id", srCustomerId)
            .maybeSingle();

          if (existingById) {
            customerId = existingById.id;
            
            // UPDATE existing customer if we have BETTER data now
            const updates: any = {};
            if (name && name !== "Unknown Customer" && (existingById.name === "Shiprocket Customer" || existingById.name === "Unknown Customer" || !existingById.name)) {
              updates.name = name;
            }
            if (email && !existingById.email) updates.email = email;
            if (addressData.address && !existingById.address) updates.address = addressData.address;
            if (addressData.city && !existingById.city) updates.city = addressData.city;
            if (addressData.state && !existingById.state) updates.state = addressData.state;
            if (addressData.zip) updates.zip = addressData.zip;
            if (!isMasked && phone && existingById.phone?.includes("x")) updates.phone = phone;

            if (Object.keys(updates).length > 0) {
              await supabase.from("customers").update(updates).eq("id", customerId);
              report.customers_updated++;
            }
          } else {
            // Try find by phone
            if (!isMasked) {
              const { data: existingByPhone } = await supabase
                .from("customers")
                .select("id, name, phone, address, city, state, email")
                .eq("phone", phone)
                .maybeSingle();
              
              if (existingByPhone) {
                customerId = existingByPhone.id;
                // Also update this customer with better data
                const updates: any = {};
                if (name && name !== "Unknown Customer" && (existingByPhone.name === "Shiprocket Customer" || existingByPhone.name === "Unknown Customer")) updates.name = name;
                if (email && !existingByPhone.email) updates.email = email;
                if (addressData.address && !existingByPhone.address) updates.address = addressData.address;
                if (addressData.city && !existingByPhone.city) updates.city = addressData.city;
                if (addressData.state && !existingByPhone.state) updates.state = addressData.state;
                // Link the Shiprocket ID
                updates.shopify_customer_id = srCustomerId;
                
                if (Object.keys(updates).length > 0) {
                  await supabase.from("customers").update(updates).eq("id", customerId);
                  report.customers_updated++;
                }
              } else if (email) {
                  // NEW: Try find by email to see if we can unmask an existing customer
                  const { data: existingByEmail } = await supabase
                    .from("customers")
                    .select("id, phone")
                    .eq("email", email)
                    .maybeSingle();
                  
                  if (existingByEmail && (existingByEmail.phone?.includes("x") || existingByEmail.phone?.includes("_SR_"))) {
                      customerId = existingByEmail.id;
                      await supabase.from("customers").update({ 
                          phone: phone, 
                          shopify_customer_id: srCustomerId 
                      }).eq("id", customerId);
                      report.customers_updated++;
                  }
              }
            }

            // Create new customer if not found at all
            if (!customerId) {
              const uniquePhone = isMasked ? `${phone}_${srCustomerId}` : phone;
              const { data: newCust, error: createErr } = await supabase.from("customers").insert({
                shopify_customer_id: srCustomerId,
                name,
                phone: uniquePhone,
                email,
                address: addressData.address,
                city: addressData.city,
                state: addressData.state,
                zip: addressData.zip,
              }).select("id").single();

              if (createErr) {
                console.error(`❌ Customer create failed:`, createErr);
                continue;
              }
              customerId = newCust.id;
              report.customers_created++;
            }
          }

          // ── ORDER SYNC ──
          const crmStatus = mapShiprocketStatus(sr.status || "");
          const lineItems = extractLineItems(sr);
          
          const { error: orderErr } = await supabase.from("orders").upsert({
            shopify_order_id: orderId.toString(),
            order_number: sr.order_no || sr.channel_order_id?.toString() || orderId.toString(),
            customer_id: customerId,
            total_price: parseFloat(sr.total || sr.sub_total || 0),
            ordered_at: parseShiprocketDate(sr.created_at),
            source: "shopify",
            delivery_status: crmStatus,
            fulfillment_status: crmStatus === "delivered" ? "fulfilled" : (crmStatus === "in_transit" ? "shipped" : "unfulfilled"),
            tracking_number: sr.shipments?.[0]?.awb || sr.awb_code || null,
            delivered_at: crmStatus === "delivered" ? parseShiprocketDate(sr.delivered_date) : null,
            line_items: lineItems,
          }, { onConflict: "shopify_order_id" });

          if (!orderErr) report.orders_processed++;
          else { console.error(`❌ Order ${orderId}:`, orderErr); report.orders_failed++; }
        } catch (e: any) {
          console.error(`❌ Order processing error:`, e.message);
          report.orders_failed++;
        }
      }

      // Check if there are more pages
      const totalPages = Math.ceil((orderData.meta?.pagination?.total || 0) / 50);
      hasMore = currentPage < totalPages;
      currentPage++;
    }

    // ═══════════════════════════════════════════════════════════════════
    // 4. SYNC ABANDONED CHECKOUTS (if Shiprocket has them)
    // ═══════════════════════════════════════════════════════════════════
    try {
      const abandonedRes = await shiprocketFetch(
        `${SHIPROCKET_BASE_URL}/abandoned-orders?per_page=50`,
        token
      );
      const abandonedOrders = abandonedRes.data || abandonedRes.abandoned_orders || [];
      
      for (const cart of abandonedOrders) {
        try {
          const phone = extractPhone(cart);
          if (!phone) continue;
          
          const name = extractCustomerName(cart);
          const email = extractEmail(cart);
          const cartId = cart.id?.toString() || cart.channel_order_id?.toString();
          if (!cartId) continue;

          // Find or create customer for this cart
          let customerId: string | null = null;
          const isMasked = phone.includes("x") || phone.includes("X");

          if (!isMasked) {
            const { data: existing } = await supabase
              .from("customers")
              .select("id")
              .eq("phone", phone)
              .maybeSingle();
            if (existing) customerId = existing.id;
          }

          if (!customerId) {
            const srCustId = cart.customer_id?.toString() || `AC_${cartId}`;
            const { data: byId } = await supabase
              .from("customers")
              .select("id")
              .eq("shopify_customer_id", srCustId)
              .maybeSingle();
            if (byId) customerId = byId.id;
          }

          if (!customerId) {
            const uniquePhone = isMasked ? `${phone}_AC_${cartId}` : phone;
            const { data: newCust } = await supabase.from("customers").insert({
              name,
              phone: uniquePhone,
              email,
              shopify_customer_id: `AC_${cartId}`,
            }).select("id").single();
            if (newCust) customerId = newCust.id;
          }

          if (!customerId) continue;

          // Extract cart items
          const items = (cart.products || cart.order_items || cart.line_items || []).map((p: any) => ({
            name: p.name || p.product_name || p.title || "Product",
            qty: parseInt(p.units || p.quantity || p.qty || 1),
            price: parseFloat(p.selling_price || p.price || 0),
          }));
          if (items.length === 0) {
            items.push({ name: "Abandoned Item", qty: 1, price: parseFloat(cart.total || 0) });
          }

          // Check if already recovered (customer has an order)
          const { data: hasOrder } = await supabase
            .from("orders")
            .select("id")
            .eq("customer_id", customerId)
            .limit(1)
            .maybeSingle();

          const { error: cartErr } = await supabase.from("abandoned_carts").upsert({
            shopify_cart_id: cartId,
            customer_id: customerId,
            customer_name: name,
            customer_email: email,
            customer_phone: phone,
            line_items: items,
            total_price: parseFloat(cart.total || cart.sub_total || 0),
            abandoned_at: parseShiprocketDate(cart.created_at),
            status: hasOrder ? "recovered" : "pending",
            recovery_url: cart.checkout_url || cart.recovery_url || null,
          }, { onConflict: "shopify_cart_id" });

          if (!cartErr) report.abandoned_carts++;
        } catch (e: any) {
          console.error(`❌ Abandoned cart error:`, e.message);
        }
      }
    } catch (e: any) {
      // Shiprocket may not support abandoned orders API — that's OK
      console.log(`[Shiprocket Sync] Abandoned orders API not available: ${e.message}`);
    }

    // ═══════════════════════════════════════════════════════════════════
    // 5. FIX EXISTING "Shiprocket Customer" names by re-fetching order details
    // ═══════════════════════════════════════════════════════════════════
    const { data: badCustomers } = await supabase
      .from("customers")
      .select("id, shopify_customer_id")
      .in("name", ["Shiprocket Customer", "Unknown Customer", ""]);

    if (badCustomers && badCustomers.length > 0) {
      console.log(`[Shiprocket Sync] Fixing ${badCustomers.length} customers with bad names...`);
      for (const cust of badCustomers) {
        try {
          // Find their order to get the Shiprocket order ID
          const { data: order } = await supabase
            .from("orders")
            .select("shopify_order_id")
            .eq("customer_id", cust.id)
            .limit(1)
            .maybeSingle();
          
          if (order?.shopify_order_id) {
            // Fetch order details from Shiprocket
            const detail = await shiprocketFetch(
              `${SHIPROCKET_BASE_URL}/orders/show/${order.shopify_order_id}`,
              token
            );
            const d = detail.data || detail;
            if (d) {
              const name = extractCustomerName(d);
              const addressData = extractAddress(d);
              const email = extractEmail(d);
              const phone = extractPhone(d);
              
              const updates: any = {};
              if (name && name !== "Unknown Customer") updates.name = name;
              if (email) updates.email = email;
              if (addressData.address) updates.address = addressData.address;
              if (addressData.city) updates.city = addressData.city;
              if (addressData.state) updates.state = addressData.state;
              if (addressData.zip) updates.zip = addressData.zip;
              if (phone && !phone.includes("x")) updates.phone = phone;
              
              if (Object.keys(updates).length > 0) {
                await supabase.from("customers").update(updates).eq("id", cust.id);
                report.customers_updated++;
              }
            }
          }
        } catch (e: any) {
          // Individual detail fetch failed — skip
          console.log(`[Shiprocket Sync] Could not fix customer ${cust.id}: ${e.message}`);
        }
      }
    }

    return NextResponse.json({ 
      success: true, 
      report
    });

  } catch (err: any) {
    console.error("❌ Shiprocket Sync Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
