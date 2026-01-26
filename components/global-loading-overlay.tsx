"use client"

import { useAuth } from "@/components/auth-provider"
import { usePathname } from "next/navigation"
import { useState, useEffect } from "react"
import { Loader2 } from "lucide-react"

export function GlobalLoadingOverlay() {
  const { loading, sessionLoaded } = useAuth()
  const pathname = usePathname()
  const [minTimeElapsed, setMinTimeElapsed] = useState(false)
  const [authTimeout, setAuthTimeout] = useState(false)

  useEffect(() => {
    // Minimum spinner display time for better UX
    const minTimeId = setTimeout(() => {
      setMinTimeElapsed(true)
    }, 500)

    // Timeout to prevent infinite loading
    const timeoutId = setTimeout(() => {
      setAuthTimeout(true)
    }, 3000)

    return () => {
      clearTimeout(minTimeId)
      clearTimeout(timeoutId)
    }
  }, [])

  // Don't show loading overlay on public pages that handle their own loading
  const isPublicPage = pathname === "/map" || pathname?.startsWith("/auth/")

  // Show loading while auth state is being determined
  const isLoading = (loading || !sessionLoaded) && !authTimeout
  const showSpinner = (isLoading || !minTimeElapsed) && !authTimeout && !isPublicPage

  if (!showSpinner) {
    return null
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background">
      <Loader2 className="h-10 w-10 animate-spin text-primary" />
    </div>
  )
}

