import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { razorpay, razorpayEnabled } from "@/lib/razorpay";
import { billingSession } from "@/lib/billing-server";
import { unixToIso, verifyCheckoutSignature } from "@/lib/billing";

const Schema = z.object({
  razorpay_payment_id: z.string().min(1).max(100),
  razorpay_subscription_id: z.string().min(1).max(100),
  razorpay_signature: z.string().min(1).max(200),
});

/**
 * Called by the browser right after Checkout succeeds, so access opens at once
 * instead of waiting for the webhook. Trusts nothing from the browser: checks
 * the signature, then asks Razorpay for the subscription's real status.
 */
export async function POST(req: NextRequest) {
  if (!razorpayEnabled()) return NextResponse.json({ error: "Online payments are not open yet." }, { status: 404 });
  const s = await billingSession();
  if ("error" in s) return s.error;
  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payment response" }, { status: 400 });
  const { razorpay_payment_id: paymentId, razorpay_subscription_id: subId, razorpay_signature: sig } = parsed.data;

  if (!verifyCheckoutSignature(paymentId, subId, sig, process.env.RAZORPAY_KEY_SECRET!)) {
    return NextResponse.json({ error: "Payment could not be verified" }, { status: 400 });
  }
  const { data: ck } = await s.admin.from("billing_checkouts").select("org_id").eq("razorpay_subscription_id", subId).maybeSingle();
  if (!ck || ck.org_id !== s.orgId) return NextResponse.json({ error: "Payment could not be verified" }, { status: 400 });

  try {
    const sub = await razorpay<{ status: string; current_start?: number; current_end?: number }>(`/subscriptions/${encodeURIComponent(subId)}`);
    if (!["authenticated", "active"].includes(sub.status)) {
      return NextResponse.json({ ok: false, status: sub.status });
    }
    const { error } = await s.admin.rpc("billing_apply", {
      p_rzp_sub: subId, p_action: "start", p_event_at: null,
      p_period_start: unixToIso(sub.current_start), p_period_end: unixToIso(sub.current_end),
    });
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Billing verify failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Payment received; activation is taking a moment. Refresh shortly." }, { status: 502 });
  }
}
