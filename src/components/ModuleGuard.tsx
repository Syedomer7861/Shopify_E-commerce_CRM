"use client";
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useCurrentProfile } from "@/hooks/useCurrentProfile";
import { allowedNavModules } from "@/lib/permissions";

// First path segment -> module key, for the Main-Menu pages a locked-down
// Workspace user can be redirected away from. Pages not listed here
// (workspace, team, hr, manager, reports, settings, ...) are governed by
// their own permission checks and are intentionally NOT gated here.
const SEGMENT_MODULE: Record<string, string> = {
  dashboard: "dashboard",
  tasks: "tasks",
  chat: "chat",
  "my-hub": "my-hub",
  customers: "customers",
  orders: "orders",
  calendar: "calendar",
  performance: "performance",
};

const MODULE_PATH: Record<string, string> = {
  dashboard: "/dashboard",
  tasks: "/tasks",
  chat: "/chat",
  "my-hub": "/my-hub",
  customers: "/customers",
  orders: "/orders",
  calendar: "/calendar",
  performance: "/performance",
  "request-creative": "/workspace/request",
};

/**
 * Hiding a nav link isn't access control — this redirects a user who types a
 * URL for a module they aren't allowed to see. Fail-open: no profile yet, an
 * unknown page, or no allowlist -> do nothing.
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
    const mod = SEGMENT_MODULE[seg];
    if (!mod || allowed.includes(mod)) return;

    router.replace(MODULE_PATH[allowed[0]] || "/workspace");
  }, [profile, loading, pathname, router]);

  return null;
}
