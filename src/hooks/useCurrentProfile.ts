"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { createClient } from "@/lib/supabase";
import type { Profile } from "@/types";
import { DEFAULT_PERMISSIONS } from "@/lib/permissions";
import { isDemoMode } from "@/lib/demo";

export function useCurrentProfile() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = useMemo(() => createClient(), []);
  // onAuthStateChange fires on every silent token refresh (and again with
  // INITIAL_SESSION right after subscribing), each time re-querying the
  // profile row and building a brand-new object. Every page that depends on
  // `profile` by reference (e.g. Tasks' data-fetch effect) was tearing down
  // and re-running on each of those - closing whatever modal was open -
  // even though the actual profile data hadn't changed. Only publish a new
  // reference when the content actually differs.
  const lastSerialized = useRef<string | null>(null);
  const publishProfile = (next: Profile | null) => {
    const serialized = JSON.stringify(next);
    if (serialized === lastSerialized.current) return;
    lastSerialized.current = serialized;
    setProfile(next);
  };

  useEffect(() => {
    let active = true;

    async function load(sessionUser?: { id: string; email?: string | null } | null) {
      setLoading(true);

      // Check for Demo Mode first
      const isDemo = isDemoMode();
      if (isDemo) {
        publishProfile({
          id: "demo-presenter-id",
          email: "demo@presentation.com",
          name: "Demo Presenter",
          role: "admin",
          is_active: true,
          created_at: new Date().toISOString(),
        } as any);
        setLoading(false);
        return;
      }

      // supabase.auth.getSession() reads the session from local storage
      // without waiting for it to hydrate, so on a fresh page load it can
      // race and return null even though the user genuinely has a valid
      // session - middleware already verified that server-side with
      // getUser() before this page was allowed to render. Losing that race
      // used to set profile to null permanently: every `!isAdmin(profile)`
      // or `profile?.role !== X` gate across the app treats a null profile
      // as "deny", so a genuinely logged-in user could hit Access Denied on
      // a page they have every right to see, with no error and no retry.
      // The onAuthStateChange subscription below re-runs this once the
      // session actually resolves, so a lost race gets a second chance.
      const user = sessionUser ?? (await supabase.auth.getSession()).data.session?.user;

      if (!user) {
        if (active) {
          lastSerialized.current = null;
          setProfile(null);
          setLoading(false);
        }
        return;
      }

      const { data } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();

      if (active) {
        const finalProfile = (data || {
          id: user.id,
          email: user.email || "",
          role: "agent",
          permissions: DEFAULT_PERMISSIONS,
          is_active: true,
          created_at: new Date().toISOString(),
        }) as Profile;

        // Auto-enable demo mode if the profile is marked as demo in DB or has 'demo' in email
        const isDemoEmail = finalProfile.email?.toLowerCase().includes("demo");
        if ((finalProfile.is_demo || isDemoEmail) && !isDemo) {
          document.cookie = "crm-demo-mode=true; path=/; max-age=86400; samesite=lax";
          // We might want to reload here to ensure all components pick up the demo mode
          window.location.reload();
          return;
        }

        publishProfile(finalProfile);
        setLoading(false);
      }
    }

    load();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active && session?.user) load(session.user);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  return { profile, loading };
}
