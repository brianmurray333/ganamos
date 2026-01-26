"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { BitcoinLogo } from "@/components/bitcoin-logo"
import { formatSatsValue } from "@/lib/utils"
import { AlertCircle, CheckCircle } from "lucide-react"

interface LightningInvoiceModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  rewardAmount: number
  postId: string
  onSuccess: () => void
}

export function LightningInvoiceModal({
  open,
  onOpenChange,
  rewardAmount,
  postId,
  onSuccess,
}: LightningInvoiceModalProps) {
  const [invoice, setInvoice] = useState("")
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState("")
  const [step, setStep] = useState<"input" | "processing" | "success">("input")

  const validateInvoice = (invoice: string): boolean => {
    const trimmedInvoice = invoice.trim().toLowerCase()

    // Support Lightning invoices (lnbc, lntb, lnbcrt)
    if (
      trimmedInvoice.startsWith("lnbc") ||
      trimmedInvoice.startsWith("lntb") ||
      trimmedInvoice.startsWith("lnbcrt")
    ) {
      // Check minimum length for Lightning invoices
      return trimmedInvoice.length >= 100
    }

    // Support Lightning addresses (format: user@domain.com)
    if (trimmedInvoice.includes("@") && trimmedInvoice.includes(".")) {
      const [user, domain] = trimmedInvoice.split("@")
      return user.length > 0 && domain.length > 0 && domain.includes(".")
    }

    return false
  }

  const handleSubmit = async () => {
    setError("")

    if (!invoice.trim()) {
      setError("Please enter a Lightning invoice")
      return
    }

    if (!validateInvoice(invoice)) {
      setError("Please enter a valid Lightning invoice or Lightning address (e.g., user@domain.com)")
      return
    }

    setIsProcessing(true)
    setStep("processing")

    try {
      // Import the server action
      const { payAnonymousRewardAction } = await import("@/app/actions/post-actions")

      // Call the server action to process the payment
      const result = await payAnonymousRewardAction(postId, invoice.trim())

      if (!result.success) {
        setError(result.error || "Failed to process payment")
        setStep("input")
        return
      }

      // Payment successful
      console.log("Anonymous reward payment successful:", result.paymentHash)
      setStep("success")

      // Auto-close and call success callback after showing success state
      setTimeout(() => {
        onSuccess()
        onOpenChange(false)
        resetModal()
      }, 2000)
    } catch (error) {
      console.error("Error processing payment:", error)
      setError("Failed to process payment. Please try again.")
      setStep("input")
    } finally {
      setIsProcessing(false)
    }
  }


  const resetModal = () => {
    setInvoice("")
    setError("")
    setStep("input")
    setIsProcessing(false)
  }

  const handleClose = () => {
    if (!isProcessing) {
      resetModal()
      onOpenChange(false)
    }
  }


  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Withdraw Your Reward</DialogTitle>
        </DialogHeader>

        {step === "input" && (
          <div className="space-y-4">
            <div className="p-4 bg-amber-50 dark:bg-amber-950/20 rounded-lg">
              <div className="flex items-center justify-center mb-2">
                <BitcoinLogo size={24} className="mr-2" />
                <span className="text-2xl font-bold">{formatSatsValue(rewardAmount)}</span>
              </div>
              <p className="text-sm text-center text-muted-foreground">Ready to withdraw to your Lightning wallet</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="invoice">Lightning Invoice or Address</Label>
              <Textarea
                id="invoice"
                placeholder="Paste your Lightning invoice (lnbc...) or Lightning address (user@domain.com)"
                value={invoice}
                onChange={(e) => setInvoice(e.target.value)}
                rows={4}
                className="font-mono text-sm"
              />
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="flex space-x-3">
              <Button variant="outline" onClick={handleClose} className="flex-1">
                Cancel
              </Button>
              <Button onClick={handleSubmit} disabled={!invoice.trim() || isProcessing} className="flex-1 bg-green-600 hover:bg-green-700">
                Withdraw {formatSatsValue(rewardAmount)}
              </Button>
            </div>
          </div>
        )}

        {step === "processing" && (
          <div className="space-y-4 text-center py-8">
            <div className="flex justify-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-600"></div>
            </div>
            <div>
              <h3 className="text-lg font-semibold mb-2">Processing Payment</h3>
              <p className="text-sm text-muted-foreground">
                Sending {formatSatsValue(rewardAmount)} to your Lightning wallet...
              </p>
              <p className="text-xs text-muted-foreground mt-2">This usually takes a few seconds</p>
            </div>
          </div>
        )}

        {step === "success" && (
          <div className="space-y-4 text-center py-8">
            <div className="flex justify-center">
              <div className="p-3 bg-green-100 rounded-full">
                <CheckCircle className="w-8 h-8 text-green-600" />
              </div>
            </div>
            <div>
              <h3 className="text-lg font-semibold mb-2">Payment Sent!</h3>
              <p className="text-sm text-muted-foreground">
                {formatSatsValue(rewardAmount)} has been sent to your Lightning wallet
              </p>
              <p className="text-xs text-muted-foreground mt-2">Thank you for contributing to your community!</p>
            </div>
          </div>
        )}
      </DialogContent>

    </Dialog>
  )
}
