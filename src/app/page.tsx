"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useCurrentProfile } from "@/hooks/useCurrentProfile";
import { Loader2 } from "lucide-react";
import LandingPage from "@/components/marketing/LandingPage";

export default function Home() {
  const { profile, loading } = useCurrentProfile();
  const router = useRouter();

  useEffect(() => {
    if (!loading && profile) {
      if (profile.role === "manager") {
        router.replace("/manager");
      } else if (profile.role === "hr") {
        router.replace("/hr");
      } else {
        router.replace("/dashboard");
      }
    }
  }, [profile, loading, router]);

  // Still resolving the session, or a logged-in user mid-redirect to their
  // dashboard - show a blank loading state either way rather than flashing
  // the marketing page at someone who's about to leave it immediately.
  if (loading || profile) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#f7f4ed]">
        <Loader2 className="w-8 h-8 animate-spin text-[#1c1c1c]" />
      </div>
    );
  }

  // No session - this is the public marketing page, not a redirect target.
  return <LandingPage />;
}
