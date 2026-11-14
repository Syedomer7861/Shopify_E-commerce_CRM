import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { checkRateLimit } from "@/lib/rate-limit";

export type ApiScope = "leads:read" | "leads:write" | "deals:read" | "deals:write" | "tickets:read";
export type ApiCaller = { orgId: string; keyId: string; admin: ReturnType<typeof createAdminClient> };

export const apiError = (status: number, error: string) => NextResponse.json({ error }, { status });

/**
 * Resolves `Authorization: Bearer cc_...` to its workspace. The service key
 * is used only after the key is verified, and every query must then filter
 * on caller.orgId; the key's scopes limit what it may touch.
 */
export async function apiAuth(req: NextRequest, scope: ApiScope): Promise<ApiCaller | NextResponse> {
  const key = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!/^cc_[0-9a-f]{48}$/.test(key)) return apiError(401, "Missing or malformed API key");
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("api_key_lookup", { p_key: key });
  if (error) {
    console.error("[api] key lookup failed:", error.message);
    return apiError(500, "Could not verify the API key");
  }
  if (!data) return apiError(401, "Invalid or revoked API key");
  const { key_id, org_id, scopes } = data as { key_id: string; org_id: string; scopes: string[] };
  const rl = checkRateLimit(`api:${key_id}`, 120, 60_000);
  if (!rl.allowed) return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } });
  if (!scopes.includes(scope)) return apiError(403, `This key does not have the ${scope} scope`);
  return { orgId: org_id, keyId: key_id, admin };
}

/** ?limit (1-100, default 50) and ?since (ISO date) for list endpoints. */
export function listParams(req: NextRequest) {
  const u = req.nextUrl.searchParams;
  const limit = Math.min(100, Math.max(1, Number(u.get("limit")) || 50));
  const since = u.get("since");
  const sinceIso = since && !Number.isNaN(Date.parse(since)) ? new Date(since).toISOString() : null;
  return { limit, sinceIso };
}

export async function readJson(req: NextRequest): Promise<Record<string, unknown> | null> {
  try {
    const text = await req.text();
    if (text.length > 50_000) return null;
    const v = JSON.parse(text);
    return v && typeof v === "object" && !Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

/** Keeps only string fields from `allowed`, trimmed and capped. */
export function pickStrings(body: Record<string, unknown>, allowed: Record<string, number>) {
  const out: Record<string, string> = {};
  for (const [k, max] of Object.entries(allowed)) {
    const v = body[k];
    if (typeof v === "string" && v.trim()) out[k] = v.trim().slice(0, max);
  }
  return out;
}
