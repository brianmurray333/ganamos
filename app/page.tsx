"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/components/auth-provider"
import { LandingHero } from "@/components/landing-hero"
import { BackgroundImage } from "@/components/background-image"
import { DonationModal } from "@/components/donation-modal"

export default function HomePage() {
  const { user, loading, sessionLoaded } = useAuth()
  const router = useRouter()
  const [showDonationModal, setShowDonationModal] = useState(false)

  // Redirect authenticated users to dashboard
  // Use useEffect to handle redirect after render, once auth state is confirmed
  useEffect(() => {
    // Only redirect once everything is confirmed loaded and user exists
    if (sessionLoaded && !loading && user) {
      router.replace('/dashboard')
    }
  }, [sessionLoaded, loading, user, router])

  // While loading, return null - the GlobalLoadingOverlay handles the spinner
  if (loading || !sessionLoaded) {
    return null
  }

  // If user is authenticated, show brief loading state while redirect happens
  // (should be very brief - useEffect above will navigate)
  if (user) {
    return null // Keep showing loading overlay during redirect
  }

  // Show landing page for unauthenticated users
  return (
    <div className="relative min-h-screen flex flex-col items-center">
      {/* Background Image */}
      <div className="fixed inset-0 z-0">
        <BackgroundImage />
        <div className="absolute inset-0 bg-gradient-to-t from-white/90 dark:from-black/90 via-white/30 dark:via-black/30 to-transparent" />
      </div>

      <div className="w-full max-w-md px-4 z-10 pt-[12vh]">
        <LandingHero />
        <div className="flex flex-col items-center justify-center gap-4 mt-6">
          <a
            href="/map"
            data-testid="earn-bitcoin-link"
            className="inline-flex items-center justify-center gap-2 whitespace-nowrap text-base font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 h-14 rounded-md px-10 w-full max-w-xs bg-green-600 hover:bg-green-700 text-white"
          >
            <div className="scale-75">
              <img
                src="/images/bitcoin-logo.png"
                alt="Bitcoin"
                className="inline-block h-6 w-6 mr-1"
                style={{ verticalAlign: "middle" }}
              />
            </div>
            Earn Bitcoin
          </a>
          <a
            href="/auth/login"
            data-testid="login-link"
            className="inline-flex items-center justify-center gap-2 whitespace-nowrap text-base font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-secondary text-secondary-foreground hover:bg-secondary/80 h-14 rounded-md px-10 w-full max-w-xs"
          >
            Log In
          </a>
          <a
            href="/auth/register"
            data-testid="signup-link"
            className="inline-flex items-center justify-center gap-2 whitespace-nowrap text-base font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-secondary text-secondary-foreground hover:bg-secondary/80 h-14 rounded-md px-10 w-full max-w-xs"
          >
            Sign Up
          </a>
        </div>
        <div className="text-center mt-6">
          <a
            href="/privacy"
            className="text-xs text-gray-400 hover:text-gray-500 hover:underline"
          >
            Privacy
          </a>
        </div>
      </div>

      <DonationModal open={showDonationModal} onOpenChange={setShowDonationModal} />
    </div>
  )
}
