import { SupabaseClient } from "@supabase/supabase-js";
import { fetchUnmaskedFromShopify } from "./shopify-unmask";
import { normalizePhone } from "./phone-utils";

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
  token: string | null = null,
  orgId?: string
): Promise<string | null> {
  // 1. Try Extracting from provided Shiprocket Data (Standard)
  let phone = extractStandardPhone(srData);
  if (phone && !isMasked(phone)) return phone;

  // 2. Try Local Cross-Reference: Email match in Customers table. Org-scoped
  // when known - otherwise this could return a DIFFERENT tenant's real
  // phone number for a shared/generic email and have the caller write it
  // onto this org's customer row.
  if (email && email !== "noreply@shiprocket.com") {
    let emailQuery = supabase
      .from("customers")
      .select("phone")
      .eq("email", email)
      .not("phone", "ilike", "%x%")
      .not("phone", "ilike", "%_SR_%");
    if (orgId) emailQuery = emailQuery.eq("org_id", orgId);
    const { data: other } = await emailQuery
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (other?.phone) return other.phone;
  }

  // 3. Try Local Side-Channel: Abandoned Carts
  let cartQuery = supabase.from("abandoned_carts").select("phone").not("phone", "ilike", "%x%");
  if (customerId) cartQuery = cartQuery.eq("customer_id", customerId);
  else if (email) cartQuery = cartQuery.eq("email", email);
  if (orgId) cartQuery = cartQuery.eq("org_id", orgId);

  const { data: cartMatches } = await cartQuery.order("abandoned_at", { ascending: false }).limit(1);
  if (cartMatches?.[0]?.phone && !isMasked(cartMatches[0].phone)) {
    return cartMatches[0].phone;
  }

  // 3b (removed - "Aggressive Address Match", #19256): matched any existing
  // customer whose stored address shared the incoming order's first 20
  // address characters via ILIKE. Two unrelated real people can easily
  // share a 20-char prefix (a landmark, a building, a common locality
  // phrase) - this silently reattached one customer's real order to a
  // completely different, unrelated customer with no name check at all.
  // Confirmed as a live cause of exactly that: a real order for one
  // person ended up merged into an unrelated customer record that had
  // been accumulating other people's orders the same way. Address
  // proximity is not identity - removed rather than tightened, since
  // there's no threshold that makes a free-text substring match safe.

  // 4. Try Deep-Mining Webhook Logs - was blind full-text regex over the
  // ENTIRE stored JSON payload for any 10-digit number, which could just
  // as easily pick up an unrelated tracking id, order id fragment, or a
  // different person's number mentioned in a note as the real customer's
  // phone. Now only reads the same known phone-shaped fields
  // extractStandardPhone already trusts, just from an earlier webhook
  // event for the same order rather than the current one.
  if (orderId) {
    let logsQuery = supabase
      .from("webhook_logs")
      .select("payload")
      .or(`payload->>order_id.eq.${orderId},payload->>channel_order_id.eq.${orderId}`);
    if (orgId) logsQuery = logsQuery.eq("org_id", orgId);
    const { data: logs } = await logsQuery.order("created_at", { ascending: false });

    if (logs) {
      for (const log of logs) {
        const data = (log.payload as any)?.data || (log.payload as any)?.payload || log.payload;
        const found = extractStandardPhone(data);
        if (found && !isMasked(found)) return found;
      }
    }
  }

  // 5. [LAST RESORT] Try Shopify Direct Bypass (Feature 16)
  // This is the slowest step (Network call), so we do it last.
  if (orderId) {
      const shopifyData = await fetchUnmaskedFromShopify(supabase, orderId, orgId);
      if (shopifyData?.phone) {
          console.log(`🔓 Unmasked via Shopify Bypass [Order ${orderId}]: ${shopifyData.phone}`);
          return shopifyData.phone;
      }
  }

  // Fallback: Return original masked phone if nothing found
  return phone;
}

function isMasked(phone: string): boolean {
  return phone.includes("x") || phone.includes("X") || phone.includes("*");
}

function extractStandardPhone(sr: any): string | null {
  if (!sr) return null;
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
  if (unmasked) return normalizePhone(unmasked);
  
  return candidates[0] || null;
}
