"use client";
import { useEffect } from "react";
import { createClient } from "@/lib/supabase";
import { useCurrentProfile } from "@/hooks/useCurrentProfile";
import toast from "react-hot-toast";

export function AdminNotifier() {
  const { profile, loading } = useCurrentProfile();
  const supabase = createClient();

  useEffect(() => {
    if (loading || !profile) return;
    if (profile.role !== "admin") return;

    let lastToastTime = 0;

    

    return () => {
      
    };
  }, [profile, loading]);

  return null;
}
