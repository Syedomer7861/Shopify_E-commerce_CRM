import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

console.log(">>> PROXY EXECUTING <<<");

export default async function proxy(request: NextRequest) {
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

  // DEBUG: Check session presence on Local IP / Non-localhost
  if (request.nextUrl.hostname !== "localhost") {
    const cookieNames = request.cookies.getAll().map(c => c.name).join(", ");
    console.log(`[AUTH DEBUG] Host: ${request.nextUrl.hostname} | Path: ${request.nextUrl.pathname} | User: ${user ? user.email : "NONE"} | Cookies: [${cookieNames}]`);
  }

  // If user is not logged in and trying to access app pages, redirect to login
  // EXCLUDE: API Webhooks and static assets
  const isPublicPath = request.nextUrl.pathname.startsWith("/login") || 
                       request.nextUrl.pathname.startsWith("/api/webhooks") ||
                       request.nextUrl.pathname.startsWith("/api/sync") ||
                       request.nextUrl.pathname.startsWith("/api/cron");

  if (!user && !isPublicPath) {
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
