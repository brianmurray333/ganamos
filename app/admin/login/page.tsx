"use client"

import { useState, useEffect, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { createBrowserSupabaseClient } from "@/lib/supabase"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Mail, Shield, CheckCircle2, Loader2 } from "lucide-react"

const ADMIN_EMAIL = process.env.NEXT_PUBLIC_ADMIN_EMAIL || "admin@example.com"

function AdminLoginForm() {
  const [email, setEmail] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [magicLinkSent, setMagicLinkSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createBrowserSupabaseClient()

  useEffect(() => {
    const errorParam = searchParams.get("error")
    if (errorParam === "unauthorized") {
      setError("Access denied. Only authorized administrators can access this area.")
    }
  }, [searchParams])

  useEffect(() => {
    // Check if already authenticated as admin
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.user.email === ADMIN_EMAIL) {
        router.push("/admin")
      }
    }
    checkAuth()
  }, [supabase, router])

  const handleMagicLinkLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    // Validate email is the admin email
    if (email.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
      setError("Access denied. Only authorized administrators can access this area.")
      return
    }

    setIsLoading(true)

    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: ADMIN_EMAIL,
        options: {
          emailRedirectTo: `${window.location.origin}/admin`,
          shouldCreateUser: false, // Don't create new users
        },
      })

      if (error) {
        setError(error.message)
        setIsLoading(false)
        return
      }

      setMagicLinkSent(true)
    } catch (err: any) {
      setError(err.message || "An error occurred")
    } finally {
      setIsLoading(false)
    }
  }

  if (magicLinkSent) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center">
            <div className="w-16 h-16 bg-emerald-600/20 rounded-full flex items-center justify-center mx-auto mb-6">
              <CheckCircle2 className="w-8 h-8 text-emerald-400" />
            </div>
            <h1 className="text-2xl font-bold text-white mb-2">Check Your Email</h1>
            <p className="text-gray-400 mb-6">
              We sent a magic link to <span className="text-white font-medium">{ADMIN_EMAIL}</span>
            </p>
            <p className="text-sm text-gray-500">
              Click the link in the email to sign in to the admin dashboard.
            </p>
            <Button
              variant="ghost"
              className="mt-6 text-gray-400 hover:text-white"
              onClick={() => {
                setMagicLinkSent(false)
                setEmail("")
              }}
            >
              Use a different email
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-emerald-600/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <Shield className="w-8 h-8 text-emerald-400" />
          </div>
          <h1 className="text-3xl font-bold text-white">Admin Access</h1>
          <p className="text-gray-400 mt-2">Ganamos Administration Dashboard</p>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-8">
          {error && (
            <Alert variant="destructive" className="mb-6 bg-red-900/20 border-red-800 text-red-400">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <form onSubmit={handleMagicLinkLogin} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-gray-300">Email Address</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                <Input
                  id="email"
                  type="email"
                  placeholder="admin@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={isLoading}
                  className="pl-10 bg-gray-800 border-gray-700 text-white placeholder:text-gray-500 focus:border-emerald-500 focus:ring-emerald-500"
                />
              </div>
            </div>

            <Button
              type="submit"
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white h-12"
              disabled={isLoading || !email.trim()}
            >
              {isLoading ? (
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Sending Magic Link...
                </div>
              ) : (
                "Send Magic Link"
              )}
            </Button>
          </form>

          <p className="text-xs text-gray-500 text-center mt-6">
            Only authorized administrators can access this dashboard.
            <br />
            A magic link will be sent to verify your identity.
          </p>
        </div>
      </div>
    </div>
  )
}

function LoginLoading() {
  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />
        <p className="text-gray-400">Loading...</p>
      </div>
    </div>
  )
}

export default function AdminLoginPage() {
  return (
    <Suspense fallback={<LoginLoading />}>
      <AdminLoginForm />
    </Suspense>
  )
}
