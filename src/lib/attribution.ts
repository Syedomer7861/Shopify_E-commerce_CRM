import { z } from "zod";

// First-party marketing attribution for the public site (Phase 7a).
// Nothing here runs until the visitor allows analytics in the consent banner.
// A "touch" records how someone arrived: UTM tags and the referring site's
// host name only (never the full referring URL, which can carry personal data).
// The first and latest touch ride along with a contact request.

export const CONSENT_COOKIE = "cc_consent";
export const ATTRIBUTION_KEY = "cc_attr";
export type Consent = "analytics" | "essential";

const short = z.string().trim().min(1).max(100);
export const TouchSchema = z.object({
  source: short.optional(),
  medium: short.optional(),
  campaign: short.optional(),
  term: short.optional(),
  content: short.optional(),
  referrer: z.string().trim().max(253).regex(/^[a-z0-9.-]+$/).optional(),
  landing: z.string().max(200).regex(/^\/[^\s]*$/),
  at: z.string().datetime(),
}).strict();
export type Touch = z.infer<typeof TouchSchema>;

export const AttributionSchema = z.object({ first: TouchSchema, last: TouchSchema }).strict();
export type Attribution = z.infer<typeof AttributionSchema>;

const UTM = ["source", "medium", "campaign", "term", "content"] as const;

/** How the visitor arrived at this URL, or null for internal or direct navigation with no tags. */
export function touchFromUrl(href: string, referrer: string, now: Date = new Date()): Touch | null {
  let url: URL;
  try { url = new URL(href); } catch { return null; }
  const touch: Record<string, string> = {};
  for (const k of UTM) {
    const v = url.searchParams.get(`utm_${k}`)?.trim().slice(0, 100);
    if (v) touch[k] = v;
  }
  try {
    const ref = new URL(referrer);
    if (/^https?:$/.test(ref.protocol) && ref.hostname !== url.hostname) touch.referrer = ref.hostname.toLowerCase();
  } catch { /* direct visit or no referrer */ }
  if (Object.keys(touch).length === 0) return null;
  const parsed = TouchSchema.safeParse({ ...touch, landing: url.pathname.slice(0, 200), at: now.toISOString() });
  return parsed.success ? parsed.data : null;
}

/** Keeps the first touch forever and replaces the latest one. */
export function mergeTouch(stored: unknown, touch: Touch): Attribution {
  const prev = AttributionSchema.safeParse(stored);
  return { first: prev.success ? prev.data.first : touch, last: touch };
}

// Same public sections as src/middleware.ts. Touches are only recorded here:
// inside the app, a referrer is a sign-in redirect, not a marketing source.
const PUBLIC_SECTIONS = ["features", "solutions", "integrations", "compare", "resources", "tools", "blog", "contact"];
export function isPublicPath(pathname: string): boolean {
  return pathname === "/" || PUBLIC_SECTIONS.includes(pathname.split("/")[1]);
}

export function readConsent(cookie: string): Consent | null {
  const m = cookie.match(new RegExp(`(?:^|; )${CONSENT_COOKIE}=(analytics|essential)`));
  return (m?.[1] as Consent) || null;
}
