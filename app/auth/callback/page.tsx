"use client"

import { useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { createBrowserSupabaseClient } from "@/lib/supabase"
import { LoadingSpinner } from "@/components/loading-spinner"

export default function AuthCallbackPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createBrowserSupabaseClient()
  const [status, setStatus] = useState<"processing" | "success" | "error">("processing")

  useEffect(() => {
    const handleCallback = async () => {
      try {
        // Get the code from the URL
        const code = searchParams.get("code")
        const error = searchParams.get("error")

        console.log("Auth callback - Code present:", !!code)
        console.log("Auth callback - Error present:", !!error, error ? `Error: ${error}` : "")
        console.log("Auth callback - Full URL:", window.location.href)

        // Get the redirect path - check localStorage first (for OAuth flows), then URL params
        let redirect: string | null = null
        if (typeof window !== 'undefined') {
          redirect = localStorage.getItem('auth_redirect')
          if (redirect) {
            console.log("Auth callback - Found redirect in localStorage:", redirect)
            localStorage.removeItem('auth_redirect') // Clean up after use
          }
        }
        // Fall back to URL param if localStorage was empty
        if (!redirect) {
          redirect = searchParams.get("redirect")
          if (redirect) {
            console.log("Auth callback - Found redirect in URL params:", redirect)
          }
        }
        // Default to dashboard if no redirect found
        redirect = redirect || "/dashboard"
        console.log("Auth callback - Final redirect destination:", redirect)

        if (code) {
          // Exchange the code for a session
          console.log("Auth callback - Exchanging code for session")
          const { data, error } = await supabase.auth.exchangeCodeForSession(code)

          if (error) {
            console.error("Error exchanging code for session:", error)
            setStatus("error")
            router.push(`/auth/login?error=${encodeURIComponent(error.message)}`)
            return
          }

          console.log("Auth callback - Session exchange successful")
          console.log("Auth callback - User authenticated:", data.session?.user?.email)
          console.log(
            "Auth callback - Session expiry:",
            data.session ? new Date(data.session.expires_at! * 1000).toISOString() : "No session",
          )

          // Check for pending anonymous rewards and claim them
          if (typeof window !== 'undefined' && data.session?.user) {
            const pendingRewardPost = localStorage.getItem('pending_anonymous_reward_post')
            
            if (pendingRewardPost) {
              console.log("Found pending anonymous reward for post:", pendingRewardPost)
              
              try {
                // Import and call the claim action
                const { claimAnonymousRewardAction } = await import('@/app/actions/post-actions')
                const result = await claimAnonymousRewardAction(pendingRewardPost, data.session.user.id)
                
                if (result.success) {
                  console.log("Successfully claimed anonymous reward!")
                  // Clear the pending reward from localStorage
                  localStorage.removeItem('pending_anonymous_reward_post')
                  localStorage.removeItem('pending_anonymous_reward_amount')
                } else {
                  console.error("Failed to claim anonymous reward:", result.error)
                }
              } catch (error) {
                console.error("Error claiming anonymous reward:", error)
              }
            }
          }

          setStatus("success")
          
          // Wait for auth state to fully propagate before redirecting
          // This prevents the race condition where AuthProvider hasn't updated yet
          await new Promise(resolve => setTimeout(resolve, 500))
          
          // Verify session is actually set before redirecting
          const { data: verifySession } = await supabase.auth.getSession()
          if (!verifySession.session) {
            console.warn("Session not propagated yet, waiting longer...")
            await new Promise(resolve => setTimeout(resolve, 500))
          }

          // Redirect to the specified path or dashboard
          router.push(redirect)
        } else {
          // No code found, redirect to login
          console.log("Auth callback - No code found, redirecting to login")
          router.push("/auth/login")
        }
      } catch (error: any) {
        console.error("Authentication error:", error)
        setStatus("error")
        router.push(`/auth/login?error=${encodeURIComponent(error.message || "Authentication failed")}`)
      }
    }

    handleCallback()
  }, [router, searchParams, supabase])

  return (
    <div className="flex flex-col items-center justify-center h-screen">
      <LoadingSpinner 
        message={
          status === "processing" ? "Completing login..." :
          status === "success" ? "Redirecting..." :
          "Redirecting to login..."
        } 
      />
    </div>
  )
}
