"use client"

import { useState } from "react"
import type React from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useAuth } from "@/components/auth-provider"
import { useToast } from "@/hooks/use-toast"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { MapPin } from "lucide-react"

export default function LoginPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [showEmailForm, setShowEmailForm] = useState(false)
  const { signInWithGoogle, signInWithEmail, mockLogin } = useAuth()
  const { toast } = useToast()
  const router = useRouter()
  const searchParams = useSearchParams()
  const error = searchParams.get("error")
  const redirect = searchParams.get("redirect") || "/dashboard"

  const handleGoogleSignIn = async () => {
    setIsLoading(true)
    try {
      console.log("Login page - Starting Google sign-in")
      await signInWithGoogle()
      // The redirect is handled by Supabase OAuth
      console.log("Login page - Google sign-in initiated successfully")
    } catch (error: any) {
      console.error("Login page - Google sign-in error:", error)
      toast({
        title: "Login failed",
        description: error?.message || "There was an error signing in with Google.",
        variant: "destructive",
      })
      setIsLoading(false)
    }
  }

  const handleEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    try {
      // Validate inputs
      if (!email.trim() || !password.trim()) {
        toast({
          title: "Login failed",
          description: "Email and password are required",
          variant: "destructive",
        })
        setIsLoading(false)
        return
      }

      const result = await signInWithEmail(email, password)

      if (result?.success) {
        // Redirect to the specified path or dashboard
        router.push(redirect)
      } else {
        toast({
          title: "Login failed",
          description: result?.message || "Please check your credentials and try again.",
          variant: "destructive",
        })
        setIsLoading(false)
      }
    } catch (error: any) {
      console.error("Login error:", error)
      toast({
        title: "Login failed",
        description: error?.message || "An unexpected error occurred. Please try again.",
        variant: "destructive",
      })
      setIsLoading(false)
    }
  }

  const handleMockLogin = async () => {
    setIsLoading(true)
    try {
      await mockLogin()
    } catch (error: any) {
      console.error("Mock login error:", error)
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
        <div className="space-y-4 text-center mb-6">
          <h1 className="app-title pb-2.5">Ganamos!</h1>
        </div>

        <div className="bg-white/90 dark:bg-gray-900/90 backdrop-blur-sm p-8 rounded-lg shadow-lg space-y-6">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{decodeURIComponent(error)}</AlertDescription>
            </Alert>
          )}

          {showEmailForm ? (
            <form onSubmit={handleEmailSignIn} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="your@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={isLoading}
                  className="bg-white/80 dark:bg-gray-800/80"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Password</Label>
                  <Link href="/auth/forgot-password" className="text-sm text-emerald-600 hover:underline">
                    Forgot password?
                  </Link>
                </div>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={isLoading}
                  className="bg-white/80 dark:bg-gray-800/80"
                />
              </div>

              <Button type="submit" className="w-full h-14 px-10" disabled={isLoading || !email.trim() || !password.trim()}>
                {isLoading ? "Signing in..." : "Log in"}
              </Button>

              <div className="text-center">
                <button
                  type="button"
                  onClick={() => setShowEmailForm(false)}
                  disabled={isLoading}
                  className="text-sm text-emerald-600 hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Back to all sign in options
                </button>
              </div>
            </form>
          ) : (
            <>
              <div className="space-y-4">
                <Button
                  className="w-full flex items-center justify-center gap-2 h-14 px-10"
                  variant="outline"
                  onClick={handleGoogleSignIn}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    "Signing in..."
                  ) : (
                    <>
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
                      Sign in with Google
                    </>
                  )}
                </Button>

                <Button
                  className="w-full h-14 px-10"
                  variant="outline"
                  onClick={() => {
                    console.log("Sign in with Email button clicked")
                    console.log("Current showEmailForm state:", showEmailForm)
                    setShowEmailForm(true)
                    console.log("Set showEmailForm to true")
                  }}
                  disabled={isLoading}
                >
                  Sign in with Email
                </Button>
                <Button
                  className="w-full h-14 px-10"
                  variant="outline"
                  onClick={() => router.push("/auth/phone")}
                  disabled={isLoading}
                >
                  Sign in with Phone
                </Button>

                {process.env.NEXT_PUBLIC_POD_URL && (
                  <>
                    <div className="relative">
                      <div className="absolute inset-0 flex items-center">
                        <span className="w-full border-t" />
                      </div>
                      <div className="relative flex justify-center text-xs uppercase">
                        <span className="bg-white/90 dark:bg-gray-900/90 px-2 text-muted-foreground">
                          Development
                        </span>
                      </div>
                    </div>

                    <Button
                      className="w-full h-14 px-10"
                      variant="secondary"
                      onClick={handleMockLogin}
                      disabled={isLoading}
                    >
                      Mock Login (Test User)
                    </Button>
                  </>
                )}
              </div>
            </>
          )}

          {!showEmailForm && (
            <div className="text-center space-y-2 pt-4">
              <p className="text-sm text-muted-foreground">
                Don't have an account?{" "}
                <Link href="/auth/register" className="text-emerald-600 hover:underline">
                  Sign up
                </Link>
              </p>
              <p className="text-sm">
                <Link
                  href="/map"
                  className="inline-flex items-center gap-1.5 text-gray-400 hover:text-gray-500 hover:underline"
                >
                  <MapPin size={14} />
                  Or view map
                </Link>
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
