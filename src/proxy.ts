import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

function hasValidSystemSecret(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;
  const suppliedSecret = request.headers.get("x-cron-secret");
  return suppliedSecret === cronSecret;
}

function hasValidSyncSecret(request: NextRequest) {
  const syncSecret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!syncSecret) return false;
  const suppliedSecret = request.headers.get("x-sync-secret");
  return suppliedSecret === syncSecret;
}

export default async function proxy(request: NextRequest) {
  console.log("PROXY: Request Path:", request.nextUrl.pathname);
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          const cookieOptions = { ...options, secure: false, sameSite: 'lax' as const };
          request.cookies.set({ name, value, ...cookieOptions });
          response = NextResponse.next({
            request: { headers: request.headers },
          });
          response.cookies.set({ name, value, ...cookieOptions });
        },
        remove(name: string, options: CookieOptions) {
          const cookieOptions = { ...options, secure: false, sameSite: 'lax' as const };
          request.cookies.set({ name, value: "", ...cookieOptions });
          response = NextResponse.next({
            request: { headers: request.headers },
          });
          response.cookies.set({ name, value: "", ...cookieOptions });
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  const isProtectedSystemRoute =
    request.nextUrl.pathname.startsWith("/api/sync") ||
    request.nextUrl.pathname.startsWith("/api/cron");
  const isPublicPath = request.nextUrl.pathname.startsWith("/login") || 
                       request.nextUrl.pathname.startsWith("/api/webhooks") ||
                       request.nextUrl.pathname.startsWith("/api/backup") ||
                       request.nextUrl.pathname.startsWith("/api/activity-logs");
  const isAuthInternal = isProtectedSystemRoute && (hasValidSystemSecret(request) || hasValidSyncSecret(request));
  console.log("PROXY: Protected:", isProtectedSystemRoute, "AuthInternal:", isAuthInternal);

  if (!user && !isPublicPath && !isAuthInternal) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // If user is logged in and trying to access login, redirect to dashboard
  if (user && request.nextUrl.pathname.startsWith("/login")) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
