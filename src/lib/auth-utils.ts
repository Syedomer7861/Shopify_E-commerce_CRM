import { createServerClient } from "./supabase";
import { NextResponse } from "next/server";

/**
 * Ensures the request is authenticated and returns the user/profile.
 * Returns a Response object if authentication fails.
 */
export async function getAuthenticatedSession() {
  const supabase = createServerClient();
  
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return {
      errorResponse: NextResponse.json(
        { error: "Unauthorized: Please log in to access this resource" },
        { status: 401 }
      ),
      user: null,
      supabase: null
    };
  }

  // Fetch profile to get role/permissions
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  return {
    errorResponse: null,
    user,
    profile,
    supabase
  };
}

/**
 * Platform owner only, with a session that passed two-factor. Every
 * owner-level API route calls this; the database checks the same thing
 * (is_platform_owner_verified) for direct reads and writes.
 */
export async function requirePlatformOwner() {
  const session = await getAuthenticatedSession();
  if (session.errorResponse) return { ...session, profile: null };
  if (!session.profile?.is_platform_admin) {
    return { ...session, errorResponse: NextResponse.json({ error: "Forbidden: platform owner only" }, { status: 403 }) };
  }
  const { data: aal } = await session.supabase!.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.currentLevel !== "aal2") {
    return { ...session, errorResponse: NextResponse.json({ error: "Two-factor sign-in required for owner actions" }, { status: 403 }) };
  }
  return session;
}

/**
 * Ensures the user has admin role.
 */
export async function ensureAdmin() {
  const { errorResponse, profile, supabase } = await getAuthenticatedSession();
  
  if (errorResponse) return { errorResponse, profile: null, supabase: null };

  if (profile?.role !== "admin") {
    return {
      errorResponse: NextResponse.json(
        { error: "Forbidden: Admin access required" },
        { status: 403 }
      ),
      profile,
      supabase
    };
  }

  return { errorResponse: null, profile, supabase };
}

/* ------------------------------------------------------------------ *
 * Internal / system route protection (cron jobs, sync workers)
 * ------------------------------------------------------------------ */

import crypto from "crypto";
import type { NextRequest } from "next/server";
import type { UserPermissions } from "@/types";
import { loadProfile } from "./profile-loader";
import { hasPermission, isAdmin } from "./permissions";
import { can, type Action } from "./access";

/** Constant-time string compare. Returns false for empty/mismatched input. */
export function safeEqual(a?: string | null, b?: string | null) {
  if (!a || !b) return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/** Secrets a trusted internal caller (Vercel cron, chat/wa daemon) may present. */
function internalSecrets(): string[] {
  return [
    process.env.CRON_SECRET,
    process.env.SYNC_SECRET,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  ].filter(Boolean) as string[];
}

/** True when the request carries a known internal secret. */
export function hasInternalSecret(req: NextRequest | Request) {
  const headers = req.headers;
  const bearer = headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const supplied = [
    headers.get("x-cron-secret"),
    headers.get("x-sync-secret"),
    headers.get("x-admin-secret"),
    bearer,
  ].filter(Boolean) as string[];

  if (!supplied.length) return false;
  const known = internalSecrets();
  return supplied.some((s) => known.some((k) => safeEqual(s, k)));
}

/**
 * Guard for cron/sync routes. Allows either a trusted internal secret
 * (Vercel cron sends `Authorization: Bearer $CRON_SECRET`; the local daemons
 * send `x-sync-secret`) or a signed-in CRM user clicking a manual trigger.
 * Returns a 401 response when neither is present, otherwise null.
 */
export async function requireInternal(req: NextRequest | Request): Promise<NextResponse | null> {
  if (hasInternalSecret(req)) return null;

  try {
    const supabase = createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) return null;
  } catch {
    // No cookie context (background task) - treat as anonymous.
  }

  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

/**
 * Guard for operational routes (cron jobs, repair tools, integration tests).
 * requireInternal() lets ANY signed-in user through, which is right for the
 * everyday data routes that use it but meant an agent could trigger a
 * backfill or restart the WhatsApp bridge with a plain fetch. This allows a
 * trusted internal secret, an admin, or a signed-in user holding at least
 * one of `anyOf` - nobody else. 401 when logged out, 403 when not permitted.
 */
export async function requirePrivileged(
  req: NextRequest | Request,
  anyOf: (keyof UserPermissions)[] = []
): Promise<NextResponse | null> {
  if (hasInternalSecret(req)) return null;

  let profile = null;
  try {
    const supabase = createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) profile = await loadProfile(supabase, user.id);
  } catch {
    // No cookie context (background task) - treat as anonymous.
  }

  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (isAdmin(profile) || anyOf.some((p) => hasPermission(profile, p))) return null;
  return NextResponse.json({ error: "Forbidden: you don't have permission to run this" }, { status: 403 });
}

/**
 * Webhook secrets that ship as defaults and must never count as configured.
 */
// Values that have appeared in the repo or the settings UI as examples. A
// secret anyone can read is not a secret, so treat these as "not configured"
// even though they look like real tokens.
const PLACEHOLDER_SECRETS = [
  "cureforever_secret_2026",
  "cureforever_shiprocket_sync_2026",
  "cureforever_sync_secret_2026",
  "your_secret",
  "changeme",
];

export function isSecretConfigured(secret?: string | null): secret is string {
  return !!secret && !PLACEHOLDER_SECRETS.includes(secret);
}

/**
 * When WEBHOOK_STRICT=true, webhooks with no configured secret are rejected
 * instead of processed. Off by default so an unconfigured deployment keeps
 * receiving orders; turn it on once every secret is set in the host env.
 */
export function webhookStrict() {
  return process.env.WEBHOOK_STRICT === "true";
}

/**
 * Guard for the permission-engine modules (see ./access). Resolves the
 * signed-in user's scope for module.action from their role's grants.
 * Returns an errorResponse (401/403) or the session plus that scope, so the
 * route can narrow its query. RLS enforces the same grants underneath.
 */
export async function requirePermission(module: string, action: Action) {
  const denied = (status: 401 | 403, error: string) =>
    ({ errorResponse: NextResponse.json({ error }, { status }), profile: null, supabase: null, scope: null });

  const supabase = createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return denied(401, "Unauthorized: please log in");

  const profile = await loadProfile(supabase, user.id);
  const scope = can(profile, module, action);
  if (!profile || !scope) return denied(403, "Forbidden: your role doesn't allow this");
  return { errorResponse: null, profile, supabase, scope };
}
