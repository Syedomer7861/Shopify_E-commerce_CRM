import { createHmac, timingSafeEqual } from "crypto";

// Pure Razorpay billing rules, kept free of fetch/Supabase so
// scripts/check-billing.mjs can run them in plain Node.

export type BillingAction = "start" | "charged" | "past_due" | "halt" | "cancel";

/** Razorpay subscription webhook event to the access change it causes (see billing_apply in SQL). */
export function eventAction(event: string): BillingAction | null {
  switch (event) {
    case "subscription.authenticated":
    case "subscription.activated":
    case "subscription.resumed":
      return "start";
    case "subscription.charged":
      return "charged";
    case "subscription.pending":
      return "past_due";
    case "subscription.halted":
      return "halt";
    case "subscription.cancelled":
    case "subscription.completed":
      return "cancel";
    default:
      return null;
  }
}

function sameHex(a: string, b: string) {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Checkout handler signature: HMAC-SHA256 of "payment_id|subscription_id" with the key secret. */
export function verifyCheckoutSignature(paymentId: string, subscriptionId: string, signature: string, keySecret: string) {
  if (!paymentId || !subscriptionId || !signature || !keySecret) return false;
  const expected = createHmac("sha256", keySecret).update(`${paymentId}|${subscriptionId}`).digest("hex");
  return sameHex(expected, signature);
}

/** Webhook signature: HMAC-SHA256 of the raw body with the webhook secret. */
export function verifyWebhookSignature(rawBody: string, signature: string, webhookSecret: string) {
  if (!signature || !webhookSecret) return false;
  const expected = createHmac("sha256", webhookSecret).update(rawBody).digest("hex");
  return sameHex(expected, signature);
}

/** Billing cycles Razorpay will charge before the subscription completes: 10 years either way. */
export const totalCount = (cycle: "monthly" | "yearly") => (cycle === "monthly" ? 120 : 10);

/** Unix seconds (Razorpay) to ISO, or null. */
export const unixToIso = (s: unknown) => (typeof s === "number" && s > 0 ? new Date(s * 1000).toISOString() : null);
