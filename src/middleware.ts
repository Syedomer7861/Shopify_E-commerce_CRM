import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({
            name,
            value,
            ...options,
          })
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          })
          response.cookies.set({
            name,
            value,
            ...options,
          })
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({
            name,
            value: '',
            ...options,
          })
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          })
          response.cookies.set({
            name,
            value: '',
            ...options,
          })
        },
      },
    }
  )

  // getUser() revalidates the JWT with Supabase; getSession() trusts the cookie as-is.
  // A link prefetch only fetches a page's static shell (every page's data is
  // loaded by the browser under row-level security), and the sidebar fires
  // dozens of them per page load. Those read the session from the cookie; a
  // real navigation still revalidates with Supabase.
  const isPrefetch = request.headers.get('next-router-prefetch') === '1'
  // A real navigation verifies the token's signature here, against the
  // project's public signing key (cached), with no call to the auth server -
  // that call crossed to another region and delayed every page. getClaims()
  // falls back to getUser() by itself if the project ever uses a shared
  // secret, so the session is verified either way.
  let user: { id: string } | null = null
  if (isPrefetch) {
    const id = (await supabase.auth.getSession()).data.session?.user?.id
    user = id ? { id } : null
  } else {
    let id: string | undefined
    try {
      id = (await supabase.auth.getClaims()).data?.claims?.sub
    } catch {
      // Signing key unreachable or token unreadable: decided by the auth server below.
    }
    // Never sign someone out because local verification couldn't decide: ask
    // the auth server, exactly as before. With no session this returns at once.
    if (!id) id = (await supabase.auth.getUser()).data.user?.id
    user = id ? { id } : null
  }

  // Protect all routes except login, api, and static files
  const isLoginPage = request.nextUrl.pathname.startsWith('/login')
  const isSignupPage = request.nextUrl.pathname.startsWith('/signup')
  // Self-serve signup is retired - /signup just redirects here (see
  // src/app/signup/page.tsx) - and this is also the landing page's "Contact
  // Us" CTA, so it has to be reachable logged-out same as /login.
  const isContactPage = request.nextUrl.pathname.startsWith('/contact')
  const isApiRoute = request.nextUrl.pathname.startsWith('/api')
  const isAuthRoute = request.nextUrl.pathname.startsWith('/auth')
  const isStaticFile = request.nextUrl.pathname.includes('.')
  // "/" is the public marketing page for a logged-out visitor (src/app/
  // page.tsx renders LandingPage when there's no session) - without this,
  // every anonymous visit to the root was redirected straight to /login
  // before that page's own client-side logic ever ran, so the marketing
  // page could never actually be seen.
  const isRootPage = request.nextUrl.pathname === '/'
  // Public marketing sections (src/app/(site)). Static content, no data.
  const isSitePage = ['features', 'solutions', 'integrations', 'compare', 'resources', 'tools', 'blog', 'pricing']
    .includes(request.nextUrl.pathname.split('/')[1])

  // Demo mode is a real login (see login/page.tsx): the demo cookie is only set
  // after signInWithPassword succeeds, so it must never stand in for a session.
  if (!user && !isLoginPage && !isSignupPage && !isContactPage && !isApiRoute && !isAuthRoute && !isStaticFile && !isRootPage && !isSitePage) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // A signed-in visitor to "/" goes to their own home. Doing it here keeps
  // the root page server-rendered for everyone else, so search engines get
  // the real marketing page instead of a loading spinner. Routing matches
  // what src/app/page.tsx did client-side before.
  if (user && isRootPage) {
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    const home = profile?.role === 'manager' ? '/manager' : profile?.role === 'hr' ? '/hr' : '/dashboard'
    return NextResponse.redirect(new URL(home, request.url))
  }

  // If user is logged in and tries to access login page, redirect to their
  // real landing page - login/page.tsx's own post-login redirect already
  // sends managers to /manager, but that only covers the form submit path.
  // A manager who's already authenticated and lands on /login some other
  // way (bookmark, reopened tab) was always bounced to /dashboard here
  // instead, regardless of role.
  if (user && isLoginPage) {
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    // Matches src/app/page.tsx and login/page.tsx's own role routing exactly.
    const landingPage = profile?.role === 'manager' ? '/manager'
      : profile?.role === 'admin' ? '/my-hub'
      : profile?.role === 'hr' ? '/hr'
      : '/dashboard'
    return NextResponse.redirect(new URL(landingPage, request.url))
  }

  return response
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * Feel free to modify this pattern to include more paths.
     */
    // Public files (icons, manifest, service worker, offline page, sounds)
    // were always let through below; skipping them here saves an auth round
    // trip on each one.
    '/((?!_next/static|_next/image|favicon.ico|icons/|manifest.json|sw.js|offline.html|.*\\.(?:png|jpg|jpeg|svg|webp|ico|mp3|woff2?)$).*)',
  ],
}
