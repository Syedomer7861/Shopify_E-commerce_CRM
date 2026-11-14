import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

/**
 * Google sign-in lands here with a one-time code. Exchanging it sets the
 * session cookie. A brand-new Google user already has their own held
 * workspace (handle_new_user) and is sent on to /billing by the app.
 * `next` is only ever a path on this site.
 */
export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") || "/";
  const safeNext = next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/";
  if (!code) return NextResponse.redirect(new URL("/login?error=google", url.origin));
  const store = cookies();
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      get: (name: string) => store.get(name)?.value,
      set: (name: string, value: string, options: CookieOptions) => store.set({ name, value, ...options }),
      remove: (name: string, options: CookieOptions) => store.set({ name, value: "", ...options }),
    },
  });
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    console.error("Google sign-in exchange failed:", error.message);
    return NextResponse.redirect(new URL("/login?error=google", url.origin));
  }
  return NextResponse.redirect(new URL(safeNext, url.origin));
}
