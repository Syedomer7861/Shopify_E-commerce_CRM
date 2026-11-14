import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { getSystemSettings, getShopifyAccessToken } from "@/lib/server-settings";
import { requireOwnerOrInternal } from "@/lib/auth-utils";
import { makeDeadline } from "@/lib/sync-logic";
import { mapShiprocketStatus } from "@/lib/shiprocket-status";

// Vercel Hobby caps functions at 60s; a higher value fails the deploy.
export const maxDuration = 60;

const SHIPROCKET_BASE_URL = "https://apiv2.shiprocket.in/v1/external";

// Shopify's own carrier-synced shipment_status, used only as a fallback
// when an order's tracking_number isn't a Shiprocket AWB (shipped via a
// different courier/app) so Shiprocket has nothing to say about it.
function mapShopifyShipmentStatus(status: string | null | undefined) {
  if (!status) return null;
  const s = status.toLowerCase();
  if (s === "delivered") return "delivered";
  if (s === "failure") return "failed";
  if (s === "out_for_delivery") return "out_for_delivery";
  if (["confirmed", "in_transit", "label_printed", "label_purchased", "ready_for_pickup", "attempted_delivery"].includes(s)) return "in_transit";
  return null;
}

/**
 * One-time reconciliation for the ghost-in_transit bug fixed in
 * webhooks/shopify/route.ts (commit 7bc4bff): 12,876 orders were stamped
 * in_transit off Shopify's "fulfilled" webhook alone, with no
 * tracking_number ever written - permanently invisible to the AWB-based
 * cron/shiprocket-sync fix, which can only check orders that HAVE an AWB.
 *
 * Also covers "pending" orders with no tracking_number, not just
 * "in_transit" - sampling those against real Shopify data found 41% were
 * actually cancelled in Shopify and never got flipped to "failed" here.
 *
 * Recovers the real tracking_number from Shopify's own fulfillment
 * records (which the original webhook never bothered to save), then
 * checks Shiprocket for the real current status using that AWB - the
 * same lookup already proven correct in cron/shiprocket-sync. Orders with
 * genuinely no fulfillment in Shopify stay/get set to "pending" (honest:
 * no evidence they ever shipped). Cancelled orders get "failed".
 */
export async function POST(req: NextRequest) {
  const unauthorized = await requireOwnerOrInternal(req);
  if (unauthorized) return unauthorized;

  const supabase = createAdminClient();

  const { data: orgs } = await supabase.from("organizations").select("id").eq("is_active", true);
  const reports: any[] = [];
  for (const org of orgs ?? []) {
    reports.push({ orgId: org.id, ...(await reconcileOrg(supabase, org.id)) });
  }
  return NextResponse.json({ orgs: reports });
}

async function reconcileOrg(supabase: ReturnType<typeof createAdminClient>, orgId: string) {
  // cron-job.org's free tier hard-caps its own wait at 30s (confirmed live
  // on shiprocket-sync - no way to raise it), well under Vercel's 60s
  // ceiling this was originally sized for. 20s leaves real margin for
  // Shopify/Shiprocket auth + Vercel cold start overhead so the route
  // always replies before the caller gives up.
  const deadline = makeDeadline({ budgetMs: 20_000 });

  const report = {
    checked: 0,
    recovered_and_resolved: 0, // got tracking_number + a real Shiprocket status
    recovered_tracking_only: 0, // got tracking_number, Shiprocket had no record (different courier) - next AWB sync pass will keep trying
    resolved_via_shopify_status: 0, // no Shiprocket match, used Shopify's own shipment_status
    reset_to_pending: 0, // Shopify has no fulfillment at all - genuinely never shipped
    cancelled: 0,
    errors: 0,
    truncated: false,
  };

  try {
    const settings = await getSystemSettings(supabase, orgId);
    if (!settings?.shopify_store_domain) {
      return { error: "Shopify not configured" };
    }
    const domain = String(settings.shopify_store_domain).replace(/^https?:\/\//, "").replace(/\/$/, "");
    const shopifyToken = await getShopifyAccessToken(supabase, orgId);

    // Shiprocket auth is only needed if we actually recover a tracking
    // number, so it's done lazily on first use rather than up front.
    let shiprocketToken: string | null = null;
    async function getShiprocketToken(): Promise<string | null> {
      if (shiprocketToken) return shiprocketToken;
      if (!settings?.shiprocket_email || !settings?.shiprocket_password) return null;
      const authRes = await fetch(`${SHIPROCKET_BASE_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: settings.shiprocket_email.trim(), password: settings.shiprocket_password.trim() }),
      });
      if (!authRes.ok) return null;
      const data = await authRes.json();
      shiprocketToken = data.token || null;
      return shiprocketToken;
    }

    const BATCH_SIZE = 100;
    const { data: ghostOrders, error: fetchErr } = await supabase
      .from("orders")
      .select("id, shopify_order_id, order_number")
      // "pending" is in scope too, not just "in_transit": sampling old
      // pending orders against real Shopify data found 41% were actually
      // cancelled in Shopify (cancelled_at set) but never got flipped to
      // "failed" here - same reconciliation logic below already handles
      // that correctly, it just never used to look at this status.
      .in("delivery_status", ["in_transit", "pending"])
      .is("tracking_number", null)
      .eq("source", "shopify")
      .eq("org_id", orgId)
      .order("ordered_at", { ascending: true })
      .limit(BATCH_SIZE);

    if (fetchErr) throw fetchErr;
    if (!ghostOrders || ghostOrders.length === 0) {
      return { processed: 0, message: "No ghost transit or mislabeled pending orders left", report };
    }

    // Shopify supports a comma-separated ids filter, up to 250 at a time -
    // one call recovers fulfillment data for the whole batch instead of
    // one request per order.
    const ids = ghostOrders.map(o => o.shopify_order_id).join(",");
    // Shopify's list endpoint defaults to limit=50 even when more ids are
    // requested - without this the batch silently loses the back half.
    const shopifyRes = await fetch(
      `https://${domain}/admin/api/2024-04/orders.json?ids=${ids}&status=any&limit=${ghostOrders.length}&fields=id,fulfillments,fulfillment_status,cancelled_at`,
      { headers: { "X-Shopify-Access-Token": shopifyToken, "Content-Type": "application/json" } }
    );
    if (!shopifyRes.ok) throw new Error(`Shopify API error: ${shopifyRes.status}`);
    const shopifyData = await shopifyRes.json();
    const byId = new Map<string, any>((shopifyData.orders || []).map((o: any) => [String(o.id), o]));

    for (const order of ghostOrders) {
      if (deadline.expired()) { report.truncated = true; break; }
      report.checked++;
      try {
        const srOrder = byId.get(String(order.shopify_order_id));
        if (!srOrder) { report.errors++; continue; }

        if (srOrder.cancelled_at) {
          await supabase.from("orders").update({ delivery_status: "failed", updated_at: new Date().toISOString() }).eq("id", order.id);
          report.cancelled++;
          continue;
        }

        const fulfillment = (srOrder.fulfillments || [])[0];
        const trackingNumber = fulfillment?.tracking_number ? String(fulfillment.tracking_number).trim() : null;

        if (!trackingNumber) {
          // Shopify itself has no fulfillment record - never actually shipped.
          await supabase.from("orders").update({ delivery_status: "pending", updated_at: new Date().toISOString() }).eq("id", order.id);
          report.reset_to_pending++;
          continue;
        }

        const updateData: any = {
          tracking_number: trackingNumber,
          courier_name: fulfillment.tracking_company || null,
          updated_at: new Date().toISOString(),
        };

        // Now that we have a real AWB, ask Shiprocket what's actually
        // happening with it - the same lookup already proven correct.
        const srToken = await getShiprocketToken();
        let resolved = false;
        if (srToken) {
          const trackRes = await fetch(`${SHIPROCKET_BASE_URL}/courier/track/awb/${trackingNumber}`, {
            headers: { Authorization: `Bearer ${srToken}` },
          });
          if (trackRes.ok) {
            const trackData = await trackRes.json();
            const shipment = trackData?.tracking_data?.shipment_track?.[0];
            if (shipment?.current_status) {
              updateData.delivery_status = mapShiprocketStatus(shipment.current_status);
              if (updateData.delivery_status === "delivered") {
                updateData.delivered_at = shipment.delivered_date || new Date().toISOString();
              }
              resolved = true;
              report.recovered_and_resolved++;
            }
          }
        }

        if (!resolved) {
          // Not a Shiprocket AWB (different courier) or Shiprocket had no
          // record - fall back to Shopify's own carrier-synced status if
          // it has one; otherwise leave it in_transit (now correctly
          // holding a real tracking_number so it's no longer a ghost, and
          // future syncs can keep refining it).
          const shopifyStatus = mapShopifyShipmentStatus(fulfillment.shipment_status);
          if (shopifyStatus) {
            updateData.delivery_status = shopifyStatus;
            report.resolved_via_shopify_status++;
          } else {
            report.recovered_tracking_only++;
          }
        }

        await supabase.from("orders").update(updateData).eq("id", order.id);
      } catch (err) {
        console.error(`Reconcile failed for order ${order.order_number}:`, err);
        report.errors++;
      }
    }

    return { processed: report.checked, report };
  } catch (err: any) {
    console.error(`Reconcile ghost transit error (org ${orgId}):`, err.message);
    return { error: err.message, report };
  }
}

export const GET = POST;
