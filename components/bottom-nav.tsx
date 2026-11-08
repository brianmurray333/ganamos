"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { Home, User, Map, Wallet, Plus } from "lucide-react"
import { cn } from "@/lib/utils"
import { useAuth } from "@/components/auth-provider"
import { AuthPromptModal } from "@/components/auth-prompt-modal"
import { loadGoogleMaps } from "@/lib/google-maps-loader"
import { useEffect, useState, type MouseEvent } from "react"

// Tabs that middleware never redirects (only /wallet and /profile are
// auth-protected), so prefetching them can't cache a stale login redirect.
export const PUBLIC_TAB_ROUTES = ["/", "/map"] as const

/** Which tab is highlighted for a given path. */
export function isTabActive(path: string, activePath: string) {
  if (path === "/") return activePath === "/"
  return activePath === path || activePath.startsWith(`${path}/`)
}

function isPlainLeftClick(e: MouseEvent) {
  return e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey && !e.defaultPrevented
}

const tabClass =
  "flex items-center justify-center w-12 h-12 -mx-2.5 rounded-2xl transition-[transform,background-color] duration-150 active:scale-90 active:bg-gray-500/10 dark:active:bg-white/10 touch-manipulation select-none [-webkit-tap-highlight-color:transparent]"

function TabIcon({ icon: Icon, active }: { icon: typeof Home; active: boolean }) {
  return (
    <Icon
      aria-hidden="true"
      className={cn(
        "w-7 h-7 transition-colors duration-100",
        active ? "text-primary dark:text-primary" : "text-gray-500 dark:text-gray-400",
      )}
    />
  )
}

export function BottomNav() {
  const pathname = usePathname()
  const router = useRouter()
  // NotificationsProvider removed - pending requests feature disabled
  const hasPendingRequests = false
  const { user, session, sessionLoaded } = useAuth()
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [authFeature, setAuthFeature] = useState<'wallet' | 'profile'>('wallet')

  // Optimistic highlight: the tapped tab lights up on the same frame as the
  // tap, instead of only once the destination route has rendered.
  const [pendingHref, setPendingHref] = useState<string | null>(null)
  useEffect(() => {
    setPendingHref(null)
  }, [pathname])
  const activePath = pendingHref ?? pathname

  // Warm up the routes behind the tabs so a tap responds immediately instead
  // of waiting on the route payload and page JS:
  // - /post/new, / and /map aren't auth-gated, so it's safe to prefetch them
  //   before the session is known (see PUBLIC_TAB_ROUTES).
  // - The map component's JS is fetched when the browser is idle.
  useEffect(() => {
    router.prefetch("/post/new")
    PUBLIC_TAB_ROUTES.forEach((route) => router.prefetch(route))
    const warm = () => {
      import("@/components/camera-capture").catch(() => {})
      import("@/components/map-view").catch(() => {})
    }
    const w = window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number
      cancelIdleCallback?: (id: number) => void
    }
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(warm, { timeout: 4000 })
      return () => w.cancelIdleCallback?.(id)
    }
    const t = setTimeout(warm, 2000)
    return () => clearTimeout(t)
  }, [router])

  // Only enable prefetch after session is confirmed to prevent caching stale auth redirects
  // Before session is established, prefetch could cache a "redirect to login" response
  // (applies to the protected tabs: /wallet and /profile)
  const canPrefetch = sessionLoaded && !!session

  const isDocsDomain = typeof window !== 'undefined' &&
    window.location.hostname === 'docs.ganamos.earth'

  // Don't show bottom nav on home page, auth pages, public job posting page, post creation page, post detail page, withdraw page, deposit page, pet settings page, satoshi-pet pages, or docs subdomain
  if (isDocsDomain || pathname.startsWith("/auth") || pathname === "/new" || pathname === "/post/new" || pathname.startsWith("/post/") || pathname.startsWith("/wallet/withdraw") || pathname.startsWith("/wallet/deposit") || pathname === "/pet-settings" || pathname.startsWith("/satoshi-pet")) {
    return null
  }

  const isActive = (path: string) => isTabActive(path, activePath)

  const onTabClick = (href: string) => (e: MouseEvent) => {
    // A tap on the current tab clears any pending highlight (e.g. Map tapped,
    // then Home before the Map navigation committed).
    if (isPlainLeftClick(e)) setPendingHref(href !== pathname ? href : null)
  }

  // Start fetching the Google Maps script as soon as a finger lands on the
  // Map tab (~100ms before the click fires).
  const warmMap = () => {
    loadGoogleMaps().catch(() => {})
  }

  return (
    <>
      {/* Docked bottom navigation bar */}
    <nav
      id="bottom-nav"
      aria-label="Main"
        className="fixed bottom-0 left-0 z-50 w-full h-[82px] bg-white/80 backdrop-blur-md dark:bg-gray-900/80 pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
        <div className="relative w-full max-w-md mx-auto h-full">
          <div className="flex items-center justify-between h-full w-full px-8">
        {/* Home icon */}
        <Link
          href="/"
          data-testid="nav-dashboard-link"
          aria-label="Home"
          aria-current={isActive("/") ? "page" : undefined}
          onClick={onTabClick("/")}
          className={tabClass}
        >
          <TabIcon icon={Home} active={isActive("/")} />
        </Link>

        {/* Map icon */}
        <Link
          href="/map"
          data-testid="nav-map-button"
          aria-label="Map"
          aria-current={isActive("/map") ? "page" : undefined}
          onClick={onTabClick("/map")}
          onPointerDown={warmMap}
          className={tabClass}
        >
          <TabIcon icon={Map} active={isActive("/map")} />
        </Link>

            {/* New Post button - Center */}
            <div className="flex items-center justify-center">
        <button
          onClick={() => router.push("/post/new")}
          data-testid="nav-new-post-button"
                className={cn(
                  "flex items-center justify-center w-14 h-14 rounded-full bg-primary hover:bg-primary/90 transition-all duration-200 transform hover:scale-105 active:scale-95 active:bg-primary/80 shadow-lg touch-manipulation",
                  pathname === "/post/new" && "bg-primary/90 scale-105",
                )}
          aria-label="New Post"
        >
                <Plus className="w-6 h-6 text-white stroke-[2.5]" />
        </button>
            </div>

        {/* Wallet icon */}
        {user ? (
          <Link
            href="/wallet"
            prefetch={canPrefetch}
            data-testid="nav-wallet-link"
            aria-label="Wallet"
            aria-current={isActive("/wallet") ? "page" : undefined}
            onClick={onTabClick("/wallet")}
            className={tabClass}
          >
            <TabIcon icon={Wallet} active={isActive("/wallet")} />
          </Link>
        ) : (
          <button
            onClick={() => {
              setAuthFeature('wallet')
              setShowAuthModal(true)
            }}
            data-testid="nav-wallet-button"
            aria-label="Wallet"
            className={tabClass}
          >
            <TabIcon icon={Wallet} active={false} />
          </button>
        )}

        {/* Profile icon */}
        {user ? (
          <Link
            href="/profile"
            prefetch={canPrefetch}
            data-testid="nav-profile-link"
            aria-label="Profile"
            aria-current={isActive("/profile") ? "page" : undefined}
            onClick={onTabClick("/profile")}
            className={cn(tabClass, "relative")}
          >
            <TabIcon icon={User} active={isActive("/profile")} />
                {hasPendingRequests && <span className="absolute top-0 right-0 w-2 h-2 bg-red-500 rounded-full"></span>}
          </Link>
        ) : (
          <button
            onClick={() => {
              setAuthFeature('profile')
              setShowAuthModal(true)
            }}
            data-testid="nav-profile-button"
            aria-label="Profile"
            className={cn(tabClass, "relative")}
          >
            <TabIcon icon={User} active={false} />
          </button>
        )}
          </div>
        </div>
      </nav>

      <AuthPromptModal
        open={showAuthModal}
        onOpenChange={setShowAuthModal}
        feature={authFeature}
      />

      {/* =====================================================================
       * FLOATING PILL NAVIGATION (commented out — kept for potential rollback)
       * =====================================================================
       *
       * <div
       *   id="bottom-nav"
       *   className="fixed bottom-10 left-1/2 -translate-x-1/2 z-50 lg:hidden"
       * >
       *   <div className="flex items-center gap-5 h-16 px-6 bg-white/90 dark:bg-gray-900/90 backdrop-blur-xl rounded-full shadow-lg shadow-black/10 dark:shadow-black/30 border border-gray-200/50 dark:border-gray-700/50">
       *     {/* Home icon *\/}
       *     <Link
       *       href="/dashboard"
       *       prefetch={canPrefetch}
       *       data-testid="nav-dashboard-link"
       *       className={cn(
       *         "flex items-center justify-center w-12 h-12 rounded-full transition-all duration-200",
       *         isActive("/dashboard")
       *           ? "bg-gray-100 dark:bg-gray-800 text-primary dark:text-white"
       *           : "hover:bg-gray-100 dark:hover:bg-gray-800",
       *       )}
       *     >
       *       <Home
       *         className={cn(
       *           "w-6 h-6 transition-colors",
       *           isActive("/dashboard")
       *             ? "text-gray-900 dark:text-white"
       *             : "text-gray-500 dark:text-gray-400",
       *         )}
       *       />
       *     </Link>
       *
       *     {/* Map icon *\/}
       *     <button
       *       onClick={handleMapClick}
       *       data-testid="nav-map-button"
       *       className={cn(
       *         "flex items-center justify-center w-12 h-12 rounded-full transition-all duration-200",
       *         pathname === "/map"
       *           ? "bg-gray-100 dark:bg-gray-800 text-primary dark:text-white"
       *           : "hover:bg-gray-100 dark:hover:bg-gray-800",
       *       )}
       *     >
       *       <Map
       *         className={cn(
       *           "w-6 h-6 transition-colors",
       *           pathname === "/map"
       *             ? "text-gray-900 dark:text-white"
       *             : "text-gray-500 dark:text-gray-400",
       *         )}
       *       />
       *     </button>
       *
       *     {/* New Post button - Center accent *\/}
       *     <button
       *       onClick={() => router.push("/post/new")}
       *       data-testid="nav-new-post-button"
       *       className="flex items-center justify-center w-12 h-12 rounded-full bg-primary hover:bg-primary/90 transition-all duration-200 transform hover:scale-105 shadow-[0_2px_8px_rgba(34,197,94,0.4)]"
       *       aria-label="New Post"
       *     >
       *       <Plus className="w-6 h-6 text-primary-foreground stroke-[2.5]" />
       *     </button>
       *
       *     {/* Wallet icon *\/}
       *     {user ? (
       *       <Link
       *         href="/wallet"
       *         prefetch={canPrefetch}
       *         data-testid="nav-wallet-link"
       *         className={cn(
       *           "flex items-center justify-center w-12 h-12 rounded-full transition-all duration-200",
       *           isActive("/wallet")
       *             ? "bg-gray-100 dark:bg-gray-800 text-primary dark:text-white"
       *             : "hover:bg-gray-100 dark:hover:bg-gray-800",
       *         )}
       *       >
       *         <Wallet
       *           className={cn(
       *             "w-6 h-6 transition-colors",
       *             isActive("/wallet")
       *               ? "text-gray-900 dark:text-white"
       *               : "text-gray-500 dark:text-gray-400",
       *           )}
       *         />
       *       </Link>
       *     ) : (
       *       <button
       *         onClick={() => {
       *           setAuthFeature('wallet')
       *           setShowAuthModal(true)
       *         }}
       *         data-testid="nav-wallet-button"
       *         className={cn(
       *           "flex items-center justify-center w-12 h-12 rounded-full transition-all duration-200",
       *           "hover:bg-gray-100 dark:hover:bg-gray-800",
       *         )}
       *       >
       *         <Wallet
       *           className={cn(
       *             "w-6 h-6 transition-colors",
       *             "text-gray-500 dark:text-gray-400",
       *           )}
       *         />
       *       </button>
       *     )}
       *
       *     {/* Profile icon *\/}
       *     {user ? (
       *       <Link
       *         href="/profile"
       *         prefetch={canPrefetch}
       *         data-testid="nav-profile-link"
       *         className={cn(
       *           "flex items-center justify-center relative w-12 h-12 rounded-full transition-all duration-200",
       *           isActive("/profile")
       *             ? "bg-gray-100 dark:bg-gray-800 text-primary dark:text-white"
       *             : "hover:bg-gray-100 dark:hover:bg-gray-800",
       *         )}
       *       >
       *         <User
       *           className={cn(
       *             "w-6 h-6 transition-colors",
       *             isActive("/profile")
       *               ? "text-gray-900 dark:text-white"
       *               : "text-gray-500 dark:text-gray-400",
       *           )}
       *         />
       *         {hasPendingRequests && <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>}
       *       </Link>
       *     ) : (
       *       <button
       *         onClick={() => {
       *           setAuthFeature('profile')
       *           setShowAuthModal(true)
       *         }}
       *         data-testid="nav-profile-button"
       *         className={cn(
       *           "flex items-center justify-center relative w-12 h-12 rounded-full transition-all duration-200",
       *           "hover:bg-gray-100 dark:hover:bg-gray-800",
       *         )}
       *       >
       *         <User
       *           className={cn(
       *             "w-6 h-6 transition-colors",
       *             "text-gray-500 dark:text-gray-400",
       *           )}
       *         />
       *       </button>
       *     )}
       *   </div>
       *
       *   <AuthPromptModal
       *     open={showAuthModal}
       *     onOpenChange={setShowAuthModal}
       *     feature={authFeature}
       *   />
       * </div>
       * ===================================================================== */}
    </>
  )
}
