"use client"

import Link from "next/link"
import { PhoneAuthForm } from "@/components/phone-auth-form"

export default function PhoneAuthPage() {
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
        <div className="bg-white/90 dark:bg-gray-900/90 backdrop-blur-sm p-8 rounded-lg shadow-lg space-y-6">
          <div className="space-y-4 text-center">
            <h1 className="app-title">Ganamos!</h1>
            <p className="text-muted-foreground">Sign in with your phone number</p>
          </div>

          <PhoneAuthForm />

          <div className="text-center">
            <p className="text-sm text-muted-foreground">
              <Link href="/auth/login" className="text-emerald-600 hover:underline">
                Back to all sign in options
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
