import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requirePlatformOwner } from "@/lib/auth-utils";
import { createAdminClient } from "@/lib/supabase";
import { razorpay, razorpayEnabled } from "@/lib/razorpay";

const Schema = z.object({ subscriptionId: z.string().uuid() });

/**
 * Owner cancels or replaces a self-serve subscription: stop the Razorpay
 * auto-debit first, so the customer is never charged for a plan the owner
 * ended. Manual subscriptions need nothing here ({ stopped: false }).
 */
export async function POST(req: NextRequest) {
  const { errorResponse, user } = await requirePlatformOwner();
  if (errorResponse) return errorResponse;
  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const admin = createAdminClient();
  const { data: sub } = await admin.from("org_subscriptions").select("org_id, source, razorpay_subscription_id")
    .eq("id", parsed.data.subscriptionId).maybeSingle();
  if (!sub) return NextResponse.json({ error: "Subscription not found" }, { status: 404 });
  if (sub.source !== "razorpay" || !sub.razorpay_subscription_id) return NextResponse.json({ stopped: false });
  if (!razorpayEnabled()) {
    return NextResponse.json({ error: "Razorpay keys are missing, so auto-debit cannot be stopped from here. Cancel it in the Razorpay dashboard first." }, { status: 409 });
  }
  try {
    await razorpay(`/subscriptions/${encodeURIComponent(sub.razorpay_subscription_id)}/cancel`, { cancel_at_cycle_end: 0 });
  } catch {
    return NextResponse.json({ error: "Razorpay did not confirm the cancellation. Nothing was changed; try again." }, { status: 502 });
  }
  await admin.from("platform_audit_logs").insert({
    actor_id: user?.id, action: "subscriptions.stop_autodebit", target_type: "organizations", target_id: sub.org_id,
    details: { razorpay_subscription_id: sub.razorpay_subscription_id },
  });
  return NextResponse.json({ stopped: true });
}
