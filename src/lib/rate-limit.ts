import { NextResponse } from "next/server";

/**
 * Fixed-window rate limiter for API routes.
 *
 * ponytail: per-instance memory, not a shared store. Each serverless instance
 * keeps its own counters, so with N warm instances the real ceiling is N x
 * limit. That is fine for what this is for — stopping one client from
 * hammering an endpoint in a loop — and wrong for anything that must be
 * exact, like billing quotas. Move to Upstash Redis if you ever need a global
 * count; the call sites do not change.
 *
 * Vercel's own Firewall sits in front of the function and is the better place
 * for volumetric abuse. This catches what gets past it, and works locally.
 */

type Window = { count: number; resetAt: number };

const buckets = new Map<string, Window>();

// Stops the map growing without bound on a long-lived instance.
const MAX_TRACKED_KEYS = 10_000;

function sweep(now: number) {
  if (buckets.size < MAX_TRACKED_KEYS) return;
  for (const [key, win] of buckets) {
    if (win.resetAt <= now) buckets.delete(key);
  }
  // Still full of live windows: drop the oldest rather than grow forever.
  if (buckets.size >= MAX_TRACKED_KEYS) {
    const oldest = [...buckets.entries()]
      .sort((a, b) => a[1].resetAt - b[1].resetAt)
      .slice(0, Math.floor(MAX_TRACKED_KEYS / 4));
    for (const [key] of oldest) buckets.delete(key);
  }
}

/** Best-effort client identity. Vercel sets x-forwarded-for at the edge. */
export function clientKey(req: Request, scope: string) {
  const fwd = req.headers.get("x-forwarded-for") || "";
  const ip = fwd.split(",")[0].trim() || req.headers.get("x-real-ip") || "unknown";
  return `${scope}:${ip}`;
}

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

export function checkRateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  sweep(now);

  const win = buckets.get(key);
  if (!win || win.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, retryAfterSeconds: 0 };
  }

  win.count++;
  const retryAfterSeconds = Math.max(1, Math.ceil((win.resetAt - now) / 1000));
  if (win.count > limit) {
    return { allowed: false, remaining: 0, retryAfterSeconds };
  }
  return { allowed: true, remaining: limit - win.count, retryAfterSeconds };
}

/**
 * Guard for a route handler. Returns a 429 response to return early, or null
 * to continue.
 *
 *   const limited = rateLimit(req, "shopify-webhook", 120, 60_000);
 *   if (limited) return limited;
 */
export function rateLimit(
  req: Request,
  scope: string,
  limit: number,
  windowMs: number
): NextResponse | null {
  const result = checkRateLimit(clientKey(req, scope), limit, windowMs);
  if (result.allowed) return null;

  console.warn(`Rate limit hit on "${scope}" - ${limit} requests per ${windowMs}ms exceeded.`);
  return NextResponse.json(
    { error: "Too many requests" },
    {
      status: 429,
      headers: {
        "Retry-After": String(result.retryAfterSeconds),
        "X-RateLimit-Limit": String(limit),
        "X-RateLimit-Remaining": "0",
      },
    }
  );
}

/** Test seam: drop all counters. */
export function __resetRateLimits() {
  buckets.clear();
}
