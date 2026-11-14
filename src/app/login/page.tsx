import LoginForm from "./LoginForm";
import { googleAuthEnabled } from "@/lib/auth-providers";
import { razorpayEnabled } from "@/lib/razorpay";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: { error?: string } }) {
  return <LoginForm googleEnabled={await googleAuthEnabled()} signupOpen={razorpayEnabled()} googleError={searchParams.error === "google"} />;
}
