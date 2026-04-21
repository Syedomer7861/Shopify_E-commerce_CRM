"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";
import type { Profile } from "@/types";
import { DEFAULT_PERMISSIONS } from "@/lib/permissions";

export function useCurrentProfile() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      const { data: auth } = await supabase.auth.getUser();
      const user = auth.user;

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
