"use client"

import Link from "next/link"
import { PhoneAuthForm } from "@/components/phone-auth-form"

export default function PhoneAuthPage() {
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
          <div className="text-center">
            <p className="text-muted-foreground">Sign in with your phone number</p>
          </div>

          <PhoneAuthForm />

          <div className="text-center">
            <p className="text-sm text-muted-foreground">
              <Link href="/auth/login" className="text-green-600 hover:underline">
                Back to all sign in options
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
