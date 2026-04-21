import { SupabaseClient } from "@supabase/supabase-js";
import { fetchUnmaskedFromShopify } from "./shopify-unmask";

/**
 * Highly aggressive phone number extraction and recovery.
 * Tries several sources: API response, local Abandoned Carts, and Webhook Logs.
 */
export async function resolveUnmaskedPhone(
  supabase: SupabaseClient,
  customerId: string,
  email: string | null,
  orderId: string | null,
  srData: any,
  token: string | null = null
): Promise<string | null> {
  // 1. Try Extracting from provided Shiprocket Data (Standard)
  let phone = extractStandardPhone(srData);
  if (phone && !isMasked(phone)) return phone;

  // 1b. [NEW] Try Shopify Direct Bypass (Feature 16)
  if (orderId) {
      const shopifyData = await fetchUnmaskedFromShopify(supabase, orderId);
      if (shopifyData?.phone) {
          console.log(`🔓 Unmasked via Shopify Bypass [Order ${orderId}]: ${shopifyData.phone}`);
          return shopifyData.phone;
      }
  }

  // 2. Try Local Cross-Reference: Email match in Customers table
  if (email && email !== "noreply@shiprocket.com") {
    const { data: other } = await supabase
      .from("customers")
      .select("phone")
      .eq("email", email)
      .not("phone", "ilike", "%x%")
      .not("phone", "ilike", "%_SR_%")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    
    if (other?.phone) return other.phone;
  }

  // 3. Try Local Side-Channel: Abandoned Carts
  // Match by customer_id or email
  const cartQuery = supabase.from("abandoned_carts").select("phone").not("phone", "ilike", "%x%");
  if (customerId) cartQuery.eq("customer_id", customerId);
  else if (email) cartQuery.eq("email", email);
  
  const { data: cartMatches } = await cartQuery.order("abandoned_at", { ascending: false }).limit(1);
  if (cartMatches?.[0]?.phone && !isMasked(cartMatches[0].phone)) {
    return cartMatches[0].phone;
  }

  // 4. Try Deep-Mining Webhook Logs
  if (orderId) {
    const { data: logs } = await supabase
      .from("webhook_logs")
      .select("payload")
      .or(`payload->>order_id.eq.${orderId},payload->>channel_order_id.eq.${orderId}`)
      .order("created_at", { ascending: false });

    if (logs) {
      for (const log of logs) {
        const found = find10DigitPhone(JSON.stringify(log.payload));
        if (found) return found;
      }
    }
  }

  // 5. Fallback: Return original masked phone if nothing found
  return phone;
}

function isMasked(phone: string): boolean {
  return phone.includes("x") || phone.includes("X") || phone.includes("*");
}

function extractStandardPhone(sr: any): string | null {
  const candidates = [
    sr.billing_phone,
    sr.shipping_phone,
    sr.customer_phone,
    sr.phone_number,
    sr.mobile,
    sr.shipping_address?.phone,
    sr.billing_address?.phone,
  ].filter(Boolean).map((p: any) => String(p).trim().replace(/\s/g, ""));
  
  // Prefer unmasked
  const unmasked = candidates.find((p: string) => !isMasked(p));
  if (unmasked) {
    let cleaned = unmasked.replace(/[^\d]/g, "");
    if (cleaned.startsWith("91") && cleaned.length > 10) cleaned = cleaned.slice(cleaned.length - 10);
    return cleaned;
  }
  
  return candidates[0] || null;
}

function find10DigitPhone(str: string): string | null {
  // Extract real 10-digit numbers (starting with 6-9)
  const matches = str.match(/(?:(?:\+|91)?)?\b([6-9]\d{9})\b/g);
  if (matches) {
      // Return the first one that isn't a known static number
      for (const m of matches) {
          const c = m.replace(/[^\d]/g, "");
          const clean = c.length > 10 ? c.slice(c.length - 10) : c;
          if (!['8008313180', '7907022556'].includes(clean)) return clean;
      }
  }
  return null;
}
