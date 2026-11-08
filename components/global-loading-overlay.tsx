"use client"

import { useAuth } from "@/components/auth-provider"
import { usePathname } from "next/navigation"
import { useState, useEffect } from "react"

// Home renders its own skeleton layout while auth resolves, so it never gets
// the full-screen spinner (it's also the PWA launch screen).
const PAGES_WITH_OWN_LOADING = ["/"]
import { Loader2 } from "lucide-react"

export function GlobalLoadingOverlay() {
  const { loading, sessionLoaded } = useAuth()
  const pathname = usePathname()
  const [authTimeout, setAuthTimeout] = useState(false)

  useEffect(() => {
    // Timeout to prevent infinite loading
    const timeoutId = setTimeout(() => {
      setAuthTimeout(true)
    }, 3000)

    return () => {
      clearTimeout(timeoutId)
    }
  }, [])

  // Don't show loading overlay on pages that handle their own loading
  const isPublicPage =
    PAGES_WITH_OWN_LOADING.includes(pathname ?? "") ||
    pathname === "/map" ||
    pathname?.startsWith("/auth/") ||
    pathname?.startsWith("/admin")

  // Show loading while auth state is being determined
  const isLoading = (loading || !sessionLoaded) && !authTimeout
  const showSpinner = isLoading && !authTimeout && !isPublicPage

  if (!showSpinner) {
    return null
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background">
      <Loader2 className="h-10 w-10 animate-spin text-primary" />
    </div>
  )
}

