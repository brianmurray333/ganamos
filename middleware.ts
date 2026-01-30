import { createMiddlewareClient } from "@supabase/auth-helpers-nextjs"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

export async function middleware(req: NextRequest) {
  const res = NextResponse.next()
  const host = req.headers.get("host") || ""
  const path = req.nextUrl.pathname

  // DEBUG: Log what host we're seeing (to diagnose www redirect)
  console.log(`[MW] host="${host}" path="${path}" url="${req.url}"`)

  // CRITICAL: Redirect non-www to www for ganamos.earth
  // This ensures cookies (set on www.ganamos.earth) are always sent
  // Without this, users get logged out when accessing ganamos.earth (no www)
  if (host === "ganamos.earth") {
    const url = req.nextUrl.clone()
    url.host = "www.ganamos.earth"
    console.log(`[MW] Redirecting non-www to www: ${req.url} -> ${url.toString()}`)
    return NextResponse.redirect(url, 301) // 301 = permanent redirect (good for SEO)
  }

  // Handle Satoshi Pet domains - rewrite to /satoshi-pet routes
  const isSatoshiPetDomain = 
    host.includes("satoshipet.com") || 
    host.includes("satoshi.pet")

  if (isSatoshiPetDomain) {
    // If at root, rewrite to /satoshi-pet
    if (path === "/" || path === "") {
      return NextResponse.rewrite(new URL("/satoshi-pet", req.url))
    }
    // If at /setup, redirect to main page with #setup hash to scroll to section
    if (path === "/setup") {
      return NextResponse.redirect(new URL("/#setup", req.url))
    }
    // If at /order/*, rewrite to /satoshi-pet/order/*
    if (path.startsWith("/order/")) {
      return NextResponse.rewrite(new URL(`/satoshi-pet${path}`, req.url))
    }
    // Already on /satoshi-pet paths, continue normally
    if (path.startsWith("/satoshi-pet")) {
      return res
    }
    // For any other path on satoshi pet domain, redirect to root
    return NextResponse.redirect(new URL("/", req.url))
  }

  // Handle /pet redirect on main domain to satoshipet.com
  if (path === "/pet" && !isSatoshiPetDomain) {
    return NextResponse.redirect(new URL("https://satoshipet.com"))
  }

  // Protected routes require authentication
  // Note: /post/new is NOT protected - it supports anonymous posting with Lightning payment
  const protectedRoutes = ["/dashboard", "/wallet", "/profile"]
  const isProtectedRoute = protectedRoutes.some((route) => path.startsWith(route))

  // Auth routes for redirecting authenticated users
  const authRoutes = ["/auth/login", "/auth/register"]
  const isExactAuthRoute = authRoutes.includes(path)

  // Only do auth checks for routes that need it
  if (isProtectedRoute || isExactAuthRoute) {
    const supabase = createMiddlewareClient({ req, res })

    // Get session - wrap in try-catch to handle stale/invalid refresh tokens gracefully
    let session = null
    try {
      const { data } = await supabase.auth.getSession()
      session = data.session
    } catch (error: unknown) {
      // This happens when user has stale cookies with an invalid refresh token
      // (e.g., token expired, revoked, or user logged out elsewhere)
      // Just treat as no session - user will be redirected to login
      if (error && typeof error === 'object' && 'code' in error && error.code === 'refresh_token_not_found') {
        console.log('[MW] Stale refresh token detected, treating as logged out')
      } else {
        console.error('[MW] Auth error:', error)
      }
    }

    // DEBUG: Log auth check details for protected routes (especially /profile)
    if (path === '/profile' || path.startsWith('/profile')) {
      console.log('[MW-DEBUG] Profile route auth check', {
        path,
        hasSession: !!session,
        userId: session?.user?.id,
        userEmail: session?.user?.email,
        isPrefetch: req.headers.get('purpose') === 'prefetch' || req.headers.get('x-middleware-prefetch') === '1',
        timestamp: new Date().toISOString(),
      })
    }

    // SECURITY: Check if user account is suspended
    // Skip this check for the suspended page itself and API routes
    if (session && isProtectedRoute && path !== '/auth/suspended') {
      const { data: profile } = await supabase
        .from('profiles')
        .select('status')
        .eq('id', session.user.id)
        .single()

      if (profile?.status === 'suspended') {
        console.log('[MW-SECURITY] Suspended user blocked:', {
          userId: session.user.id,
          email: session.user.email,
          attemptedPath: path,
          timestamp: new Date().toISOString(),
        })
        // Sign out the user and redirect to suspended page
        await supabase.auth.signOut()
        return NextResponse.redirect(new URL('/auth/suspended', req.url))
      }
    }

    if (isProtectedRoute && !session) {
      // DEBUG: Log when redirecting to login
      console.log('[MW-DEBUG] No session, redirecting to login', {
        path,
        isPrefetch: req.headers.get('purpose') === 'prefetch' || req.headers.get('x-middleware-prefetch') === '1',
      })
      // Redirect to login with return URL
      const redirectUrl = new URL("/auth/login", req.url)
      redirectUrl.searchParams.set("redirect", path)
      return NextResponse.redirect(redirectUrl)
    }

    if (isExactAuthRoute && session) {
      // Redirect authenticated users away from auth pages
      const redirectTo = req.nextUrl.searchParams.get("redirect")
      if (redirectTo && !authRoutes.includes(redirectTo)) {
        return NextResponse.redirect(new URL(redirectTo, req.url))
      }
      return NextResponse.redirect(new URL("/dashboard", req.url))
    }
  }

  return res
}

export const config = {
  matcher: [
    "/",
    "/pet",
    "/setup",
    "/order/:path*",
    "/satoshi-pet/:path*",
    "/dashboard/:path*",
    "/wallet/:path*",
    "/profile/:path*",
    "/post/:path*",
    "/auth/login",
    "/auth/register",
    "/auth/phone",
    "/auth/suspended",
    "/admin/:path*",
  ],
}
