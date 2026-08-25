import { getShopifyAccessToken, getSystemSettings } from "@/lib/server-settings";

function stripHtml(html: string | null | undefined) {
  return (html || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Pull the real, current product catalog from Shopify (name, live price,
 * description, tags) and upsert it into product_catalog. This is what
 * powers real upsell suggestions instead of the old hand-typed, quickly
 * stale UPSELL_RULES table. Only active/published products stay marked
 * active=true; anything no longer returned by Shopify gets deactivated
 * rather than deleted, so historical suggestion logs still resolve.
 */
export async function refreshProductCatalog(supabase: any) {
  const settings = await getSystemSettings(supabase);
  if (!settings?.shopify_store_domain) throw new Error("Shopify not configured");
  const domain = String(settings.shopify_store_domain).replace(/^https?:\/\//, "").replace(/\/$/, "");
  const token = await getShopifyAccessToken(supabase);

  const seenIds: string[] = [];
  let synced = 0;
  let url: string | null = `https://${domain}/admin/api/2024-04/products.json?limit=250&status=active`;
  let pages = 0;

  while (url && pages < 40) { // safety cap, ~10k products
    const res: Response = await fetch(url, { headers: { "X-Shopify-Access-Token": token } });
    if (!res.ok) throw new Error(`Shopify products API HTTP ${res.status}`);
    const json: any = await res.json();
    const products = json.products || [];

    for (const p of products) {
      const variant = (p.variants || [])[0];
      const price = variant ? parseFloat(variant.price) : null;
      const id = String(p.id);
      seenIds.push(id);

      const { error } = await supabase.from("product_catalog").upsert({
        shopify_product_id: id,
        name: p.title,
        price,
        description: stripHtml(p.body_html).slice(0, 500),
        tags: (p.tags || "").split(",").map((t: string) => t.trim()).filter(Boolean),
        product_type: p.product_type || null,
        handle: p.handle || null,
        image_url: p.image?.src || null,
        active: true,
        last_synced_at: new Date().toISOString(),
      }, { onConflict: "shopify_product_id" });

      if (!error) synced++;
    }

    const link = res.headers.get("Link");
    const next = link?.match(/<([^>]+)>;\s*rel="next"/);
    url = next ? next[1] : null;
    pages++;
  }

  // Deactivate anything Shopify no longer returned (discontinued/unpublished).
  let deactivated = 0;
  if (seenIds.length > 0) {
    const { count } = await supabase
      .from("product_catalog")
      .update({ active: false })
      .eq("active", true)
      .not("shopify_product_id", "in", `(${seenIds.map((id) => `"${id}"`).join(",")})`)
      .select("id", { count: "exact", head: true });
    deactivated = count || 0;
  }

  return { synced, deactivated, total: seenIds.length };
}
