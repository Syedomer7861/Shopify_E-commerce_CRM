import { NextResponse } from "next/server";
import { razorpayEnabled } from "@/lib/razorpay";
import { billingSession, publicPlans } from "@/lib/billing-server";

export const dynamic = "force-dynamic";

/** What /billing needs: hold state, the current subscription, plans on offer. */
export async function GET() {
  const s = await billingSession();
  if ("error" in s) return s.error;
  const [{ data: org }, { data: current }, { data: picked }, plans, { data: seats }, { data: payments }] = await Promise.all([
    s.admin.from("organizations").select("name, billing_hold, billing_state").eq("id", s.orgId).single(),
    s.admin.from("org_subscriptions")
      .select("status, billing_cycle, currency, price_minor, trial_ends_at, current_period_end, source, plan_versions(subscription_plans(name))")
      .eq("org_id", s.orgId).neq("status", "cancelled").maybeSingle(),
    s.admin.from("billing_checkouts").select("billing_cycle, plan_versions(subscription_plans(code))")
      .eq("org_id", s.orgId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    razorpayEnabled() ? publicPlans() : Promise.resolve([]),
    s.admin.rpc("org_seat_status", { p_org: s.orgId }),
    // Payment history is for the org admin only.
    s.isAdmin
      ? s.admin.from("platform_payments").select("id, amount_minor, currency, status, paid_at").eq("org_id", s.orgId).order("paid_at", { ascending: false }).limit(12)
      : Promise.resolve({ data: [] as { id: string; amount_minor: number; currency: string; status: string; paid_at: string }[] }),
  ]);
  const pv = (current as { plan_versions?: { subscription_plans?: { name?: string } } } | null)?.plan_versions;
  const pk = (picked as { plan_versions?: { subscription_plans?: { code?: string } } } | null)?.plan_versions;
  return NextResponse.json({
    enabled: razorpayEnabled(),
    isAdmin: s.isAdmin,
    orgName: org?.name ?? "",
    hold: !!org?.billing_hold,
    state: org?.billing_state ?? null,
    current: current ? {
      plan: pv?.subscription_plans?.name ?? "", status: current.status, cycle: current.billing_cycle,
      currency: current.currency, price: Number(current.price_minor), trialEndsAt: current.trial_ends_at,
      periodEnd: current.current_period_end, source: current.source,
    } : null,
    picked: picked ? { code: pk?.subscription_plans?.code ?? null, cycle: picked.billing_cycle } : null,
    plans,
    seats: seats ? { limit: (seats as { limit: number | null }).limit ?? null, used: Number((seats as { used: number }).used) || 0 } : null,
    payments: (payments || []).map((p) => ({ id: p.id, amount: Number(p.amount_minor), currency: p.currency, status: p.status, paidAt: p.paid_at })),
  });
}
