"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

export default function ExplorePage() {
  const router = useRouter()

  useEffect(() => {
    // Redirect to dashboard since Explore is now merged with Home
    router.push("/dashboard")
  }, [router])

  return (
    <div className="flex items-center justify-center h-screen">
      <div className="text-center">Redirecting to Home...</div>
    </div>
  )
}
