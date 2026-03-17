"use client"

import Link from "next/link"
import { AlertTriangle, Mail } from "lucide-react"

export default function SuspendedPage() {
  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="mx-auto w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center">
          <AlertTriangle className="w-8 h-8 text-red-400" />
        </div>
        
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-white">Account Suspended</h1>
          <p className="text-gray-400">
            Your account has been suspended due to a policy violation or security concern.
          </p>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 text-left">
          <h2 className="text-sm font-medium text-gray-300 mb-2">What you can do:</h2>
          <ul className="text-sm text-gray-400 space-y-2">
            <li className="flex items-start gap-2">
              <span className="text-gray-500 mt-0.5">•</span>
              <span>If you believe this is an error, please contact support</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-gray-500 mt-0.5">•</span>
              <span>Do not create new accounts to circumvent this suspension</span>
            </li>
          </ul>
        </div>

        <div className="flex flex-col gap-3">
          <a
            href="mailto:support@ganamos.earth?subject=Account%20Suspension%20Appeal"
            className="inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 px-4 rounded-lg transition-colors"
          >
            <Mail className="w-4 h-4" />
            Contact Support
          </a>
          
          <Link
            href="/"
            className="text-sm text-gray-500 hover:text-gray-400 transition-colors"
          >
            Return to Home
          </Link>
        </div>
      </div>
    </div>
  )
}

