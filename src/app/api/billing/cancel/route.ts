import { NextResponse } from "next/server";
import { razorpay, razorpayEnabled } from "@/lib/razorpay";
import { billingSession } from "@/lib/billing-server";

/**
 * Org admin stops auto-debit. A paid period runs to its end; a trial ends now.
 * Access changes when Razorpay sends subscription.cancelled (webhook).
 */
export async function POST() {
  if (!razorpayEnabled()) return NextResponse.json({ error: "Online payments are not open yet." }, { status: 404 });
  const s = await billingSession();
  if ("error" in s) return s.error;
  if (!s.isAdmin) return NextResponse.json({ error: "Only your organisation's admin can manage billing." }, { status: 403 });

  const { data: sub } = await s.admin.from("org_subscriptions").select("razorpay_subscription_id, status, current_period_end")
    .eq("org_id", s.orgId).eq("source", "razorpay").neq("status", "cancelled").maybeSingle();
  if (!sub?.razorpay_subscription_id) return NextResponse.json({ error: "No auto-debit subscription to cancel." }, { status: 404 });

  const atCycleEnd = sub.status === "active";
  try {
    await razorpay(`/subscriptions/${encodeURIComponent(sub.razorpay_subscription_id)}/cancel`, { cancel_at_cycle_end: atCycleEnd ? 1 : 0 });
  } catch {
    return NextResponse.json({ error: "Could not cancel right now. Please try again." }, { status: 502 });
  }
  await s.admin.from("platform_audit_logs").insert({
    actor_id: s.user.id, action: "subscriptions.self_cancel", target_type: "organizations", target_id: s.orgId,
    details: { razorpay_subscription_id: sub.razorpay_subscription_id, at_cycle_end: atCycleEnd },
  });
  return NextResponse.json({ ok: true, endsAt: atCycleEnd ? sub.current_period_end : null });
}
