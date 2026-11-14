import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { razorpayEnabled } from "@/lib/razorpay";
import { publicPlans, type Cycle } from "@/lib/billing-server";
import { googleAuthEnabled } from "@/lib/auth-providers";
import SignupForm from "./SignupForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Start your workspace | CodeCrest" };

// Self-serve signup opens only when Razorpay is configured and at least one
// public paid plan exists; until then this keeps sending people to /contact.
// People choose a plan on /pricing first; arriving without one goes there.
export default async function SignupPage({ searchParams }: { searchParams: { plan?: string; cycle?: string } }) {
  if (!razorpayEnabled()) redirect("/contact");
  const plans = await publicPlans().catch(() => []);
  if (plans.length === 0) redirect("/contact");
  const cycle: Cycle = searchParams.cycle === "yearly" ? "yearly" : "monthly";
  const plan = plans.find((p) => p.code === searchParams.plan && (cycle === "monthly" ? p.monthly : p.yearly) > 0);
  if (!plan) redirect("/pricing");
  return <SignupForm plans={plans} initialVersionId={plan.versionId} initialCycle={cycle} googleEnabled={await googleAuthEnabled()} />;
}
