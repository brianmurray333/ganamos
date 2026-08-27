"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/components/auth-provider"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ArrowLeft } from "lucide-react"
import { SignetWalletTab } from "@/components/signet-wallet-tab-v2"

export default function SignetRoutePage() {
  const router = useRouter()
  const { user, loading } = useAuth()
  const [authorized, setAuthorized] = useState(false)

  useEffect(() => {
    if (loading) return
    const ok = !!user && user.email?.toLowerCase() === "brianmurray03@gmail.com"
    setAuthorized(ok)
  }, [user, loading])

  if (loading) {
    return <div className="container max-w-md mx-auto pt-6 px-4">Loading…</div>
  }

  if (!authorized) {
    return (
      <div className="container max-w-md mx-auto pt-6 px-4">
        <Card>
          <CardContent className="p-6 space-y-4">
            <div className="text-base font-medium">Access denied</div>
            <p className="text-sm text-muted-foreground">
              This practice wallet is limited to a single test account.
            </p>
            <Button variant="outline" onClick={() => router.push("/wallet")}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Wallet
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="container max-w-md mx-auto pt-6 px-4">
      <div className="mb-4">
        <Button variant="ghost" size="sm" onClick={() => router.push("/wallet")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Wallet
        </Button>
      </div>
      <SignetWalletTab />
    </div>
  )
}

