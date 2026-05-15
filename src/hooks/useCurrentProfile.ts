"use client";

import { useEffect, useState, useMemo } from "react";
import { createClient } from "@/lib/supabase";
import type { Profile } from "@/types";
import { DEFAULT_PERMISSIONS } from "@/lib/permissions";

export function useCurrentProfile() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      
      // Check for Demo Mode first
      const isDemo = document.cookie.includes("crm-demo-mode=true");
      if (isDemo) {
        setProfile({
          id: "demo-presenter-id",
          email: "demo@presentation.com",
          name: "Demo Presenter",
          role: "manager",
          is_active: true,
          created_at: new Date().toISOString(),
        } as any);
        setLoading(false);
        return;
      }

      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;

      if (!user) {
        if (active) {
          setProfile(null);
          setLoading(false);
        }
        return;
      }

      const { data } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();

      if (active) {
        setProfile((data || {
          id: user.id,
          email: user.email || "",
          role: "agent",
          permissions: DEFAULT_PERMISSIONS,
          is_active: true,
          created_at: new Date().toISOString(),
        }) as Profile);
        setLoading(false);
      }
    }

    load();
    return () => {
      active = false;
    };
  }, []);

  return { profile, loading };
}
