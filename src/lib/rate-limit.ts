import { NextResponse } from "next/server";
import { Redis } from "@upstash/redis";

/**
 * Fixed-window rate limiter for API routes.
 *
 * Counts live in Upstash Redis when UPSTASH_REDIS_REST_URL/TOKEN are set, so
 * the limit holds across every serverless instance. Without them (local dev,
 * the check script) or if Redis is slow or down, it falls back to
 * per-instance memory: each warm instance then keeps its own counters, so the
 * real ceiling is N x limit. A limiter outage must never block a webhook.
 *
 * ponytail: fixed window, one INCR per request. Not exact at window edges
 * (a burst can straddle two windows); use a sliding window if that matters.
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

// Created here rather than imported from lib/redis.ts: that module is
// "server-only", which throws when the check script loads this file in Node.
const redis =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({ url: process.env.UPSTASH_REDIS_REST_URL, token: process.env.UPSTASH_REDIS_REST_TOKEN, retry: { retries: 0 } })
    : null;

// Longest a request waits on Redis before falling back to memory.
const REDIS_TIMEOUT_MS = 300;

/** Shared count, or null when Redis is not configured, slow or failing. */
async function checkShared(key: string, limit: number, windowMs: number): Promise<RateLimitResult | null> {
  if (!redis) return null;
  const now = Date.now();
  const windowStart = Math.floor(now / windowMs) * windowMs;
  const redisKey = `rl:${key}:${windowStart}`;
  try {
    const count = await Promise.race([
      redis.incr(redisKey),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), REDIS_TIMEOUT_MS)),
    ]);
    if (count === null) return null;
    // First hit of the window sets its expiry; not awaited, the key name
    // already scopes it to this window.
    if (count === 1) redis.pexpire(redisKey, windowMs * 2).catch(() => {});
    const retryAfterSeconds = Math.max(1, Math.ceil((windowStart + windowMs - now) / 1000));
    return count > limit
      ? { allowed: false, remaining: 0, retryAfterSeconds }
      : { allowed: true, remaining: limit - count, retryAfterSeconds };
  } catch (err) {
    console.error("Rate limiter: Redis unavailable, using in-memory fallback.", err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Guard for a route handler. Returns a 429 response to return early, or null
 * to continue.
 *
 *   const limited = await rateLimit(req, "shopify-webhook", 120, 60_000);
 *   if (limited) return limited;
 */
export async function rateLimit(
  req: Request,
  scope: string,
  limit: number,
  windowMs: number
): Promise<NextResponse | null> {
  const key = clientKey(req, scope);
  const result = (await checkShared(key, limit, windowMs)) ?? checkRateLimit(key, limit, windowMs);
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
