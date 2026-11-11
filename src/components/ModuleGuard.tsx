"use client";
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useCurrentProfile } from "@/hooks/useCurrentProfile";
import { allowedNavModules, ALL_NAV_MODULES } from "@/lib/permissions";
import { createClient } from "@/lib/supabase";

// Pages that are never gated here regardless of the allowlist: /workspace is
// governed by per-Space membership server-side, and the app's own routes for
// auth/onboarding must always resolve.
const NEVER_GATED = new Set(["", "workspace"]);

// Redirect destination for an allowlist entry. Every key is its own first URL
// segment except request-creative, which has no page of its own.
const modulePath = (key: string) =>
  key === "request-creative" ? "/workspace/request" : `/${key}`;

/**
 * Hiding a nav link isn't access control — this redirects a user who types a
 * URL for a module they aren't allowed to see. Fail-open: no profile yet, an
 * un-gated page, or no allowlist -> do nothing.
 */
export function ModuleGuard() {
  const { profile, loading } = useCurrentProfile();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (loading || !profile) return;
    const allowed = allowedNavModules(profile);
    if (!allowed) return;

    const seg = pathname.split("/")[1] || "";
    if (NEVER_GATED.has(seg)) return;
    if (!ALL_NAV_MODULES.includes(seg)) return; // not a page this feature governs
    if (allowed.includes(seg)) return;          // permitted

    router.replace(modulePath(allowed[0]) || "/workspace");
  }, [profile, loading, pathname, router]);

  // Idle sign-out, when the org admin set a session timeout (Organisation
  // page). Any key, click or tap restarts the clock.
  const timeoutMinutes = profile?.org_session_timeout_minutes;
  useEffect(() => {
    if (!timeoutMinutes) return;
    let timer: ReturnType<typeof setTimeout>;
    const signOut = async () => {
      await createClient().auth.signOut();
      window.location.href = "/login";
    };
    const restart = () => { clearTimeout(timer); timer = setTimeout(signOut, timeoutMinutes * 60_000); };
    const events = ["keydown", "pointerdown", "visibilitychange"] as const;
    events.forEach(e => window.addEventListener(e, restart, { passive: true }));
    restart();
    return () => { clearTimeout(timer); events.forEach(e => window.removeEventListener(e, restart)); };
  }, [timeoutMinutes]);

  return null;
}
