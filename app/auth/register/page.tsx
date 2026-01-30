"use client"

import { useState, useRef, useEffect } from "react"
import type React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useAuth } from "@/components/auth-provider"
import { toast } from "sonner"
import { LoadingSpinner } from "@/components/loading-spinner"

export default function RegisterPage() {
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [showEmailForm, setShowEmailForm] = useState(false)
  const [signupsEnabled, setSignupsEnabled] = useState<boolean | null>(null)
  const emailInputRef = useRef<HTMLInputElement>(null)
  const passwordInputRef = useRef<HTMLInputElement>(null)
  const isSubmittingRef = useRef(false) // Guard against rapid double-clicks
  const { signInWithGoogle, signUpWithEmail } = useAuth()
  const router = useRouter()

  // Check if signups are enabled
  useEffect(() => {
    fetch('/api/system/signups-enabled')
      .then(res => res.json())
      .then(data => setSignupsEnabled(data.enabled))
      .catch(() => setSignupsEnabled(true)) // Default to enabled on error
  }, [])

  const handleGoogleSignIn = async () => {
    if (signupsEnabled === false) {
      toast.error("Signups Disabled", {
        description: "New account registrations are currently disabled. Please try again later.",
      })
      return
    }
    
    setIsLoading(true)
    try {
      await signInWithGoogle()
      // The redirect is handled by Supabase OAuth
    } catch (error) {
      toast.error("Registration failed", {
        description: "There was an error signing up with Google.",
      })
      setIsLoading(false)
    }
  }

  const handleEmailSignUp = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (signupsEnabled === false) {
      toast.error("Signups Disabled", {
        description: "New account registrations are currently disabled. Please try again later.",
      })
      return
    }
    
    // Guard against rapid double-clicks (state updates are async)
    if (isSubmittingRef.current) return
    isSubmittingRef.current = true
    
    setIsLoading(true)

    try {
      await signUpWithEmail(email, password, name)
      // Redirect to confirmation page with email as query parameter
      router.push(`/auth/confirm-email?email=${encodeURIComponent(email)}`)
    } catch (error: any) {
      toast.error("Registration failed", {
        description: error?.message || "There was an error creating your account. Please try again.",
      })
      setIsLoading(false)
      isSubmittingRef.current = false
    }
  }

  // Show loading state while checking signup status
  if (signupsEnabled === null) {
    return (
      <div className="relative min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-blue-50 to-white">
        <div className="text-center">
          <LoadingSpinner />
        </div>
      </div>
    )
  }

  // Show disabled message if signups are disabled
  if (signupsEnabled === false) {
    return (
      <div className="relative min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-blue-50 to-white">
        <div className="w-full max-w-md px-4">
          <div className="bg-white rounded-lg shadow-lg p-8 text-center">
            <h1 className="text-2xl font-bold text-gray-900 mb-4">Signups Temporarily Disabled</h1>
            <p className="text-gray-600 mb-6">
              New account registrations are currently disabled. Please try again later.
            </p>
            <Link href="/auth/login">
              <Button>Return to Login</Button>
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="relative min-h-screen flex flex-col items-center">
      {/* Background Image */}
      <div className="fixed inset-0 z-0">
        <div className="absolute inset-0">
          <img
            src="/images/community-fixing.jpg"
            alt="Person fixing a fence in a community"
            className="w-full h-full object-cover"
          />
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-white/90 dark:from-black/90 via-white/30 dark:via-black/30 to-transparent" />
      </div>

      <div className="w-full max-w-md px-4 z-10 pt-[12vh]">
        <div className="text-center mb-6">
          <h1 className="app-title">Ganamos!</h1>
        </div>

        <div className="bg-white/90 dark:bg-gray-900/90 backdrop-blur-sm p-8 rounded-lg shadow-lg space-y-6">

          {isLoading && !showEmailForm ? (
            <div className="py-8 flex flex-col items-center justify-center">
              <LoadingSpinner size="lg" />
              <p className="mt-4 text-muted-foreground">Creating your account...</p>
            </div>
          ) : showEmailForm ? (
            <form onSubmit={handleEmailSignUp} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  placeholder="Your name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="bg-white/80 dark:bg-gray-800/80"
                  enterKeyHint="next"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault()
                      emailInputRef.current?.focus()
                    }
                  }}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  ref={emailInputRef}
                  id="email"
                  type="email"
                  placeholder="your@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="bg-white/80 dark:bg-gray-800/80"
                  enterKeyHint="next"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault()
                      passwordInputRef.current?.focus()
                    }
                  }}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  ref={passwordInputRef}
                  id="password"
                  type="password"
                  placeholder="Create a password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  className="bg-white/80 dark:bg-gray-800/80"
                  enterKeyHint="go"
                />
                <p className="text-xs text-muted-foreground">Must be at least 8 characters</p>
              </div>

              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? "Creating account..." : "Create account"}
              </Button>

              <div className="text-center">
                <button
                  type="button"
                  onClick={() => setShowEmailForm(false)}
                  className="text-sm text-green-600 hover:underline"
                >
                  Back to all sign up options
                </button>
              </div>
            </form>
          ) : (
            <>
              <div className="space-y-4">
                <Button className="w-full flex items-center justify-center gap-2" onClick={handleGoogleSignIn}>
                  <svg width="20" height="20" viewBox="0 0 24 24">
                    <path
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      fill="#4285F4"
                    />
                    <path
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      fill="#34A853"
                    />
                    <path
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                      fill="#FBBC05"
                    />
                    <path
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                      fill="#EA4335"
                    />
                  </svg>
                  Sign up with Google
                </Button>

                <Button className="w-full" variant="secondary" onClick={() => setShowEmailForm(true)}>
                  Sign up with Email
                </Button>
              </div>
            </>
          )}

          <div className="text-center">
            <p className="text-sm text-muted-foreground">
              Already have an account?{" "}
              <Link href="/auth/login" className="text-green-600 hover:underline">
                Log in
              </Link>
            </p>
          </div>
        </div>
        <div className="text-center mt-6">
          <Link
            href="/privacy"
            className="text-xs text-gray-400 hover:text-gray-500 hover:underline"
          >
            Privacy
          </Link>
        </div>
      </div>
    </div>
  )
}
