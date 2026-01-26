"use client"

import { useState, useEffect, useRef, Suspense } from "react"
import type React from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useAuth } from "@/components/auth-provider"
import { toast } from "sonner"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Mic } from "lucide-react"

function AlexaLoginContent() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const passwordInputRef = useRef<HTMLInputElement>(null)
  const { signInWithEmail, user } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()
  
  // OAuth parameters from Alexa
  const clientId = searchParams.get("client_id")
  const redirectUri = searchParams.get("redirect_uri")
  const state = searchParams.get("state")

  // If user is already logged in, redirect to group selection
  useEffect(() => {
    if (user && clientId && redirectUri) {
      router.push(`/auth/alexa-group-select?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state || ''}`)
    }
  }, [user, clientId, redirectUri, state, router])

  const handleEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    try {
      if (!email.trim() || !password.trim()) {
        toast.error("Login failed", {
          description: "Email and password are required",
        })
        setIsLoading(false)
        return
      }

      const result = await signInWithEmail(email, password)

      if (result?.success) {
        // Redirect to group selection
        router.push(`/auth/alexa-group-select?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri || '')}&state=${state || ''}`)
      } else {
        toast.error("Login failed", {
          description: result?.message || "Please check your credentials and try again.",
        })
        setIsLoading(false)
      }
    } catch (error: any) {
      console.error("Login error:", error)
      toast.error("Login failed", {
        description: error?.message || "An unexpected error occurred. Please try again.",
      })
      setIsLoading(false)
    }
  }

  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center">
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

      <div className="w-full max-w-md px-4 z-10">
        <div className="bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm p-8 rounded-lg shadow-lg space-y-6">
          {/* Header - inside modal */}
          <div className="space-y-2 text-center">
            <div className="flex items-center justify-center gap-3">
              <Mic className="h-10 w-10 text-primary" />
              <h1 className="app-title pb-2.5">Ganamos!</h1>
            </div>
            <p className="text-muted-foreground">Link your account with Alexa</p>
          </div>

          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground bg-primary/10 p-3 rounded-lg">
            <Mic className="h-4 w-4 text-primary" />
            <span>Sign in to use Ganamos with your Alexa device</span>
          </div>

          <form onSubmit={handleEmailSignIn} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isLoading}
                required
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
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLoading}
                required
                enterKeyHint="go"
              />
            </div>
            <Button
              type="submit"
              className="w-full"
              disabled={isLoading}
            >
              {isLoading ? "Signing in..." : "Sign in & Link Alexa"}
            </Button>
          </form>

          <div className="text-center text-sm text-muted-foreground">
            <p>
              Don't have an account?{" "}
              <a
                href={`/auth/register?redirect=/auth/alexa-login?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri || '')}&state=${state || ''}`}
                className="text-primary hover:underline"
              >
                Sign up
              </a>
            </p>
          </div>
          <div className="text-center text-xs text-muted-foreground">
            <p>By signing in, you agree to link your Ganamos account with Amazon Alexa.</p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function AlexaLoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    }>
      <AlexaLoginContent />
    </Suspense>
  )
}


