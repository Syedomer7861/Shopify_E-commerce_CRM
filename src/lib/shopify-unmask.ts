import { SupabaseClient } from "@supabase/supabase-js";
import { getSystemSettings, getShopifyAccessToken } from "./server-settings";

let shopifyUnauthorizedUntilMs = 0;
let hasLoggedUnauthorizedBackoff = false;

// Keyed by org (a literal "" key when no orgId is given, e.g. legacy call
// sites that haven't been threaded through yet) - a single shared slot here
// would serve one org's Shopify settings/token to a different org's lookup
// within the 5-minute window.
const cache = new Map<string, { settings: any; token: string | null; expiry: number }>();

/**
 * Shopify Direct Bypass Utility
 * Calls Shopify Admin API to fetch unmasked customer data.
 */
export async function fetchUnmaskedFromShopify(
  supabase: SupabaseClient,
  orderNumber: string,
  orgId?: string
): Promise<{ phone: string | null; name: string | null } | null> {
  try {
    const now = Date.now();
    if (now < shopifyUnauthorizedUntilMs) {
      if (!hasLoggedUnauthorizedBackoff) {
        hasLoggedUnauthorizedBackoff = true;
        console.warn("Shopify Unmasking paused due to recent 401 responses. Check Admin API token/scopes.");
      }
      return null;
    }
    hasLoggedUnauthorizedBackoff = false;

    // Cache settings and token for 5 minutes to speed up the loop
    const cacheKey = orgId || "";
    let entry = cache.get(cacheKey);
    if (!entry || !entry.token || now > entry.expiry) {
      const settings = await getSystemSettings(supabase, orgId);
      const token = await getShopifyAccessToken(supabase, orgId);
      entry = { settings, token, expiry: now + 5 * 60 * 1000 };
      cache.set(cacheKey, entry);
    }
    const cachedSettings = entry.settings;

    if (!cachedSettings?.shopify_store_domain || !cachedSettings?.shopify_api_key) {
      console.warn("Shopify Unmasking: Missing credentials in settings.");
      return null;
    }

    const domain = cachedSettings.shopify_store_domain.replace(/^https?:\/\//, "").replace(/\/$/, "");
    const token = entry.token;
    if (!token) return null;

    // Use Shopify REST API to find the order by name (e.g., #1001)
    const url = `https://${domain}/admin/api/2024-04/orders.json?name=${encodeURIComponent(orderNumber)}&status=any`;

    const res = await fetch(url, {
      method: "GET",
      headers: {
        "X-Shopify-Access-Token": token,
        "Content-Type": "application/json"
      }
    });

    if (!res.ok) {
      if (res.status === 401) {
        // Avoid hammering Shopify when credentials are invalid/expired.
        shopifyUnauthorizedUntilMs = Date.now() + 10 * 60 * 1000;
        console.error("Shopify API 401 Unauthorized. Validate store domain and Admin API access token/scopes.");
      } else {
        console.error(`Shopify API error: ${res.status}`);
      }
      return null;
    }

    const data = await res.json();
    if (!data.orders || data.orders.length === 0) {
      console.warn(`Shopify Unmasking: Order ${orderNumber} not found.`);
      return null;
    }

    const order = data.orders[0];
    const customer = order.customer;
    const shipping = order.shipping_address;

    // Extract raw phone (Priority: Shipping > Customer)
    let rawPhone = shipping?.phone || customer?.phone || "";
    let cleanPhone = rawPhone.toString().trim().replace(/[^\d]/g, "");
    
    // Normalize to 10 digits
    if (cleanPhone.startsWith("91") && cleanPhone.length > 10) {
        cleanPhone = cleanPhone.slice(cleanPhone.length - 10);
    }

    return {
      phone: cleanPhone || null,
      name: [customer?.first_name, customer?.last_name].filter(Boolean).join(" ") || order.customer_name || null
    };

  } catch (err) {
    console.error("Shopify Unmasking Utility Error:", err);
    return null;
  }
}
