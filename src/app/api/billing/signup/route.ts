import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase";
import { rateLimit } from "@/lib/rate-limit";
import { razorpayEnabled } from "@/lib/razorpay";
import { publicPlans } from "@/lib/billing-server";

// Public self-serve signup. Creates the organisation ON HOLD (locked out by
// current_org_id) plus its first admin; access opens only once the Razorpay
// mandate is authorised (billing_apply). Off unless Razorpay is configured.

const Schema = z.object({
  orgName: z.string().trim().min(2).max(120),
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(8).max(72),
  versionId: z.string().uuid(),
  cycle: z.enum(["monthly", "yearly"]),
  website: z.string().max(0).optional(), // honeypot: real people leave it empty
});

const slugify = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "org";

export async function POST(req: NextRequest) {
  if (!razorpayEnabled()) return NextResponse.json({ error: "Online signup is not open yet." }, { status: 404 });
  const limited = await rateLimit(req, "billing-signup", 5, 60 * 60_000);
  if (limited) return limited;

  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Please check the form and try again." }, { status: 400 });
  const { orgName, name, email, password, versionId, cycle } = parsed.data;

  const plan = (await publicPlans()).find((p) => p.versionId === versionId);
  if (!plan || (cycle === "monthly" ? plan.monthly : plan.yearly) <= 0) {
    return NextResponse.json({ error: "That plan is no longer available. Please pick another." }, { status: 400 });
  }

  const admin = createAdminClient();
  const base = slugify(orgName);
  let slug = base;
  for (let i = 2; i <= 50; i++) {
    const { data: taken } = await admin.from("organizations").select("id").eq("slug", slug).maybeSingle();
    if (!taken) break;
    slug = `${base}-${i}`;
  }

  const { data: org, error: orgError } = await admin.from("organizations")
    .insert({ name: orgName, slug, billing_hold: true, billing_state: "pending" }).select("id").single();
  if (orgError || !org) {
    console.error("Self-serve signup: org insert failed:", orgError?.message);
    return NextResponse.json({ error: "Could not create your workspace. Please try again." }, { status: 500 });
  }

  const { data: created, error: userError } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, // app_metadata is what the profile trigger trusts; user_metadata keeps the
    // previous trigger working until migration 20261114b is applied.
    user_metadata: { name, role: "admin", org_id: org.id }, app_metadata: { role: "admin", org_id: org.id },
  });
  if (userError || !created.user) {
    await admin.from("organizations").delete().eq("id", org.id);
    const exists = /already|registered|exists/i.test(userError?.message || "");
    return NextResponse.json(
      { error: exists ? "An account with this email already exists. Please sign in instead." : "Could not create your account. Please try again." },
      { status: exists ? 409 : 500 },
    );
  }

  // Remembers the chosen plan; /billing turns it into a Razorpay subscription.
  const { error: ckError } = await admin.from("billing_checkouts")
    .insert({ org_id: org.id, plan_version_id: versionId, billing_cycle: cycle, trial_days: plan.trialDays });
  if (ckError) console.error("Self-serve signup: checkout record failed:", ckError.message);

  const { error: auditError } = await admin.from("platform_audit_logs").insert({
    actor_id: created.user.id, action: "organizations.self_signup", target_type: "organizations", target_id: org.id,
    details: { name: orgName, slug, plan: plan.code, cycle },
  });
  if (auditError) console.error("Platform audit write failed:", auditError.message);

  return NextResponse.json({ success: true }, { status: 201 });
}
