"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

export default function ActivityPage() {
  const router = useRouter()

  useEffect(() => {
    // Redirect to the new profile activity page
    router.push("/profile/activity")
  }, [router])

  return (
    <div className="flex items-center justify-center h-screen">
      <div className="text-center">Redirecting to Profile...</div>
    </div>
  )
}
