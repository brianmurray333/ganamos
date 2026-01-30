"use client"

import { useSearchParams } from "next/navigation"
import Link from "next/link"
import { Suspense } from "react"
import { Button } from "@/components/ui/button"
import { Mail, CheckCircle } from "lucide-react"
import { LoadingSpinner } from "@/components/loading-spinner"

function ConfirmEmailContent() {
  const searchParams = useSearchParams()
  const email = searchParams.get("email")

  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-blue-50 to-white dark:from-gray-900 dark:to-gray-800">
      {/* Background Image */}
      <div className="fixed inset-0 z-0">
        <div className="absolute inset-0">
          <img
            src="/images/community-fixing.jpg"
            alt="Person fixing a fence in a community"
            className="w-full h-full object-cover opacity-30"
          />
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-white/90 dark:from-black/90 via-white/50 dark:via-black/50 to-transparent" />
      </div>

      <div className="w-full max-w-md px-4 z-10">
        <div className="bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm p-8 rounded-lg shadow-xl space-y-6 text-center">
          {/* Success Icon */}
          <div className="flex justify-center">
            <div className="relative">
              <div className="absolute inset-0 bg-green-100 dark:bg-green-900/30 rounded-full blur-xl"></div>
              <div className="relative bg-green-50 dark:bg-green-900/20 p-4 rounded-full">
                <CheckCircle className="h-16 w-16 text-green-600 dark:text-green-400" />
              </div>
            </div>
          </div>

          {/* Title */}
          <div className="space-y-2">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
              Check Your Email
            </h1>
            <p className="text-lg text-muted-foreground">
              We sent a confirmation link to
            </p>
            {email && (
              <p className="text-lg font-semibold text-gray-900 dark:text-white break-all">
                {email}
              </p>
            )}
          </div>

          {/* Instructions */}
          <div className="space-y-4 text-left bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg border border-blue-200 dark:border-blue-800">
            <div className="flex items-start gap-3">
              <Mail className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
              <div className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
                <p className="font-medium">Next steps:</p>
                <ol className="list-decimal list-inside space-y-1 ml-2">
                  <li>Check your inbox for an email from Ganamos</li>
                  <li>Click the confirmation link in the email</li>
                  <li>You'll be redirected back and can start using your account</li>
                </ol>
              </div>
            </div>
          </div>

          {/* Help Text */}
          <div className="space-y-3 text-sm text-muted-foreground">
            <p>
              Didn't receive the email? Check your spam folder or{" "}
              <Link
                href="/auth/register"
                className="text-green-600 hover:underline font-medium"
              >
                try signing up again
              </Link>
              .
            </p>
          </div>

          {/* Action Buttons */}
          <div className="space-y-3 pt-4">
            <Link href="/auth/login" className="block">
              <Button className="w-full" size="lg">
                Go to Login
              </Button>
            </Link>
            
            <Link href="/" className="block">
              <Button variant="ghost" className="w-full">
                Return to Home
              </Button>
            </Link>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center mt-6">
          <p className="text-sm text-muted-foreground">
            Need help?{" "}
            <Link
              href="/privacy"
              className="text-green-600 hover:underline"
            >
              Contact Support
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}

export default function ConfirmEmailPage() {
  return (
    <Suspense
      fallback={
        <div className="relative min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-blue-50 to-white dark:from-gray-900 dark:to-gray-800">
          <LoadingSpinner />
        </div>
      }
    >
      <ConfirmEmailContent />
    </Suspense>
  )
}
