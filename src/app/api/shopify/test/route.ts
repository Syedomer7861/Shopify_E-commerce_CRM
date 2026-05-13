import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { getSystemSettings, getShopifyAccessToken } from "@/lib/server-settings";

export async function GET() {
  const supabase = createServerClient();

  try {
    const settings = await getSystemSettings(supabase);
    if (!settings?.shopify_store_domain) {
      return NextResponse.json({ ok: false, error: "Missing Shopify store domain in settings." }, { status: 400 });
    }

    const domain = String(settings.shopify_store_domain).replace(/^https?:\/\//, "").replace(/\/$/, "");
    const token = await getShopifyAccessToken(supabase);

    const res = await fetch(`https://${domain}/admin/api/2024-04/shop.json`, {
      method: "GET",
      headers: {
        "X-Shopify-Access-Token": token,
        "Content-Type": "application/json",
      },
    });

    if (!res.ok) {
      return NextResponse.json(
        { ok: false, error: `Shopify connection failed with status ${res.status}. Check token/domain/scopes.` },
        { status: 400 }
      );
    }

    const payload = await res.json();
    return NextResponse.json({
      ok: true,
      shopName: payload?.shop?.name || null,
      domain,
      tokenMode: settings.shopify_client_id && settings.shopify_api_secret ? "oauth_refresh" : "static_token",
      expiresAt: settings.shopify_token_expires_at || null,
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message || "Shopify connection test failed." }, { status: 400 });
  }
}
