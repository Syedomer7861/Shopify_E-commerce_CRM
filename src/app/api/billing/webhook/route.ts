import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { razorpayEnabled } from "@/lib/razorpay";
import { eventAction, unixToIso, verifyWebhookSignature } from "@/lib/billing";

type Entity = Record<string, unknown>;

/**
 * Razorpay subscription webhook. Signed with RAZORPAY_WEBHOOK_SECRET.
 * billing_apply is idempotent and ignores out-of-order events, so Razorpay's
 * retries are safe. Returns 500 on our own failures so Razorpay retries.
 */
export async function POST(req: NextRequest) {
  if (!razorpayEnabled()) return NextResponse.json({ error: "Not configured" }, { status: 404 });
  const raw = await req.text();
  if (!verifyWebhookSignature(raw, req.headers.get("x-razorpay-signature") || "", process.env.RAZORPAY_WEBHOOK_SECRET!)) {
    return NextResponse.json({ error: "Bad signature" }, { status: 401 });
  }

  let body: { event?: string; created_at?: number; payload?: { subscription?: { entity?: Entity }; payment?: { entity?: Entity } } };
  try { body = JSON.parse(raw); } catch { return NextResponse.json({ error: "Bad JSON" }, { status: 400 }); }

  const action = eventAction(body.event || "");
  const sub = body.payload?.subscription?.entity;
  if (!action || typeof sub?.id !== "string") return NextResponse.json({ ok: true, ignored: true });

  const admin = createAdminClient();
  const { data: orgId, error } = await admin.rpc("billing_apply", {
    p_rzp_sub: sub.id, p_action: action, p_event_at: unixToIso(body.created_at),
    p_period_start: unixToIso(sub.current_start), p_period_end: unixToIso(sub.current_end),
  });
  if (error) {
    console.error("Billing webhook apply failed:", body.event, error.message);
    return NextResponse.json({ error: "Apply failed" }, { status: 500 });
  }

  const pay = body.payload?.payment?.entity;
  if (action === "charged" && orgId && typeof pay?.id === "string") {
    const { error: payError } = await admin.from("platform_payments").upsert({
      razorpay_payment_id: pay.id, razorpay_subscription_id: sub.id, org_id: orgId,
      amount_minor: Number(pay.amount) || 0, currency: String(pay.currency || "INR"), status: String(pay.status || "captured"),
      paid_at: unixToIso(pay.created_at) ?? new Date().toISOString(),
    }, { onConflict: "razorpay_payment_id", ignoreDuplicates: true });
    if (payError) {
      console.error("Billing webhook payment record failed:", payError.message);
      return NextResponse.json({ error: "Record failed" }, { status: 500 });
    }
  }
  return NextResponse.json({ ok: true });
}
