"use client"

import { useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { createBrowserSupabaseClient } from "@/lib/supabase"
import { toast } from "sonner"
import { ArrowLeft, Mail, CheckCircle2 } from "lucide-react"

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [emailSent, setEmailSent] = useState(false)
  const supabase = createBrowserSupabaseClient()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!email.trim()) {
      toast.error("Please enter your email address")
      return
    }

    setIsLoading(true)

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/reset-password`,
      })

      if (error) {
        toast.error("Error", {
          description: error.message,
        })
        return
      }

      setEmailSent(true)
      toast.success("Reset link sent!", {
        description: "Check your email for the password reset link.",
      })
    } catch (error: any) {
      toast.error("Error", {
        description: error?.message || "Failed to send reset email",
      })
    } finally {
      setIsLoading(false)
    }
  }

  if (emailSent) {
    return (
      <div className="relative min-h-screen flex flex-col items-center">
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

        <div className="w-full max-w-md px-4 z-10 pt-[12vh]">
          <div className="text-center mb-6">
            <h1 className="app-title">Ganamos!</h1>
          </div>

          <div className="bg-white/90 dark:bg-gray-900/90 backdrop-blur-sm p-8 rounded-lg shadow-lg space-y-6">
            <div className="text-center space-y-4">
              <div className="mx-auto w-16 h-16 bg-emerald-100 dark:bg-emerald-900/30 rounded-full flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8 text-green-600" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Check your email</h2>
              <p className="text-gray-600 dark:text-gray-400">
                We've sent a password reset link to <span className="font-medium text-gray-900 dark:text-white">{email}</span>
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-500">
                The link will expire in 1 hour. If you don't see the email, check your spam folder.
              </p>
            </div>

            <div className="space-y-3">
              <Button
                variant="outline"
                className="w-full"
                onClick={() => setEmailSent(false)}
              >
                Try a different email
              </Button>
              
              <Link href="/auth/login" className="block">
                <Button variant="ghost" className="w-full">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back to login
                </Button>
              </Link>
            </div>
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
            alt="Community background"
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
          <div className="text-center space-y-2">
            <div className="mx-auto w-16 h-16 bg-emerald-100 dark:bg-emerald-900/30 rounded-full flex items-center justify-center mb-4">
              <Mail className="w-8 h-8 text-green-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Forgot your password?</h2>
            <p className="text-gray-600 dark:text-gray-400">
              No worries! Enter your email and we'll send you a reset link.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email address</Label>
              <Input
                id="email"
                type="email"
                placeholder="your@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={isLoading}
                className="bg-white/80 dark:bg-gray-800/80"
                autoFocus
              />
            </div>

            <Button
              type="submit"
              className="w-full bg-green-600 hover:bg-green-700 text-white"
              disabled={isLoading || !email.trim()}
            >
              {isLoading ? (
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Sending...
                </div>
              ) : (
                "Send reset link"
              )}
            </Button>
          </form>

          <div className="text-center">
            <Link 
              href="/auth/login" 
              className="text-sm text-green-600 hover:underline inline-flex items-center gap-1"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to login
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
