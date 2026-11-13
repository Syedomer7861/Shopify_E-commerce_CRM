import "server-only";
import { NextResponse } from "next/server";
import { createAdminClient, createServerClient } from "@/lib/supabase";
import { razorpay } from "@/lib/razorpay";

export type Cycle = "monthly" | "yearly";

export type PublicPlan = {
  versionId: string;
  code: string;
  name: string;
  description: string;
  currency: string;
  monthly: number; // minor units; 0 = cycle not offered
  yearly: number;
  trialDays: number;
};

type PlanRow = {
  code: string; name: string; description: string; sort_order: number;
  plan_versions: { id: string; version: number; currency: string; price_monthly_minor: number; price_yearly_minor: number; trial_days: number }[];
};

/** Public, active plans at their latest published version, with at least one paid cycle. */
export async function publicPlans(): Promise<PublicPlan[]> {
  const { data, error } = await createAdminClient()
    .from("subscription_plans")
    .select("code, name, description, sort_order, plan_versions(id, version, currency, price_monthly_minor, price_yearly_minor, trial_days)")
    .eq("is_public", true).eq("is_active", true).order("sort_order");
  if (error) throw new Error(error.message);
  return ((data || []) as PlanRow[]).flatMap((p) => {
    const v = [...p.plan_versions].sort((a, b) => b.version - a.version)[0];
    if (!v || (v.price_monthly_minor <= 0 && v.price_yearly_minor <= 0)) return [];
    return [{ versionId: v.id, code: p.code, name: p.name, description: p.description, currency: v.currency,
      monthly: Number(v.price_monthly_minor), yearly: Number(v.price_yearly_minor), trialDays: v.trial_days }];
  });
}

/**
 * Signed-in caller with their org and role, read with the service role:
 * a held org's members cannot read their own org through RLS.
 */
export async function billingSession() {
  const { data: { user } } = await createServerClient().auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Please sign in" }, { status: 401 }) } as const;
  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("org_id, role").eq("id", user.id).single();
  if (!profile?.org_id) return { error: NextResponse.json({ error: "No organisation" }, { status: 403 }) } as const;
  return { user, admin, orgId: profile.org_id as string, isAdmin: profile.role === "admin" } as const;
}

/** Razorpay plan for a plan version and cycle, created on first use. */
export async function ensureRazorpayPlan(plan: PublicPlan, cycle: Cycle): Promise<string> {
  const admin = createAdminClient();
  const find = () => admin.from("platform_razorpay_plans").select("razorpay_plan_id")
    .eq("plan_version_id", plan.versionId).eq("billing_cycle", cycle).maybeSingle();
  const { data: existing } = await find();
  if (existing) return existing.razorpay_plan_id;
  const created = await razorpay<{ id: string }>("/plans", {
    period: cycle, interval: 1,
    item: { name: `${plan.name} (${cycle})`, amount: cycle === "monthly" ? plan.monthly : plan.yearly, currency: plan.currency },
    notes: { plan_version_id: plan.versionId },
  });
  const { error } = await admin.from("platform_razorpay_plans")
    .insert({ plan_version_id: plan.versionId, billing_cycle: cycle, razorpay_plan_id: created.id });
  if (error) {
    // Lost a race with a parallel checkout: use the plan that won.
    const { data: winner } = await find();
    if (winner) return winner.razorpay_plan_id;
    throw new Error(error.message);
  }
  return created.id;
}
