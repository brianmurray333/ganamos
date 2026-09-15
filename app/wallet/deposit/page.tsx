"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import QRCode from "@/components/qr-code"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { toast } from "sonner"
import { LoadingSpinner } from "@/components/loading-spinner"
import { ArrowLeft, Copy, Check, X } from "lucide-react"
import { useAuth } from "@/components/auth-provider"
import { formatSatsValue } from "@/lib/utils"
import Image from "next/image"
import { AmountInputModal } from "@/components/amount-input-modal"
import { clearDurableDepositRequest, withDurableDepositRequest } from "@/lib/deposit-request-id"

export default function DepositPage() {
  const router = useRouter()
  const [amount, setAmount] = useState<string>("")
  const [invoice, setInvoice] = useState<string | null>(null)
  const [invoiceId, setInvoiceId] = useState<string | null>(null)
  const [loading, setLoading] = useState<boolean>(false)
  const [checking, setChecking] = useState<boolean>(false)
  const [settled, setSettled] = useState<boolean>(false)
  const [copied, setCopied] = useState<boolean>(false)
  const [showAmountModal, setShowAmountModal] = useState<boolean>(false)
  const [showFullInvoice, setShowFullInvoice] = useState<boolean>(false)
  const [receivedAmount, setReceivedAmount] = useState<number | null>(null)
  const [invoiceExpiresAt, setInvoiceExpiresAt] = useState<string | null>(null)
  const [pollingNotice, setPollingNotice] = useState<string | null>(null)
  const [invoiceOwner, setInvoiceOwner] = useState<{ id: string; name: string; avatar: string | null; balance: number } | null>(null)
  const [invoiceRequestId, setInvoiceRequestId] = useState<string | null>(null)

  const { user, profile, loading: authLoading, refreshProfile, activeUserId, accountContextReady } = useAuth()

  // Auto-generate invoice on page load
  const initialInvoiceGenerated = useRef(false)
  const checkTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const pollingGenerationRef = useRef(0)
  const creationInFlightRef = useRef(false)

  // Check if user is authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      toast.error("Authentication Required", {
        description: "Please sign in to access this feature",
      })
      router.push("/auth/login?redirect=/wallet/deposit")
    }
  }, [user, authLoading, router, toast])

  // Wait for connected-account restoration, then ask for an explicit fixed amount.
  useEffect(() => {
    if (user && profile && accountContextReady && !initialInvoiceGenerated.current && !invoice) {
      initialInvoiceGenerated.current = true
      setShowAmountModal(true)
    }
  }, [user, profile, accountContextReady, invoice])

  // Cleanup interval on unmount
  useEffect(() => {
    return () => {
      pollingGenerationRef.current += 1
      if (checkTimeoutRef.current) clearTimeout(checkTimeoutRef.current)
    }
  }, [])

  const handleCreateInvoice = async (overrideAmount?: string, overrideRequestId?: string) => {
    if (creationInFlightRef.current) return
    if (!user || !profile || !accountContextReady) {
      toast.error("Error", {
        description: "Your account is still loading. Please try again.",
      })
      return
    }

    creationInFlightRef.current = true
    setLoading(true)

    try {
      const satsAmount = Number(overrideAmount || amount)
      const requestId = overrideRequestId || invoiceRequestId

      if (!requestId || !Number.isSafeInteger(satsAmount) || satsAmount < 100 || satsAmount > 10_000_000) {
        toast.error("Invalid amount", {
          description: "Enter an amount between 100 and 10,000,000 sats.",
        })
        return
      }

      const targetUserId = activeUserId || user.id
      if (profile.id !== targetUserId) {
        toast.error("Account still loading", { description: "Wait for the selected account to finish loading, then try again." })
        return
      }
      const owner = { id: targetUserId, name: profile.name || "Your Account", avatar: profile.avatar_url, balance: profile.balance || 0 }
      pollingGenerationRef.current += 1
      if (checkTimeoutRef.current) clearTimeout(checkTimeoutRef.current)
      setPollingNotice(null)
      const response = await fetch("/api/mobile/wallet/deposit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: satsAmount, userId: targetUserId, requestId }),
      })
      const result = await response.json()
      if (response.ok && result.success) {
        setInvoice(result.paymentRequest)
        setInvoiceId(result.invoiceId)
        setInvoiceExpiresAt(result.expiresAt)
        setInvoiceOwner(owner)
        startCheckingPayment(result.invoiceId, result.expiresAt, targetUserId, satsAmount, requestId)
      } else {
        toast.error("Error Creating Invoice", {
          description: result.error || "Unable to create an invoice. Please try again.",
        })
        setShowAmountModal(true)
      }
    } catch {
      toast.error("Unable to Create Invoice", {
        description: "Check your connection and try again.",
      })
      setShowAmountModal(true)
    } finally {
      creationInFlightRef.current = false
      setLoading(false)
    }
  }


  const copyToClipboard = () => {
    if (invoice) {
      navigator.clipboard.writeText(invoice)
      setCopied(true)
      toast.success("Copied!", {
        description: "Invoice copied to clipboard",
      })
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const startCheckingPayment = (id: string, expiresAt: string, ownerId: string, satsAmount: number, requestId: string) => {
    if (!user) return

    const generation = ++pollingGenerationRef.current
    if (checkTimeoutRef.current) clearTimeout(checkTimeoutRef.current)
    setChecking(true)
    setPollingNotice(null)
    let consecutiveFailures = 0

    const check = async () => {
      if (generation !== pollingGenerationRef.current) return
      if (Date.now() >= new Date(expiresAt).getTime()) {
        setChecking(false)
        setPollingNotice("This invoice expired. Create a new invoice before sending payment.")
        return
      }

      try {
        const response = await fetch(`/api/mobile/wallet/deposit?invoiceId=${encodeURIComponent(id)}`, { cache: "no-store" })
        const result = await response.json()
        if (!response.ok || !result.success) {
          consecutiveFailures += 1
          if (consecutiveFailures >= 3) setPollingNotice("Payment status is delayed. We will keep checking automatically.")
        } else if (result.status === "expired") {
          clearDurableDepositRequest(ownerId, satsAmount, requestId)
          setChecking(false)
          setPollingNotice("This invoice expired. Create a new invoice before sending payment.")
          return
        } else if (result.settled) {
          clearDurableDepositRequest(ownerId, satsAmount, requestId)
          setSettled(true)
          setChecking(false)
          setPollingNotice(null)
          setReceivedAmount(Number(result.amount))
          await refreshProfile()
          setTimeout(() => router.push("/profile"), 3000)
          return
        } else {
          consecutiveFailures = 0
          setPollingNotice(null)
        }
      } catch {
        consecutiveFailures += 1
        if (consecutiveFailures >= 3) setPollingNotice("Payment status is delayed. We will keep checking automatically.")
      }

      if (generation === pollingGenerationRef.current) {
        checkTimeoutRef.current = setTimeout(check, consecutiveFailures >= 3 ? 5000 : 2000)
      }
    }

    void check()
  }

  // Loading state
  if (authLoading || (user && !accountContextReady)) {
    return (
      <div className="container max-w-md mx-auto py-8 px-4">
        <div className="flex items-center justify-center min-h-[400px]">
          <LoadingSpinner />
        </div>
      </div>
    )
  }

  // If not authenticated
  if (!user) {
    return null
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-md mx-auto min-h-screen bg-background">
        {/* Header */}
        <div className="flex items-center justify-between p-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="h-5 w-5" />
          </Button>

          <h1 className="text-lg font-semibold">Receive Bitcoin</h1>

          <Button variant="ghost" size="icon" onClick={() => router.push("/wallet")}>
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Content */}
        <div className="px-6 pb-6 space-y-6">
          {loading && !invoice ? (
            <div className="flex flex-col items-center justify-center min-h-[80vh]">
              <LoadingSpinner />
            </div>
          ) : settled ? (
            <div className="text-center p-8 bg-green-50 dark:bg-green-900/20 rounded-lg">
              <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-4">
                <Check className="h-8 w-8 text-white" />
              </div>
              <h3 className="text-lg font-medium text-green-700 dark:text-green-300">Payment Received!</h3>
              <p className="text-green-600 dark:text-green-400 mt-2">
                {receivedAmount ? `${formatSatsValue(receivedAmount)}` : "Sats"} added to your balance
              </p>
              <p className="text-sm text-green-500 dark:text-green-400 mt-1">Redirecting to your profile...</p>
            </div>
          ) : invoice ? (
            <>
              {/* User Info - Receiving to */}
              <div className="flex flex-col items-center space-y-2">
                <div className="relative w-16 h-16 rounded-full overflow-hidden bg-gray-200 dark:bg-gray-700">
                  <Image
                    src={invoiceOwner?.avatar || "/placeholder.svg?height=64&width=64"}
                    alt={invoiceOwner?.name || "Your account"}
                    fill
                    className="object-cover"
                  />
                </div>
                <div className="text-lg font-semibold">
                  {invoiceOwner?.name || "Your Account"}
                </div>
                <div className="flex items-center space-x-1.5 text-sm text-muted-foreground">
                  <div className="w-3.5 h-3.5 relative">
                    <Image
                      src="/images/bitcoin-logo.png"
                      alt="Bitcoin"
                      fill
                      className="object-contain"
                    />
                  </div>
                  <span>{formatSatsValue(invoiceOwner?.balance || 0)}</span>
                </div>
              </div>

              {/* QR Code - Main Focus */}
              <div className="flex flex-col items-center">
                <div className="bg-white p-6 rounded-xl shadow-sm">
                  <QRCode 
                    data={invoice} 
                    size={280} 
                    color="#000000" 
                    backgroundColor="#ffffff" 
                    cornerColor="#10b981"
                  />
                </div>
              </div>

              <div className="text-center text-sm text-muted-foreground">
                {checking ? "Waiting for payment" : pollingNotice || "Payment status check paused"}
              </div>
              {pollingNotice && invoiceId && invoiceExpiresAt && Date.now() < new Date(invoiceExpiresAt).getTime() && (
                <Button variant="outline" className="w-full" onClick={() => invoiceOwner && invoiceRequestId && startCheckingPayment(invoiceId, invoiceExpiresAt, invoiceOwner.id, Number(amount), invoiceRequestId)}>
                  Check payment now
                </Button>
              )}

              {/* Fixed invoice amount */}
              <div className="rounded-md bg-gray-100 px-4 py-2 text-center text-gray-700 dark:bg-gray-800 dark:text-gray-300">
                {formatSatsValue(parseInt(amount))}
              </div>

              {/* Invoice String with Copy */}
              <div className="space-y-2">
                <div className={`flex ${showFullInvoice ? 'items-start' : 'items-center'} space-x-2`}>
                  <div 
                    onClick={() => setShowFullInvoice(!showFullInvoice)}
                    className={`flex-1 text-xs font-mono bg-muted cursor-pointer border rounded-md px-3 py-2 ${showFullInvoice ? 'min-h-10' : 'h-10 flex items-center overflow-hidden'}`}
                  >
                    {showFullInvoice ? (
                      <span className="break-all">{invoice}</span>
                    ) : (
                      <span className="truncate block">{invoice}</span>
                    )}
                  </div>
                  <Button
                    onClick={copyToClipboard} 
                    variant="outline"
                    size="icon"
                    className="shrink-0 h-10 w-10"
                  >
                    {copied ? (
                      <Check className="h-4 w-4 text-green-500" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                {showFullInvoice && (
                  <p className="text-xs text-muted-foreground text-center">
                    Click to collapse
                  </p>
                )}
              </div>
            </>
          ) : null}
        </div>
      </div>

      {/* Amount Input Modal */}
      <AmountInputModal
        open={showAmountModal}
        onOpenChange={setShowAmountModal}
        onAmountSet={(newAmount) => {
          if (!user || !profile || !accountContextReady || creationInFlightRef.current) return
          const satsAmount = Number(newAmount)
          if (!Number.isSafeInteger(satsAmount) || satsAmount < 100 || satsAmount > 10_000_000) {
            void handleCreateInvoice(newAmount)
            return
          }
          const targetUserId = activeUserId || user.id
          if (profile.id !== targetUserId) return

          void withDurableDepositRequest(targetUserId, satsAmount, async (requestId) => {
            setAmount(newAmount)
            setInvoiceRequestId(requestId)
            pollingGenerationRef.current += 1
            if (checkTimeoutRef.current) clearTimeout(checkTimeoutRef.current)
            setInvoice(null)
            setInvoiceId(null)
            setInvoiceExpiresAt(null)
            setInvoiceOwner(null)
            setPollingNotice(null)
            setChecking(false)
            setSettled(false)
            setShowFullInvoice(false)
            await handleCreateInvoice(newAmount, requestId)
          }).catch(() => {
            toast.error("Unable to Create Invoice", { description: "Safe invoice recovery is unavailable in this browser." })
          })
        }}
        currentAmount={amount}
      />
    </div>
  )
}
