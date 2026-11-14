import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { getSystemSettings } from "@/lib/server-settings";
import { requireOwnerOrInternal } from "@/lib/auth-utils";

/**
 * Scheduled WhatsApp delivery for the Analytics/Reports page's own KPIs
 * (RTO rate, reorder rate, AOV, recovery, top state/product) - distinct
 * from daily-digest.ts, which covers team/task-ops metrics. Same send
 * mechanism (WhatsApp bridge, settings.whatsapp_admin_phone) so it slots
 * into the existing cron infra without new plumbing.
 *
 * ?range=daily (default) sends every time it's called - meant to run once
 * a day. ?range=weekly self-gates to Mondays only, so it can be wired into
 * the same daily cron trigger without a separate weekly schedule.
 */
export async function POST(req: NextRequest) {
  const unauthorized = await requireOwnerOrInternal(req);
  if (unauthorized) return unauthorized;

  const supabase = createAdminClient();
  const range = req.nextUrl.searchParams.get("range") === "weekly" ? "weekly" : "daily";
  const force = req.nextUrl.searchParams.get("force") === "true";

  const now = new Date();
  if (range === "weekly" && now.getUTCDay() !== 1 && !force) {
    // IST is UTC+5:30, close enough to UTC's day boundary that Monday-in-UTC
    // covers the intended "once a week" cadence without extra timezone math.
    return NextResponse.json({ skipped: true, reason: "Weekly digest only sends on Mondays" });
  }

  const { data: orgs } = await supabase.from("organizations").select("id").eq("is_active", true);
  const results = [];
  for (const org of orgs ?? []) {
    results.push({ orgId: org.id, ...(await sendDigestForOrg(supabase, org.id, range, now)) });
  }
  return NextResponse.json({ orgs: results });
}

async function sendDigestForOrg(supabase: ReturnType<typeof createAdminClient>, orgId: string, range: "daily" | "weekly", now: Date) {
  const settings = await getSystemSettings(supabase, orgId);
  if (!settings?.whatsapp_admin_phone) {
    return { error: "No admin phone set" };
  }

  const rangeStart = new Date(now.getTime() - (range === "weekly" ? 7 : 1) * 86_400_000).toISOString();
  const rangeEnd = now.toISOString();

  try {
    const { data: orders } = await supabase
      .from("orders")
      .select("total_price, delivery_status, line_items, customer:customers(state)")
      .eq("org_id", orgId)
      .gte("ordered_at", rangeStart)
      .lte("ordered_at", rangeEnd);

    const orderList = orders || [];
    const orderCount = orderList.length;
    const grossRevenue = orderList.reduce((s, o) => s + (Number(o.total_price) || 0), 0);
    const deliveredRevenue = orderList.filter(o => o.delivery_status === "delivered").reduce((s, o) => s + (Number(o.total_price) || 0), 0);
    const rtoOrders = orderList.filter(o => o.delivery_status === "rto");
    const rtoRevenue = rtoOrders.reduce((s, o) => s + (Number(o.total_price) || 0), 0);
    const rtoRate = orderCount > 0 ? Math.round((rtoOrders.length / orderCount) * 100) : 0;
    const aov = orderCount > 0 ? Math.round(grossRevenue / orderCount) : 0;

    const stateRevenue: Record<string, number> = {};
    orderList.forEach(o => {
      const s = (o.customer as any)?.state || "Other";
      stateRevenue[s] = (stateRevenue[s] || 0) + (Number(o.total_price) || 0);
    });
    const topState = Object.entries(stateRevenue).sort((a, b) => b[1] - a[1])[0];

    const productRevenue: Record<string, number> = {};
    orderList.forEach(o => {
      (o.line_items as any[])?.forEach(l => {
        if (l.__metadata) return;
        const name = l.name || l.title;
        if (!name) return;
        productRevenue[name] = (productRevenue[name] || 0) + (Number(l.price) * (l.quantity || l.qty || 1) || 0);
      });
    });
    const topProduct = Object.entries(productRevenue).sort((a, b) => b[1] - a[1])[0];

    const { data: carts } = await supabase
      .from("abandoned_carts")
      .select("total_price, recovery_status")
      .eq("org_id", orgId)
      .gte("abandoned_at", rangeStart)
      .lte("abandoned_at", rangeEnd);
    const cartList = carts || [];
    const recoveredCarts = cartList.filter(c => c.recovery_status === "recovered");
    const recoveredRevenue = recoveredCarts.reduce((s, c) => s + (Number(c.total_price) || 0), 0);
    const recoveryRate = cartList.length > 0 ? Math.round((recoveredCarts.length / cartList.length) * 100) : 0;

    // Reorder rate is a snapshot of the whole customer base, not scoped to
    // this range - same definition the Analytics page itself uses.
    const { count: repeatCount } = await supabase.from("customers").select("id", { count: "exact", head: true }).eq("segment", "repeat").eq("org_id", orgId);
    const { count: totalCustomers } = await supabase.from("customers").select("id", { count: "exact", head: true }).eq("org_id", orgId);
    const reorderRate = totalCustomers ? Math.round(((repeatCount || 0) / totalCustomers) * 100) : 0;

    const periodLabel = range === "weekly" ? "Last 7 Days" : "Last 24 Hours";
    const message =
      `📈 *ANALYTICS DIGEST*\n` +
      `📅 _Period: ${periodLabel}_\n` +
      `──────────────────\n\n` +
      `💰 *REVENUE*\n` +
      `• Orders: *${orderCount}*\n` +
      `• Delivered Revenue: *₹${deliveredRevenue.toLocaleString()}*\n` +
      `• AOV: *₹${aov.toLocaleString()}*\n\n` +
      `🚚 *DELIVERY*\n` +
      `• RTO Rate: *${rtoRate}%* (₹${rtoRevenue.toLocaleString()} returned)\n\n` +
      `🛒 *RECOVERY*\n` +
      `• Recovered: *${recoveredCarts.length}/${cartList.length}* (${recoveryRate}%)\n` +
      `• Recovered Revenue: *₹${recoveredRevenue.toLocaleString()}*\n\n` +
      `🔁 *CUSTOMERS*\n` +
      `• Reorder Rate: *${reorderRate}%*\n\n` +
      `🏆 *TOP THIS PERIOD*\n` +
      `• State: *${topState ? `${topState[0]} (₹${topState[1].toLocaleString()})` : "—"}*\n` +
      `• Product: *${topProduct ? `${topProduct[0]} (₹${Math.round(topProduct[1]).toLocaleString()})` : "—"}*\n` +
      `\n──────────────────\n` +
      `*View the full breakdown in Analytics.*`;

    const bridgeUrl = settings.whatsapp_bridge_url || process.env.WHATSAPP_BRIDGE_URL || "http://localhost:3001";
    const res = await fetch(`${bridgeUrl}/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: settings.whatsapp_admin_phone, message }),
      signal: AbortSignal.timeout(10000),
    });
    const result = await res.json().catch(() => ({ ok: false, error: `HTTP ${res.status}` }));

    if (!res.ok || !result.ok) {
      const reason = result.error || `Bridge responded with ${res.status}`;
      console.warn(`[AnalyticsDigest] WA send skipped (org ${orgId}): ${reason}`);
      return { sent: false, skipped: true, reason, range, orderCount, deliveredRevenue };
    }

    return { sent: true, range, orderCount, deliveredRevenue, rtoRate, reorderRate };
  } catch (err: any) {
    const isNetworkError = err.name === "AbortError" || err.message?.includes("fetch failed") || err.message?.includes("ECONNREFUSED");
    if (isNetworkError) {
      console.warn(`[AnalyticsDigest] WA bridge unreachable (org ${orgId}): ${err.message}`);
      return { sent: false, skipped: true, reason: "WA bridge unreachable" };
    }
    return { sent: false, error: err.message };
  }
}

// Vercel Cron invokes scheduled paths with GET.
export const GET = POST;
