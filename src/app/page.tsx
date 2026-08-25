"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useCurrentProfile } from "@/hooks/useCurrentProfile";
import { Loader2 } from "lucide-react";

export default function Home() {
  const { profile, loading } = useCurrentProfile();
  const router = useRouter();

  useEffect(() => {
    if (!loading) {
      if (profile) {
        if (profile.role === "manager") {
          router.replace("/manager");
        } else if (profile.role === "admin") {
          router.replace("/my-hub");
        } else if (profile.role === "hr") {
          router.replace("/hr");
        } else {
          router.replace("/dashboard");
        }
      } else {
        router.replace("/login");
      }
    }
  }, [profile, loading, router]);

  return (
    <div className="flex h-screen items-center justify-center bg-[#f7f4ed]">
       <Loader2 className="w-8 h-8 animate-spin text-[#1c1c1c]" />
    </div>
  );
}
