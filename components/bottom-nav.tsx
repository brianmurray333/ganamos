"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { Home, User, Map, Wallet, Plus } from "lucide-react"
import { cn } from "@/lib/utils"
import { useNotifications } from "@/components/notifications-provider"
import { getCurrentLocationWithName } from "@/lib/geocoding"
import { useAuth } from "@/components/auth-provider"
import { useEffect } from "react"

export function BottomNav() {
  const pathname = usePathname()
  const router = useRouter()
  const { hasPendingRequests } = useNotifications()
  const { user, loading } = useAuth()

  // Prefetch the new post route for faster navigation
  useEffect(() => {
    router.prefetch("/post/new")
  }, [router])

  // Don't show bottom nav on home page, auth pages, public job posting page, post creation page, post detail page, withdraw page, deposit page, or pet settings page
  if (pathname === "/" || pathname.startsWith("/auth") || pathname === "/new" || pathname === "/post/new" || pathname.startsWith("/post/") || pathname.startsWith("/wallet/withdraw") || pathname.startsWith("/wallet/deposit") || pathname === "/pet-settings") {
    return null
  }

  // Don't show bottom nav for unauthenticated users (except on specific public pages)
  if (!loading && !user) {
    return null
  }

  const isActive = (path: string) => {
    if (path === "/dashboard" && (pathname === "/dashboard" || pathname === "/")) return true
    if (path !== "/dashboard" && pathname.startsWith(path)) return true
    return false
  }

  const handleMapClick = async () => {
    try {
      const locationData = await getCurrentLocationWithName({ useCache: true })
      if (locationData) {
        // Pass location data to map page to zoom to city bounds
        router.push(`/map?lat=${locationData.latitude}&lng=${locationData.longitude}&zoom=city`)
      } else {
        router.push("/map")
      }
    } catch (error) {
      console.error("Error getting location:", error)
      router.push("/map")
    }
  }

  return (
    <div id="bottom-nav" className="fixed bottom-0 left-0 z-50 w-full h-[82px] bg-white/80 backdrop-blur-md dark:bg-gray-900/80 pb-6">
      <div className="relative w-full max-w-md mx-auto h-full">
        <div className="flex items-center justify-between h-full w-full px-8">
          {/* Home icon */}
          <Link
            href="/dashboard"
            className={cn(
              "flex items-center justify-center rounded-xl transition-colors",
              isActive("/dashboard") && "text-primary dark:text-primary",
            )}
          >
            <Home
              className={cn(
                "w-7 h-7 text-gray-500 dark:text-gray-400 transition-colors hover:stroke-emerald-500",
                isActive("/dashboard") && "text-primary dark:text-primary",
              )}
            />
          </Link>

          {/* Map icon */}
          <button
            onClick={handleMapClick}
            className={cn(
              "flex items-center justify-center rounded-xl transition-colors",
              pathname === "/map" && "text-primary dark:text-primary"
            )}
          >
            <Map
              className={cn(
                "w-7 h-7 text-gray-500 dark:text-gray-400 transition-colors hover:stroke-emerald-500",
                pathname === "/map" && "text-primary dark:text-primary",
              )}
            />
          </button>

          {/* New Post button - Center */}
          <div className="flex items-center justify-center">
            <button
              onClick={() => router.push("/post/new")}
              onMouseEnter={() => {
                // Prefetch route on hover for even faster navigation
                router.prefetch("/post/new")
              }}
              onTouchStart={() => {
                // Prefetch route on touch for mobile
                router.prefetch("/post/new")
              }}
              className={cn(
                "flex items-center justify-center w-14 h-14 rounded-full bg-primary hover:bg-primary/90 transition-all duration-200 transform hover:scale-105 shadow-lg",
                pathname === "/post/new" && "bg-primary/90 scale-105",
              )}
              aria-label="New Post"
            >
              <Plus
                className="w-6 h-6 text-white stroke-[2.5]"
              />
            </button>
          </div>

          {/* Wallet icon */}
          <Link
            href="/wallet"
            className={cn(
              "flex items-center justify-center rounded-xl transition-colors",
              isActive("/wallet") && "text-primary dark:text-primary"
            )}
          >
            <Wallet
              className={cn(
                "w-7 h-7 text-gray-500 dark:text-gray-400 transition-colors hover:stroke-emerald-500",
                isActive("/wallet") && "text-primary dark:text-primary",
              )}
            />
          </Link>

          {/* Profile icon */}
          <Link
            href="/profile"
            className={cn(
              "flex items-center justify-center relative rounded-xl transition-colors",
              isActive("/profile") && "text-primary dark:text-primary",
            )}
          >
            <User
              className={cn(
                "w-7 h-7 text-gray-500 dark:text-gray-400 transition-colors hover:stroke-emerald-500",
                isActive("/profile") && "text-primary dark:text-primary",
              )}
            />
            {hasPendingRequests && <span className="absolute top-0 right-0 w-2 h-2 bg-red-500 rounded-full"></span>}
          </Link>
        </div>
      </div>
    </div>
  )
}
