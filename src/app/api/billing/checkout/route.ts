import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { razorpay, razorpayEnabled } from "@/lib/razorpay";
import { billingSession, ensureRazorpayPlan, publicPlans } from "@/lib/billing-server";
import { totalCount } from "@/lib/billing";
import { rateLimit } from "@/lib/rate-limit";

const Schema = z.object({
  versionId: z.string().uuid(), cycle: z.enum(["monthly", "yearly"]),
  orgName: z.string().trim().min(2).max(120).optional(),
});

/** Org admin starts an auto-debit subscription; the browser then opens Razorpay Checkout with it. */
export async function POST(req: NextRequest) {
  if (!razorpayEnabled()) return NextResponse.json({ error: "Online payments are not open yet." }, { status: 404 });
  const limited = await rateLimit(req, "billing-checkout", 10, 10 * 60_000);
  if (limited) return limited;
  const s = await billingSession();
  if ("error" in s) return s.error;
  if (!s.isAdmin) return NextResponse.json({ error: "Only your organisation's admin can manage billing." }, { status: 403 });

  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Pick a plan and billing cycle." }, { status: 400 });
  const { versionId, cycle } = parsed.data;
  const plan = (await publicPlans()).find((p) => p.versionId === versionId);
  const amount = plan ? (cycle === "monthly" ? plan.monthly : plan.yearly) : 0;
  if (!plan || amount <= 0) return NextResponse.json({ error: "That plan is not available." }, { status: 400 });

  const [{ data: org }, { data: live }, { count: pastSubs }] = await Promise.all([
    s.admin.from("organizations").select("name, billing_hold, billing_state").eq("id", s.orgId).single(),
    s.admin.from("org_subscriptions").select("id").eq("org_id", s.orgId).eq("source", "razorpay").neq("status", "cancelled").maybeSingle(),
    s.admin.from("org_subscriptions").select("id", { count: "exact", head: true }).eq("org_id", s.orgId),
  ]);
  if (live && !org?.billing_hold) {
    return NextResponse.json({ error: "You already have an active subscription. Cancel it before switching plans." }, { status: 409 });
  }

  // A workspace that has never paid (e.g. created by Google sign-up) names itself here.
  let orgName = org?.name ?? "";
  if (parsed.data.orgName && org?.billing_hold && org.billing_state === "pending" && parsed.data.orgName !== orgName) {
    const { error: renameError } = await s.admin.from("organizations").update({ name: parsed.data.orgName }).eq("id", s.orgId);
    if (!renameError) orgName = parsed.data.orgName;
  }

  // One free trial per organisation: none if it ever had a subscription.
  const trialDays = pastSubs ? 0 : plan.trialDays;
  try {
    const planId = await ensureRazorpayPlan(plan, cycle);
    const sub = await razorpay<{ id: string }>("/subscriptions", {
      plan_id: planId,
      total_count: totalCount(cycle),
      customer_notify: 1,
      ...(trialDays > 0 ? { start_at: Math.floor(Date.now() / 1000) + trialDays * 86_400 } : {}),
      notes: { org_id: s.orgId },
    });
    const { error } = await s.admin.from("billing_checkouts").insert({
      org_id: s.orgId, plan_version_id: plan.versionId, billing_cycle: cycle, trial_days: trialDays, razorpay_subscription_id: sub.id,
    });
    if (error) throw new Error(error.message);
    return NextResponse.json({
      keyId: process.env.RAZORPAY_KEY_ID, subscriptionId: sub.id, orgName, email: s.user.email ?? "",
      planName: plan.name, trialDays,
    });
  } catch (err) {
    console.error("Billing checkout failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Could not start the payment. Please try again." }, { status: 502 });
  }
}
