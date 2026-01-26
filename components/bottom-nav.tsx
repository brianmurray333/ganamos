"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { Home, User, Map, Wallet, Plus } from "lucide-react"
import { cn } from "@/lib/utils"
import { useAuth } from "@/components/auth-provider"

export function BottomNav() {
  const pathname = usePathname()
  const router = useRouter()
  // NotificationsProvider removed - pending requests feature disabled
  const hasPendingRequests = false
  const { user, loading, session, sessionLoaded } = useAuth()

  // Only enable prefetch after session is confirmed to prevent caching stale auth redirects
  // Before session is established, prefetch could cache a "redirect to login" response
  const canPrefetch = sessionLoaded && !!session

  // Don't show bottom nav on home page, auth pages, public job posting page, post creation page, post detail page, withdraw page, deposit page, pet settings page, or satoshi-pet pages
  if (pathname === "/" || pathname.startsWith("/auth") || pathname === "/new" || pathname === "/post/new" || pathname.startsWith("/post/") || pathname.startsWith("/wallet/withdraw") || pathname.startsWith("/wallet/deposit") || pathname === "/pet-settings" || pathname.startsWith("/satoshi-pet")) {
    return null
  }

  // Don't show bottom nav for unauthenticated users (except on specific public pages)
  // Wait until sessionLoaded is true before deciding to hide - prevents flash during OAuth callback
  if (sessionLoaded && !user) {
    return null
  }

  const isActive = (path: string) => {
    if (path === "/dashboard" && (pathname === "/dashboard" || pathname === "/")) return true
    if (path !== "/dashboard" && pathname.startsWith(path)) return true
    return false
  }

  const handleMapClick = () => {
    router.push("/map")
  }

  return (
    <div 
      id="bottom-nav" 
      className="fixed bottom-10 left-1/2 -translate-x-1/2 z-50 lg:hidden"
    >
      <div className="flex items-center gap-5 h-16 px-6 bg-white/90 dark:bg-gray-900/90 backdrop-blur-xl rounded-full shadow-lg shadow-black/10 dark:shadow-black/30 border border-gray-200/50 dark:border-gray-700/50">
        {/* Home icon */}
        <Link
          href="/dashboard"
          prefetch={canPrefetch}
          data-testid="nav-dashboard-link"
          className={cn(
            "flex items-center justify-center w-12 h-12 rounded-full transition-all duration-200",
            isActive("/dashboard") 
              ? "bg-gray-100 dark:bg-gray-800 text-primary dark:text-white" 
              : "hover:bg-gray-100 dark:hover:bg-gray-800",
          )}
        >
          <Home
            className={cn(
              "w-6 h-6 transition-colors",
              isActive("/dashboard") 
                ? "text-gray-900 dark:text-white" 
                : "text-gray-500 dark:text-gray-400",
            )}
          />
        </Link>

        {/* Map icon */}
        <button
          onClick={handleMapClick}
          data-testid="nav-map-button"
          className={cn(
            "flex items-center justify-center w-12 h-12 rounded-full transition-all duration-200",
            pathname === "/map" 
              ? "bg-gray-100 dark:bg-gray-800 text-primary dark:text-white" 
              : "hover:bg-gray-100 dark:hover:bg-gray-800",
          )}
        >
          <Map
            className={cn(
              "w-6 h-6 transition-colors",
              pathname === "/map" 
                ? "text-gray-900 dark:text-white" 
                : "text-gray-500 dark:text-gray-400",
            )}
          />
        </button>

        {/* New Post button - Center accent */}
        <button
          onClick={() => router.push("/post/new")}
          data-testid="nav-new-post-button"
          className="flex items-center justify-center w-12 h-12 rounded-full bg-primary hover:bg-primary/90 transition-all duration-200 transform hover:scale-105 shadow-[0_2px_8px_rgba(34,197,94,0.4)]"
          aria-label="New Post"
        >
          <Plus className="w-6 h-6 text-primary-foreground stroke-[2.5]" />
        </button>

        {/* Wallet icon */}
        <Link
          href="/wallet"
          prefetch={canPrefetch}
          data-testid="nav-wallet-link"
          className={cn(
            "flex items-center justify-center w-12 h-12 rounded-full transition-all duration-200",
            isActive("/wallet") 
              ? "bg-gray-100 dark:bg-gray-800 text-primary dark:text-white" 
              : "hover:bg-gray-100 dark:hover:bg-gray-800",
          )}
        >
          <Wallet
            className={cn(
              "w-6 h-6 transition-colors",
              isActive("/wallet") 
                ? "text-gray-900 dark:text-white" 
                : "text-gray-500 dark:text-gray-400",
            )}
          />
        </Link>

        {/* Profile icon */}
        <Link
          href="/profile"
          prefetch={canPrefetch}
          data-testid="nav-profile-link"
          className={cn(
            "flex items-center justify-center relative w-12 h-12 rounded-full transition-all duration-200",
            isActive("/profile") 
              ? "bg-gray-100 dark:bg-gray-800 text-primary dark:text-white" 
              : "hover:bg-gray-100 dark:hover:bg-gray-800",
          )}
        >
          <User
            className={cn(
              "w-6 h-6 transition-colors",
              isActive("/profile") 
                ? "text-gray-900 dark:text-white" 
                : "text-gray-500 dark:text-gray-400",
            )}
          />
          {hasPendingRequests && <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>}
        </Link>
      </div>
    </div>
  )
}
