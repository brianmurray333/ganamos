"use client"

import { useEffect, useState } from "react"
import { redirect } from "next/navigation"
import { useAuth } from "@/components/auth-provider"
import { LandingHero } from "@/components/landing-hero"
import { BackgroundImage } from "@/components/background-image"
import { DonationModal } from "@/components/donation-modal"

export default function HomePage() {
  const { user, loading, sessionLoaded } = useAuth()
  const [showDonationModal, setShowDonationModal] = useState(false)
  const [authTimeout, setAuthTimeout] = useState(false)

  useEffect(() => {
    // Set a timeout to prevent infinite loading
    const timeoutId = setTimeout(() => {
      console.log("Auth timeout reached, showing fallback")
      setAuthTimeout(true)
    }, 3000) // 3 second timeout

    return () => clearTimeout(timeoutId)
  }, [])

  // Show loading while auth state is being determined (but with timeout)
  if ((loading || !sessionLoaded) && !authTimeout) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-white">
        <div className="w-16 h-16 border-4 border-green-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  // If auth timed out, show the landing page anyway
  if (authTimeout && !sessionLoaded) {
    console.log("Showing landing page due to auth timeout")
    return (
      <div className="relative min-h-screen">
        {/* Background Image */}
        <div className="fixed inset-0 z-0">
          <BackgroundImage />
          <div className="absolute inset-0 bg-gradient-to-t from-white/90 dark:from-black/90 via-white/30 dark:via-black/30 to-transparent" />
        </div>

        <div className="container relative z-10 px-4 py-8 mx-auto">
          <LandingHero />
          <div className="flex flex-col items-center justify-center gap-4 mt-8">
            <a
              href="/map"
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
              className="inline-flex items-center justify-center gap-2 whitespace-nowrap text-base font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-secondary text-secondary-foreground hover:bg-secondary/80 h-14 rounded-md px-10 w-full max-w-xs"
            >
              Log In
            </a>
            <a
              href="/auth/register"
              className="inline-flex items-center justify-center gap-2 whitespace-nowrap text-base font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-secondary text-secondary-foreground hover:bg-secondary/80 h-14 rounded-md px-10 w-full max-w-xs"
            >
              Sign Up
            </a>
          </div>
        </div>

        <DonationModal open={showDonationModal} onOpenChange={setShowDonationModal} />
      </div>
    )
  }

  // If user is authenticated, redirect to dashboard
  if (user) {
    redirect('/dashboard')
  }

  // Show landing page for unauthenticated users
  return (
    <div className="relative min-h-screen">
      {/* Background Image */}
      <div className="fixed inset-0 z-0">
        <BackgroundImage />
        <div className="absolute inset-0 bg-gradient-to-t from-white/90 dark:from-black/90 via-white/30 dark:via-black/30 to-transparent" />
      </div>

      <div className="container relative z-10 px-4 py-8 mx-auto">
        <LandingHero />
        <div className="flex flex-col items-center justify-center gap-4 mt-8">
          <a
            href="/map"
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
            className="inline-flex items-center justify-center gap-2 whitespace-nowrap text-base font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-secondary text-secondary-foreground hover:bg-secondary/80 h-14 rounded-md px-10 w-full max-w-xs"
          >
            Log In
          </a>
          <a
            href="/auth/register"
            className="inline-flex items-center justify-center gap-2 whitespace-nowrap text-base font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-secondary text-secondary-foreground hover:bg-secondary/80 h-14 rounded-md px-10 w-full max-w-xs"
          >
            Sign Up
          </a>
        </div>
      </div>

      <DonationModal open={showDonationModal} onOpenChange={setShowDonationModal} />
    </div>
  )
}
