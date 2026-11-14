import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createAdminClient } from "@/lib/supabase";
import { getSystemSettings } from "@/lib/server-settings";
import { isSecretConfigured, privilegedScope, safeEqual } from "@/lib/auth-utils";

/**
 * Replays Shopify webhooks the main route held while no webhook secret was
 * set (topic "held:<topic>", status "skipped"). Each one is checked against
 * the secret configured NOW; only a valid signature is re-posted, untouched,
 * to /api/webhooks/shopify, which verifies it again and processes it.
 * Bad signatures are marked rejected and never processed.
 *
 * POST, admin of the workspace (own rows) or internal secret (all rows).
 * Handles BATCH rows per call, oldest first; call again while remaining > 0.
 * ponytail: relies on the order handler's own dedupe for a webhook Shopify
 * retried before it was held; add a webhook_id check if duplicates show up.
 */
const HELD = "held:";
const BATCH = 40;

export async function POST(req: NextRequest) {
  const scope = await privilegedScope(req);
  if (scope.error) return scope.error;

  const supabase = createAdminClient();
  let query = supabase
    .from("webhook_logs")
    .select("id, org_id, topic, payload")
    .eq("source", "shopify")
    .eq("status", "skipped")
    .like("topic", `${HELD}%`)
    .order("created_at", { ascending: true })
    .limit(BATCH);
  if (scope.orgId) query = query.eq("org_id", scope.orgId);
  const { data: rows, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const secrets = new Map<string, string | undefined>();
  const counts = { replayed: 0, rejected: 0, failed: 0 };

  for (const row of rows ?? []) {
    if (!secrets.has(row.org_id)) {
      const settings = await getSystemSettings(supabase, row.org_id);
      secrets.set(row.org_id, settings?.shopify_webhook_secret || process.env.SHOPIFY_WEBHOOK_SECRET);
    }
    const secret = secrets.get(row.org_id);
    if (!isSecretConfigured(secret)) {
      return NextResponse.json(
        { error: "Set the Shopify webhook secret first (Settings > Shopify API, or SHOPIFY_WEBHOOK_SECRET).", ...counts },
        { status: 409 }
      );
    }

    const topic = String(row.topic).slice(HELD.length);
    const { raw, hmac, shop, webhook_id } = (row.payload ?? {}) as Record<string, string | null>;
    const expected = crypto.createHmac("sha256", secret).update(String(raw ?? ""), "utf8").digest("base64");

    if (!raw || !safeEqual(expected, hmac)) {
      counts.rejected++;
      await supabase.from("webhook_logs").update({ status: "failed", topic: `rejected:${topic}` }).eq("id", row.id);
      continue;
    }

    const headers: Record<string, string> = {
      "content-type": "application/json",
      "x-shopify-topic": topic,
      "x-shopify-hmac-sha256": String(hmac),
    };
    if (shop) headers["x-shopify-shop-domain"] = shop;
    if (webhook_id) headers["x-shopify-webhook-id"] = webhook_id;

    const res = await fetch(`${req.nextUrl.origin}/api/webhooks/shopify`, { method: "POST", headers, body: raw }).catch(() => null);
    const ok = !!res?.ok;
    counts[ok ? "replayed" : "failed"]++;
    await supabase
      .from("webhook_logs")
      .update({ status: ok ? "processed" : "failed", topic: `${ok ? "replayed" : "replay_failed"}:${topic}` })
      .eq("id", row.id);
  }

  let remainingQuery = supabase
    .from("webhook_logs")
    .select("id", { count: "exact", head: true })
    .eq("source", "shopify")
    .eq("status", "skipped")
    .like("topic", `${HELD}%`);
  if (scope.orgId) remainingQuery = remainingQuery.eq("org_id", scope.orgId);
  const { count } = await remainingQuery;

  return NextResponse.json({ ...counts, remaining: count ?? 0 });
}
