import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { getSystemSettings, getShiprocketToken } from "@/lib/server-settings";
import { resolveUnmaskedPhone } from "@/lib/unmask-utils";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SHIPROCKET_BASE_URL = "https://apiv2.shiprocket.in/v1/external";

async function shiprocketFetch(url: string, token: string) {
  const res = await fetch(url, {
    method: "GET",
    headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
  });
  if (!res.ok) throw new Error(`Shiprocket API error: ${res.status}`);
  return res.json();
}

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
  
  const unmasked = candidates.find((p: string) => !p.includes("x") && !p.includes("X") && !p.includes("*"));
  if (unmasked) {
    let cleaned = unmasked.replace(/[^\d]/g, "");
    if (cleaned.startsWith("91") && cleaned.length > 10) cleaned = cleaned.slice(cleaned.length - 10);
    if (cleaned.length === 10) return cleaned;
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

import { createSyncStream, syncHeaders } from "@/lib/sync-stream";

import fs from 'fs';
import path from 'path';
import { requireInternal } from "@/lib/auth-utils";

export async function POST(req: NextRequest) {
  const unauthorized = await requireInternal(req);
  if (unauthorized) return unauthorized;

  const { stream, send, close } = createSyncStream();
  const streaming = req.nextUrl.searchParams.get("stream") === "true";
  const logPath = path.join(process.cwd(), 'unmask_audit.log');

  const supabase = createServerClient();

  const runSync = async () => {
    const log = (msg: string) => {
        const time = new Date().toISOString();
        fs.appendFileSync(logPath, `[${time}] ${msg}\n`);
    };
    
    try {
      log("--- Sync Started ---");
      send({ progress: 2, message: "Initializing unmasking engine..." });
      
      const settings = await getSystemSettings(supabase);
      if (!settings?.shiprocket_email || !settings?.shiprocket_password) {
        send({ error: "Shiprocket credentials missing" });
        return close();
      }

      // 1. Authenticate (Smart Cache)
      let token: string;
      try {
        token = await getShiprocketToken(supabase);
      } catch (authError) {
        send({ error: "Shiprocket Authentication failed" });
        return close();
      }

      // 2. Find masked customers
      const { customerId } = await req.json().catch(() => ({}));

      let query = supabase.from("customers").select("id, phone, name, email");
      
      if (customerId) {
          query = query.eq("id", customerId);
      } else {
          query = query.or('phone.ilike.%x%,phone.ilike.%_SR_%').limit(100);
      }

      const { data: customers } = await query;

      if (!customers || customers.length === 0) {
        send({ progress: 100, message: "No masked customers found", success: true });
        return close();
      }

      send({ progress: 10, message: `Starting unmasking for ${customers.length} records...` });

      let unmaskedCount = 0;
      let failedCount = 0;
      let mergedCount = 0;

      for (let i = 0; i < customers.length; i++) {
        const cust = customers[i];
        const progress = 10 + Math.round((i / customers.length) * 85);
        send({ progress, message: `Unmasking ${cust.name || 'Customer'}...` });

        try {
          // Find latest order
          const { data: order } = await supabase
            .from("orders")
            .select("shopify_order_id")
            .eq("customer_id", cust.id)
            .order("ordered_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          let shopifyOrderId = order?.shopify_order_id;
          if (!shopifyOrderId && cust.phone?.includes("_SR_")) {
              shopifyOrderId = cust.phone.split("_SR_")[1];
          }

          log(`Processing ${cust.name} (${cust.phone})`);
          log(`  Shopify Order ID: ${shopifyOrderId}`);

          // 🕵️ Step 1: Try Local Multi-Source Resolution
          let phone = await resolveUnmaskedPhone(supabase, cust.id, cust.email || null, shopifyOrderId || null, null, token);
          
          if (phone && !phone.includes("x")) {
              log(`  ✅ Step 1 SUCCESS: ${phone}`);
          }

          // 🕵️ Step 2: If still masked, try Shiprocket API order detail endpoint
          if ((!phone || phone.includes("x") || phone.includes("X")) && shopifyOrderId && token) {
            log(`  Trying Shiprocket for ${shopifyOrderId}...`);
            try {
              await new Promise(r => setTimeout(r, 400)); // Slight rate limiting
              
              let srInternalId = null;
              const searchRes = await shiprocketFetch(`${SHIPROCKET_BASE_URL}/orders?search=${shopifyOrderId}`, token).catch(() => null);

              if (searchRes && searchRes.data && searchRes.data.length > 0) {
                srInternalId = searchRes.data[0].id;
              }

              if (srInternalId) {
                const detail = await shiprocketFetch(`${SHIPROCKET_BASE_URL}/orders/show/${srInternalId}`, token);
                const d = detail.data || detail;
                if (d) {
                  const apiPhone = extractPhone(d);
                  if (apiPhone && !apiPhone.includes("x") && apiPhone.length >= 10) {
                    phone = apiPhone;
                    log(`  ✅ Step 2 SUCCESS: ${phone}`);
                  }
                  // Also update name if it's still generic
                  const name = [d.billing_customer_name, d.billing_last_name].filter(Boolean).join(" ").trim()
                    || [d.shipping_customer_name, d.shipping_last_name].filter(Boolean).join(" ").trim()
                    || d.customer_name;
                  if (name && name !== "Unknown Customer" && (cust.name === "Shiprocket Customer" || !cust.name)) {
                    await supabase.from("customers").update({ name }).eq("id", cust.id);
                  }
                }
              } else {
                log(`  ❌ Shiprocket Miss for ${shopifyOrderId}`);
              }
            } catch (e: any) {
                log(`  ❌ Step 2 Error: ${e.message}`);
            }
          }

          if (phone && !phone.includes("x") && !phone.includes("X")) {
            const { data: existing } = await supabase.from("customers").select("id, name").eq("phone", phone).neq("id", cust.id).maybeSingle();

            if (existing) {
                log(`  Merging into existing: ${existing.name} (${existing.id})`);
                await Promise.all([
                  supabase.from("orders").update({ customer_id: existing.id }).eq("customer_id", cust.id),
                  supabase.from("tasks").update({ customer_id: existing.id }).eq("customer_id", cust.id),
                  supabase.from("abandoned_carts").update({ customer_id: existing.id }).eq("customer_id", cust.id),
                  supabase.from("call_logs").update({ customer_id: existing.id }).eq("customer_id", cust.id),
                ]);
                const delRes = await supabase.from("customers").delete().eq("id", cust.id);
                if (delRes.error) log(`  ❌ Delete failed: ${delRes.error.message}`);
                else log(`  ✅ Merge successful`);
                mergedCount++;
            } else {
                log(`  Updating customer phone...`);
                const { error: updateError } = await supabase.from("customers").update({ phone }).eq("id", cust.id);
                if (updateError) log(`  ❌ Update failed: ${updateError.message}`);
                else log(`  ✅ Update successful`);
            }
            unmaskedCount++;
          } else {
            log(`  ❌ FAILED to unmask`);
            failedCount++;
          }
        } catch (e: any) {
          log(`  Critical Loop Error: ${e.message}`);
          failedCount++;
        }
      }

      log(`Summary: Unmasked=${unmaskedCount}, Merged=${mergedCount}, Failed=${failedCount}`);
      send({ 
        progress: 100, 
        message: `Tool Complete! Recovered: ${unmaskedCount}`, 
        success: true,
        report: { unmaskedCount, mergedCount, failedCount } 
      });
      close();
    } catch (err: any) {
      log(`FATAL ERROR: ${err.message}`);
      send({ error: err.message });
      close();
    }
  };

  if (streaming) {
    runSync();
    return new NextResponse(stream, { headers: syncHeaders });
  } else {
    await runSync();
    return NextResponse.json({ success: true });
  }
}
