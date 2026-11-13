import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { razorpayEnabled } from "@/lib/razorpay";
import { publicPlans } from "@/lib/billing-server";
import SignupForm from "./SignupForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Start your workspace | CodeCrest" };

// Self-serve signup opens only when Razorpay is configured and at least one
// public paid plan exists; until then this keeps sending people to /contact.
export default async function SignupPage() {
  if (!razorpayEnabled()) redirect("/contact");
  const plans = await publicPlans().catch(() => []);
  if (plans.length === 0) redirect("/contact");
  return <SignupForm plans={plans} />;
}
