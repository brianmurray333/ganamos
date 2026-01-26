"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { BitcoinLogo } from "@/components/bitcoin-logo"
import { formatSatsValue } from "@/lib/utils"
import { AlertCircle } from "lucide-react"
import { useRouter } from "next/navigation"

interface AnonymousFixSubmissionModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  postId: string
  rewardAmount: number
  onLightningAddressSubmitted: () => void
  onAccountCreationRequested: () => void
}

export function AnonymousFixSubmissionModal({
  open,
  onOpenChange,
  postId,
  rewardAmount,
  onLightningAddressSubmitted,
  onAccountCreationRequested,
}: AnonymousFixSubmissionModalProps) {
  const [lightningAddress, setLightningAddress] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState("")
  const router = useRouter()

  const validateLightningAddress = (address: string): boolean => {
    const trimmed = address.trim().toLowerCase()

    // Support Lightning invoices (lnbc, lntb, lnbcrt)
    if (
      trimmed.startsWith("lnbc") ||
      trimmed.startsWith("lntb") ||
      trimmed.startsWith("lnbcrt")
    ) {
      return trimmed.length >= 100
    }

    // Support Lightning addresses (format: user@domain.com)
    if (trimmed.includes("@") && trimmed.includes(".")) {
      const [user, domain] = trimmed.split("@")
      return user.length > 0 && domain.length > 0 && domain.includes(".")
    }

    return false
  }

  const handleSubmitLightningAddress = async () => {
    setError("")

    if (!lightningAddress.trim()) {
      setError("Please enter a Lightning invoice or address")
      return
    }

    if (!validateLightningAddress(lightningAddress)) {
      setError("Please enter a valid Lightning invoice (lnbc...) or Lightning address (user@domain.com)")
      return
    }

    setIsSubmitting(true)

    try {
      const { submitAnonymousFixLightningAddressAction } = await import("@/app/actions/post-actions")
      const result = await submitAnonymousFixLightningAddressAction(postId, lightningAddress.trim())

      if (!result.success) {
        setError(result.error || "Failed to save Lightning address")
        return
      }

      onLightningAddressSubmitted()
      onOpenChange(false)
    } catch (error) {
      console.error("Error submitting Lightning address:", error)
      setError("Failed to save Lightning address. Please try again.")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleCreateAccount = () => {
    // Store the post ID in localStorage so we can associate the fix with the account after signup
    if (typeof window !== "undefined") {
      localStorage.setItem("pending_anonymous_fix_post", postId)
    }
    onAccountCreationRequested()
    onOpenChange(false)
    router.push(`/auth/register?postId=${postId}`)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Fix Submitted for Review</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="p-4 bg-blue-50 dark:bg-blue-950/20 rounded-lg">
            <p className="text-sm text-center text-muted-foreground mb-3">
              Your fix has been submitted for manual review. To receive your reward when approved, please provide a payment method.
            </p>
            <div className="flex items-center justify-center gap-2">
              <BitcoinLogo size={24} className="mr-2" />
              <span className="text-2xl font-bold">{formatSatsValue(rewardAmount)}</span>
              <span className="text-lg font-normal text-muted-foreground">sats</span>
            </div>
          </div>

          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="lightning-address">Lightning Invoice or Address</Label>
              <Textarea
                id="lightning-address"
                placeholder="Paste your Lightning invoice (lnbc...) or Lightning address (user@domain.com)"
                value={lightningAddress}
                onChange={(e) => setLightningAddress(e.target.value)}
                rows={3}
                className="font-mono text-sm"
                disabled={isSubmitting}
              />
              <p className="text-xs text-muted-foreground">
                If approved, your reward will be sent to this address
              </p>
            </div>

            {error && (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <Button
              onClick={handleSubmitLightningAddress}
              disabled={!lightningAddress.trim() || isSubmitting}
              className="w-full bg-green-600 hover:bg-green-700"
            >
              {isSubmitting ? "Saving..." : `Save Lightning Address`}
            </Button>
          </div>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">Or</span>
            </div>
          </div>

          <Button
            variant="outline"
            onClick={handleCreateAccount}
            className="w-full"
            disabled={isSubmitting}
          >
            Create Account & Save Reward
          </Button>
          <p className="text-xs text-center text-muted-foreground">
            Create an account to track your earnings and receive notifications when your fix is approved
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}

