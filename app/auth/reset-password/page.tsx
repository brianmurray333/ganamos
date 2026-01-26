"use client"

import { useState, useEffect, Suspense, useRef } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { createBrowserSupabaseClient } from "@/lib/supabase"
import { toast } from "sonner"
import { KeyRound, CheckCircle2, AlertCircle, Loader2, Eye, EyeOff } from "lucide-react"

function ResetPasswordContent() {
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [isExchangingCode, setIsExchangingCode] = useState(true)
  const [isReady, setIsReady] = useState(false)
  const [resetComplete, setResetComplete] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  
  // Prevent double execution of code exchange (React StrictMode, component re-mounts, etc.)
  const codeExchangeAttempted = useRef(false)
  
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createBrowserSupabaseClient()

  useEffect(() => {
    // Prevent double execution (React StrictMode, component re-mounts, etc.)
    if (codeExchangeAttempted.current) {
      console.log("Reset password - Code exchange already attempted, skipping")
      return
    }
    
    const handlePasswordRecovery = async () => {
      try {
        // FIRST: Check if we already have a valid session
        // This handles the case where auth-provider already processed the recovery
        // and redirected us here with an active session
        const { data: { session: existingSession } } = await supabase.auth.getSession()
        if (existingSession) {
          console.log("Reset password - Found existing session, proceeding directly", {
            email: existingSession.user?.email,
          })
          setIsReady(true)
          setIsExchangingCode(false)
          return
        }
        
        // Check for code in URL (PKCE flow)
        const code = searchParams.get("code")
        
        if (code) {
          // Mark as attempted BEFORE the async call to prevent race conditions
          codeExchangeAttempted.current = true
          
          console.log("Reset password - Found code, exchanging for session")
          const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
          
          if (exchangeError) {
            console.error("Reset password - Error exchanging code:", exchangeError)
            
            // Check if user already has a valid session (code might have been used by another tab/render)
            const { data: { session } } = await supabase.auth.getSession()
            if (session) {
              console.log("Reset password - Found existing session despite error, proceeding")
              setIsReady(true)
              setIsExchangingCode(false)
              return
            }
            
            // Check for PKCE error (code verifier missing - happens when clicking link in different browser)
            const errorMessage = exchangeError.message?.toLowerCase() || ""
            if (errorMessage.includes("code verifier") || errorMessage.includes("pkce")) {
              setError("This reset link must be opened in the same browser where you requested it. Please request a new reset link and click it in the same browser.")
              setIsExchangingCode(false)
              return
            }
            
            setError("This reset link has expired or is invalid. Please request a new one.")
            setIsExchangingCode(false)
            return
          }
          
          console.log("Reset password - Session established for:", data.session?.user?.email)
          setIsReady(true)
          setIsExchangingCode(false)
          return
        }

        // Check for hash fragment (implicit flow - older Supabase)
        // This handles #access_token=...&type=recovery
        if (typeof window !== "undefined" && window.location.hash) {
          const hashParams = new URLSearchParams(window.location.hash.substring(1))
          const type = hashParams.get("type")
          const accessToken = hashParams.get("access_token")
          
          if (type === "recovery" && accessToken) {
            codeExchangeAttempted.current = true
            console.log("Reset password - Recovery type detected in hash with access token")
            
            // Set the session using the access token from the hash
            const refreshToken = hashParams.get("refresh_token") || ""
            const { error: sessionError } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            })
            
            if (sessionError) {
              console.error("Reset password - Error setting session from hash:", sessionError)
              setError("This reset link has expired or is invalid. Please request a new one.")
              setIsExchangingCode(false)
              return
            }
            
            // Clear the hash from URL for cleaner UX
            window.history.replaceState(null, "", window.location.pathname)
            
            setIsReady(true)
            setIsExchangingCode(false)
            return
          }
        }

        // Check if we already have a session (user might have been redirected)
        const { data: { session } } = await supabase.auth.getSession()
        if (session) {
          // Check if this looks like a recovery session
          // (user just got here from a password reset link)
          setIsReady(true)
          setIsExchangingCode(false)
          return
        }

        // No valid code or session found
        setError("No valid reset link found. Please request a new password reset.")
        setIsExchangingCode(false)
      } catch (err: any) {
        console.error("Reset password - Error:", err)
        setError(err?.message || "An error occurred. Please try again.")
        setIsExchangingCode(false)
      }
    }

    handlePasswordRecovery()
  }, [searchParams, supabase])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (password.length < 6) {
      toast.error("Password must be at least 6 characters")
      return
    }

    if (password !== confirmPassword) {
      toast.error("Passwords do not match")
      return
    }

    setIsLoading(true)

    try {
      console.log('[RESET-PWD] Starting password update...')
      const { error } = await supabase.auth.updateUser({
        password: password,
      })

      if (error) {
        console.log('[RESET-PWD] Password update failed:', error.message)
        toast.error("Error", {
          description: error.message,
        })
        return
      }

      console.log('[RESET-PWD] Password updated successfully')
      
      // DEBUG: Check session state after password update
      const { data: { session } } = await supabase.auth.getSession()
      console.log('[RESET-PWD] Session after password update:', {
        hasSession: !!session,
        userId: session?.user?.id,
        userEmail: session?.user?.email,
      })

      setResetComplete(true)
      toast.success("Password updated!", {
        description: "Your password has been successfully changed.",
      })

      // Redirect to dashboard after a short delay
      console.log('[RESET-PWD] Will navigate to dashboard in 2 seconds...')
      setTimeout(() => {
        console.log('[RESET-PWD] Now navigating to /dashboard')
        router.push("/dashboard")
      }, 2000)
    } catch (error: any) {
      toast.error("Error", {
        description: error?.message || "Failed to update password",
      })
    } finally {
      setIsLoading(false)
    }
  }

  // Loading state while exchanging code
  if (isExchangingCode) {
    return (
      <div className="relative min-h-screen flex flex-col items-center justify-center">
        {/* Background Image */}
        <div className="fixed inset-0 z-0">
          <div className="absolute inset-0">
            <img
              src="/images/community-fixing.jpg"
              alt="Community background"
              className="w-full h-full object-cover"
            />
          </div>
          <div className="absolute inset-0 bg-gradient-to-t from-white/90 dark:from-black/90 via-white/30 dark:via-black/30 to-transparent" />
        </div>

        <div className="w-full max-w-md px-4 z-10">
          <div className="space-y-4 text-center mb-6">
            <h1 className="app-title pb-2.5">Ganamos!</h1>
          </div>

          <div className="bg-white/90 dark:bg-gray-900/90 backdrop-blur-sm p-8 rounded-lg shadow-lg">
            <div className="text-center space-y-4">
              <Loader2 className="w-10 h-10 text-green-600 animate-spin mx-auto" />
              <p className="text-gray-600 dark:text-gray-400">Verifying your reset link...</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className="relative min-h-screen flex flex-col items-center justify-center">
        {/* Background Image */}
        <div className="fixed inset-0 z-0">
          <div className="absolute inset-0">
            <img
              src="/images/community-fixing.jpg"
              alt="Community background"
              className="w-full h-full object-cover"
            />
          </div>
          <div className="absolute inset-0 bg-gradient-to-t from-white/90 dark:from-black/90 via-white/30 dark:via-black/30 to-transparent" />
        </div>

        <div className="w-full max-w-md px-4 z-10">
          <div className="space-y-4 text-center mb-6">
            <h1 className="app-title pb-2.5">Ganamos!</h1>
          </div>

          <div className="bg-white/90 dark:bg-gray-900/90 backdrop-blur-sm p-8 rounded-lg shadow-lg space-y-6">
            <div className="text-center space-y-4">
              <div className="mx-auto w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center">
                <AlertCircle className="w-8 h-8 text-red-600" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Link expired</h2>
              <p className="text-gray-600 dark:text-gray-400">{error}</p>
            </div>

            <Link href="/auth/forgot-password" className="block">
              <Button className="w-full bg-green-600 hover:bg-green-700 text-white">
                Request new reset link
              </Button>
            </Link>

            <div className="text-center">
              <Link 
                href="/auth/login" 
                className="text-sm text-green-600 hover:underline"
              >
                Back to login
              </Link>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Success state
  if (resetComplete) {
    return (
      <div className="relative min-h-screen flex flex-col items-center justify-center">
        {/* Background Image */}
        <div className="fixed inset-0 z-0">
          <div className="absolute inset-0">
            <img
              src="/images/community-fixing.jpg"
              alt="Community background"
              className="w-full h-full object-cover"
            />
          </div>
          <div className="absolute inset-0 bg-gradient-to-t from-white/90 dark:from-black/90 via-white/30 dark:via-black/30 to-transparent" />
        </div>

        <div className="w-full max-w-md px-4 z-10">
          <div className="space-y-4 text-center mb-6">
            <h1 className="app-title pb-2.5">Ganamos!</h1>
          </div>

          <div className="bg-white/90 dark:bg-gray-900/90 backdrop-blur-sm p-8 rounded-lg shadow-lg space-y-6">
            <div className="text-center space-y-4">
              <div className="mx-auto w-16 h-16 bg-emerald-100 dark:bg-emerald-900/30 rounded-full flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8 text-green-600" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Password updated!</h2>
              <p className="text-gray-600 dark:text-gray-400">
                Your password has been successfully changed. Redirecting you to the dashboard...
              </p>
            </div>

            <Link href="/dashboard" className="block">
              <Button className="w-full bg-green-600 hover:bg-green-700 text-white">
                Go to dashboard
              </Button>
            </Link>
          </div>
        </div>
      </div>
    )
  }

  // Password reset form
  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center">
      {/* Background Image */}
      <div className="fixed inset-0 z-0">
        <div className="absolute inset-0">
          <img
            src="/images/community-fixing.jpg"
            alt="Community background"
            className="w-full h-full object-cover"
          />
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-white/90 dark:from-black/90 via-white/30 dark:via-black/30 to-transparent" />
      </div>

      <div className="w-full max-w-md px-4 z-10">
        <div className="space-y-4 text-center mb-6">
          <h1 className="app-title pb-2.5">Ganamos!</h1>
        </div>

        <div className="bg-white/90 dark:bg-gray-900/90 backdrop-blur-sm p-8 rounded-lg shadow-lg space-y-6">
          <div className="text-center space-y-2">
            <div className="mx-auto w-16 h-16 bg-emerald-100 dark:bg-emerald-900/30 rounded-full flex items-center justify-center mb-4">
              <KeyRound className="w-8 h-8 text-green-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Set new password</h2>
            <p className="text-gray-600 dark:text-gray-400">
              Enter your new password below.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">New password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={isLoading}
                  className="bg-white/80 dark:bg-gray-800/80 pr-10"
                  minLength={6}
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-xs text-gray-500">Must be at least 6 characters</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm new password</Label>
              <div className="relative">
                <Input
                  id="confirmPassword"
                  type={showConfirmPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  disabled={isLoading}
                  className="bg-white/80 dark:bg-gray-800/80 pr-10"
                  minLength={6}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                >
                  {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              className="w-full bg-green-600 hover:bg-green-700 text-white"
              disabled={isLoading || !password || !confirmPassword}
            >
              {isLoading ? (
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Updating...
                </div>
              ) : (
                "Update password"
              )}
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <div className="relative min-h-screen flex flex-col items-center justify-center">
        {/* Background Image */}
        <div className="fixed inset-0 z-0">
          <div className="absolute inset-0">
            <img
              src="/images/community-fixing.jpg"
              alt="Community background"
              className="w-full h-full object-cover"
            />
          </div>
          <div className="absolute inset-0 bg-gradient-to-t from-white/90 dark:from-black/90 via-white/30 dark:via-black/30 to-transparent" />
        </div>

        <div className="w-full max-w-md px-4 z-10">
          <div className="space-y-4 text-center mb-6">
            <h1 className="app-title pb-2.5">Ganamos!</h1>
          </div>

          <div className="bg-white/90 dark:bg-gray-900/90 backdrop-blur-sm p-8 rounded-lg shadow-lg">
            <div className="text-center space-y-4">
              <Loader2 className="w-10 h-10 text-green-600 animate-spin mx-auto" />
              <p className="text-gray-600 dark:text-gray-400">Loading...</p>
            </div>
          </div>
        </div>
      </div>
    }>
      <ResetPasswordContent />
    </Suspense>
  )
}
