// Demo-presenter mode.
//
// A cookie (`crm-demo-mode=true`) is set at login (src/app/login/page.tsx)
// and re-set by useCurrentProfile when a profile is flagged is_demo. While
// it's present, pages load MOCK_* data from src/lib/mockData.ts and skip
// their real API calls, so the app can be demoed with no live backend.
//
// This check used to be a hand-copied `document.cookie.includes(...)` string
// literal in ~55 files. It's one function now: same behaviour, SSR-safe
// (guards `document`), and the cookie name lives in exactly one place.

export const DEMO_COOKIE_MATCH = "crm-demo-mode=true";

/** True when the current browser is in demo-presenter mode. Client-only. */
export function isDemoMode(): boolean {
  return typeof document !== "undefined" && document.cookie.includes(DEMO_COOKIE_MATCH);
}
