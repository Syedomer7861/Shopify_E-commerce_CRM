"use client";
import { useEffect, useMemo } from "react";
import { createClient } from "@/lib/supabase";
import { useCurrentProfile } from "@/hooks/useCurrentProfile";
import { orgModuleOff } from "@/lib/access";
import { applyOrgTheme, cleanTheme, themeCacheKey, THEME_EVENT, type OrgTheme } from "@/lib/org-theme";

/**
 * Applies the organisation's saved theme (Premium "branding" module).
 * Cached per org in localStorage so the colour shows before the fetch lands.
 * Saving in Settings › Appearance dispatches THEME_EVENT for a live update.
 */
export function OrgThemeApplier() {
  const { profile } = useCurrentProfile();
  const supabase = useMemo(() => createClient(), []);
  const orgId = profile?.org_id;
  const off = orgModuleOff(profile, "branding");

  useEffect(() => {
    if (!orgId) return;
    if (off) { applyOrgTheme({}); return; }
    const key = themeCacheKey(orgId);
    try { const c = localStorage.getItem(key); if (c) applyOrgTheme(cleanTheme(JSON.parse(c))); } catch { /* storage blocked */ }

    let live = true;
    supabase.from("organizations").select("theme").eq("id", orgId).maybeSingle().then(({ data, error }) => {
      if (!live || error) return; // keep cached/default look on error
      const t = cleanTheme(data?.theme);
      applyOrgTheme(t);
      try { localStorage.setItem(key, JSON.stringify(t)); } catch { /* storage blocked */ }
    });

    const onChange = (e: Event) => {
      const t = cleanTheme((e as CustomEvent<OrgTheme>).detail);
      applyOrgTheme(t);
      try { localStorage.setItem(key, JSON.stringify(t)); } catch { /* storage blocked */ }
    };
    window.addEventListener(THEME_EVENT, onChange);
    return () => { live = false; window.removeEventListener(THEME_EVENT, onChange); };
  }, [orgId, off, supabase]);

  return null;
}
