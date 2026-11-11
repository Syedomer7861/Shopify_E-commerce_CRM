"use client";

import { createContext, createElement, useContext, useEffect, useState, useMemo, useRef, type ReactNode } from "react";
import { createClient } from "@/lib/supabase";
import type { Profile } from "@/types";
import { DEFAULT_PERMISSIONS } from "@/lib/permissions";
import { loadProfile } from "@/lib/profile-loader";
import { isDemoMode } from "@/lib/demo";

type ProfileState = { profile: Profile | null; loading: boolean };

const ProfileContext = createContext<ProfileState | null>(null);

function useProfileLoader(enabled: boolean): ProfileState {
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

  useEffect(() => {
    if (!enabled) return;
    let active = true;

    const publishProfile = (next: Profile | null) => {
      const serialized = JSON.stringify(next);
      if (serialized === lastSerialized.current) return;
      lastSerialized.current = serialized;
      setProfile(next);
    };

    async function load(sessionUser?: { id: string; email?: string | null } | null) {
      // Only the first load shows a loading state. Later runs (token refresh,
      // tab focus) refresh quietly - flipping `loading` back on made every
      // page that gates on it unmount its content and refetch its data.
      if (lastSerialized.current === null) setLoading(true);

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

      const loaded = await loadProfile(supabase, user.id);
      if (!active) return;

      const finalProfile = (loaded || {
        id: user.id,
        email: user.email || "",
        role: "agent",
        permissions: DEFAULT_PERMISSIONS,
        is_active: true,
        created_at: new Date().toISOString(),
      }) as Profile;

      // Demo mode follows the is_demo flag only. This used to also fire for
      // any email containing "demo", which silently swapped a real
      // account's data for mock numbers.
      if (finalProfile.is_demo) {
        document.cookie = "crm-demo-mode=true; path=/; max-age=86400; samesite=lax";
        window.location.reload();
        return;
      }

      publishProfile(finalProfile);
      setLoading(false);
    }

    load();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active && session?.user) load(session.user);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [supabase, enabled]);

  return { profile, loading };
}

/**
 * Loads the signed-in profile once for everything under it. Without this,
 * each of the ~40 components calling useCurrentProfile() ran its own
 * profile + role queries and its own auth subscription on every page.
 */
export function ProfileProvider({ children }: { children: ReactNode }) {
  const state = useProfileLoader(true);
  return createElement(ProfileContext.Provider, { value: state }, children);
}

/** The shared profile when inside ProfileProvider; a standalone load otherwise. */
export function useCurrentProfile(): ProfileState {
  const shared = useContext(ProfileContext);
  const own = useProfileLoader(!shared);
  return shared ?? own;
}
