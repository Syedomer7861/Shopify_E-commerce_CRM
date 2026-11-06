import { NextRequest, NextResponse } from "next/server";
import { ensureAdmin, hasInternalSecret } from "@/lib/auth-utils";
import { createAdminClient } from "@/lib/supabase";
import { getShopifyAccessToken, getShiprocketToken, getSystemSettings } from "@/lib/server-settings";

/**
 * One-off diagnostic: are all Shopify orders and all Shiprocket-known
 * orders actually present in our own `orders` table? The routine crons
 * (shopify-sync's updated_at_min incremental window, shiprocket-sync's
 * MAX_SHALLOW_PAGES-by-default shallow scan) are deliberately narrow for
 * speed - this does a genuine full historical pull from both APIs and
 * diffs against orders.shopify_order_id (the shared key both syncs write
 * to - see shiprocket sync's onConflict: "shopify_order_id").
 *
 * Not meant to run routinely - full history from a large store can take
 * a while and isn't chunked for Vercel's function limit. Run manually.
 */
export async function GET(req: NextRequest) {
  let supabase;
  if (hasInternalSecret(req)) {
    supabase = createAdminClient();
  } else {
    const admin = await ensureAdmin();
    if (admin.errorResponse) return admin.errorResponse;
    supabase = admin.supabase;
  }

  const settings = await getSystemSettings(supabase!);
  const orgId = settings?.org_id;

  // 1. Every shopify_order_id we already have (this org only - otherwise
  // another tenant's order sharing the same Shopify numeric id, which is
  // likely since Shopify ids are per-store, would read as a false match).
  const ourIds = new Set<string>();
  {
    const PAGE = 1000;
    for (let from = 0; ; from += PAGE) {
      const { data } = await supabase!
        .from("orders")
        .select("shopify_order_id")
        .not("shopify_order_id", "is", null)
        .eq("org_id", orgId)
        .range(from, from + PAGE - 1);
      if (!data || data.length === 0) break;
      data.forEach((o: any) => ourIds.add(String(o.shopify_order_id)));
      if (data.length < PAGE) break;
    }
  }

  // 2. Every order Shopify has, full history, no updated_at_min window.
  const shopify = { ok: false, total: 0, missing: [] as { id: string; name: string }[], error: null as string | null };
  try {
    if (!settings?.shopify_store_domain) throw new Error("Shopify not configured");
    const domain = String(settings.shopify_store_domain).replace(/^https?:\/\//, "").replace(/\/$/, "");
    const token = await getShopifyAccessToken(supabase!);

    let url: string | null = `https://${domain}/admin/api/2024-04/orders.json?status=any&limit=250`;
    let pages = 0;
    while (url && pages < 200) { // safety cap, ~50k orders
      const res: Response = await fetch(url, { headers: { "X-Shopify-Access-Token": token } });
      if (!res.ok) throw new Error(`Shopify API HTTP ${res.status}`);
      const json: any = await res.json();
      const orders = json.orders || [];
      shopify.total += orders.length;
      for (const o of orders) {
        const id = String(o.id);
        if (!ourIds.has(id)) shopify.missing.push({ id, name: o.name || o.order_number || id });
      }
      const link = res.headers.get("Link");
      const next = link?.match(/<([^>]+)>;\s*rel="next"/);
      url = next ? next[1] : null;
      pages++;
    }
    shopify.ok = true;
  } catch (err: any) {
    shopify.error = err.message || String(err);
  }

  // 3. Every order Shiprocket knows about, full history.
  const shiprocket = { ok: false, total: 0, missing: [] as { id: string }[], error: null as string | null };
  try {
    const token = await getShiprocketToken(supabase!);
    let page = 1;
    let totalPages = 1;
    do {
      const res = await fetch(
        `https://apiv2.shiprocket.in/v1/external/orders?per_page=50&page=${page}&sort=created_at&sort_dir=desc`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) throw new Error(`Shiprocket API HTTP ${res.status}`);
      const json: any = await res.json();
      const orders = json.data || [];
      totalPages = json.meta?.pagination?.total_pages || 1;
      shiprocket.total += orders.length;
      for (const sr of orders) {
        const id = String(sr.channel_order_id || sr.id);
        if (!ourIds.has(id)) shiprocket.missing.push({ id });
      }
      page++;
    } while (page <= totalPages && page <= 500); // safety cap
    shiprocket.ok = true;
  } catch (err: any) {
    shiprocket.error = err.message || String(err);
  }

  // Diagnostic: pull a small sample of missing orders' raw Shopify data to
  // look for a common trait (no customer, weird status, etc.) that would
  // explain why sync-logic.ts's per-order try/catch skipped them.
  const sample: any[] = [];
  if (shopify.ok && shopify.missing.length > 0) {
    const domain = String(settings?.shopify_store_domain).replace(/^https?:\/\//, "").replace(/\/$/, "");
    const token = await getShopifyAccessToken(supabase!);
    const pick = [shopify.missing[0], shopify.missing[Math.floor(shopify.missing.length / 2)], shopify.missing[shopify.missing.length - 1]];
    for (const m of pick) {
      try {
        const res = await fetch(`https://${domain}/admin/api/2024-04/orders/${m.id}.json`, { headers: { "X-Shopify-Access-Token": token } });
        const json: any = await res.json();
        const o = json.order;
        sample.push({
          id: m.id,
          name: o?.name,
          has_customer: !!o?.customer,
          customer_id: o?.customer?.id || null,
          email: o?.email || null,
          phone: o?.phone || o?.customer?.phone || o?.shipping_address?.phone || null,
          financial_status: o?.financial_status,
          fulfillment_status: o?.fulfillment_status,
          test: o?.test,
          cancelled_at: o?.cancelled_at,
          created_at: o?.created_at,
          updated_at: o?.updated_at,
          tags: o?.tags,
        });
      } catch (e: any) {
        sample.push({ id: m.id, fetchError: e.message });
      }
    }
  }

  const full = req.nextUrl.searchParams.get("full") === "true";
  const cap = full ? Infinity : 50;

  return NextResponse.json({
    ourOrderCount: ourIds.size,
    shopify: { ...shopify, missingCount: shopify.missing.length, missing: shopify.missing.slice(0, cap) },
    shiprocket: { ...shiprocket, missingCount: shiprocket.missing.length, missing: shiprocket.missing.slice(0, cap) },
    sample,
  });
}
