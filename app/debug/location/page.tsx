"use client"

import { LocationDebug } from "@/components/location-debug"
import { LocationSettings } from "@/components/location-settings"

export default function LocationDebugPage() {
  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Location Debug Page</h1>
      <p className="mb-4">
        This page helps diagnose geolocation issues. Try the different options below to test geolocation functionality.
      </p>

      <div className="grid gap-6 md:grid-cols-2">
        <LocationSettings />
        <LocationDebug />
      </div>

      <div className="mt-8 p-4 bg-blue-50 dark:bg-blue-950/30 rounded-lg">
        <h2 className="text-lg font-semibold mb-2 text-blue-900 dark:text-blue-100">Troubleshooting Tips</h2>
        <ul className="list-disc pl-5 space-y-2 text-blue-800 dark:text-blue-200">
          <li>Make sure location permissions are enabled in your browser</li>
          <li>Some preview environments (like Vercel previews) may have limited geolocation support</li>
          <li>Try using low accuracy mode if high accuracy fails</li>
          <li>Check if you're using HTTPS (required for geolocation in most browsers)</li>
          <li>Try a different browser if issues persist</li>
        </ul>
      </div>
    </div>
  )
}
