"use client"

import { useState } from "react"
import {
  BottomSheet,
  BottomSheetContent,
  BottomSheetDescription,
  BottomSheetTitle,
} from "@/components/ui/bottom-sheet"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "@/components/ui/toast"
import { 
  Wallet, 
  Link2, 
  AlertTriangle, 
  CheckCircle2, 
  Loader2,
  ExternalLink,
  Shield,
  Zap
} from "lucide-react"

interface WalletConnectionModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConnected?: () => void
}

type Step = "intro" | "connect" | "success"

export function WalletConnectionModal({
  open,
  onOpenChange,
  onConnected,
}: WalletConnectionModalProps) {
  const [step, setStep] = useState<Step>("intro")
  const [connectionString, setConnectionString] = useState("")
  const [walletName, setWalletName] = useState("")
  const [isConnecting, setIsConnecting] = useState(false)
  const [connectedWallet, setConnectedWallet] = useState<{
    name: string
    balance?: number
  } | null>(null)

  const resetModal = () => {
    setStep("intro")
    setConnectionString("")
    setWalletName("")
    setIsConnecting(false)
    setConnectedWallet(null)
  }

  const handleClose = () => {
    resetModal()
    onOpenChange(false)
  }

  const handleConnect = async () => {
    if (!connectionString.trim()) {
      toast.error("Please enter your NWC connection string")
      return
    }

    if (!connectionString.startsWith("nostr+walletconnect://")) {
      toast.error("Invalid connection string", {
        description: "Connection string must start with nostr+walletconnect://",
      })
      return
    }

    setIsConnecting(true)

    try {
      const response = await fetch("/api/wallet/nwc/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          connectionString: connectionString.trim(),
          walletName: walletName.trim() || "My Lightning Wallet",
        }),
      })

      const result = await response.json()

      if (result.success) {
        setConnectedWallet({
          name: result.wallet.name,
          balance: result.wallet.balance,
        })
        setStep("success")
        toast.success("Wallet Connected!", {
          description: "Your Lightning wallet is now connected to Ganamos",
        })
        onConnected?.()
      } else {
        toast.error("Connection Failed", {
          description: result.error || "Failed to connect wallet",
        })
      }
    } catch (error) {
      toast.error("Connection Failed", {
        description: "An unexpected error occurred. Please try again.",
      })
    } finally {
      setIsConnecting(false)
    }
  }

  // One sheet; the header follows the step
  const header = (
    <div className="border-b px-5 pb-3 pt-1 text-left lg:pt-6">
      {step === "intro" && (
        <>
          <BottomSheetTitle className="flex items-center gap-2 pr-10 text-xl font-bold">
            <Wallet className="h-5 w-5 shrink-0 text-amber-500" />
            Connect Your Lightning Wallet
          </BottomSheetTitle>
          <BottomSheetDescription className="text-sm text-muted-foreground">
            Use your own Lightning wallet for payments instead of the Ganamos custodial wallet.
          </BottomSheetDescription>
        </>
      )}
      {step === "connect" && (
        <>
          <BottomSheetTitle className="pr-10 text-xl font-bold">Enter Connection Details</BottomSheetTitle>
          <BottomSheetDescription className="text-sm text-muted-foreground">
            Paste your NWC connection string from your wallet app.
          </BottomSheetDescription>
        </>
      )}
      {step === "success" && (
        <BottomSheetTitle className="flex items-center gap-2 pr-10 text-xl font-bold text-green-600 dark:text-green-400">
          <CheckCircle2 className="h-5 w-5" />
          Wallet Connected!
        </BottomSheetTitle>
      )}
    </div>
  )

  return (
    <BottomSheet open={open} onOpenChange={handleClose}>
      <BottomSheetContent
        onDismiss={handleClose}
        onOpenAutoFocus={(e) => {
          e.preventDefault()
          ;(e.currentTarget as HTMLElement | null)?.focus()
        }}
        {...(step === "success" ? { "aria-describedby": undefined } : {})}
        header={header}
      >
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5 pt-3">
        {step === "intro" && (
          <>

            <div className="space-y-4 pt-1">
              <div className="space-y-3">
                <div className="flex items-start gap-3 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                  <Shield className="h-5 w-5 text-green-600 dark:text-green-400 mt-0.5" />
                  <div>
                    <p className="font-medium text-green-800 dark:text-green-300 text-sm">
                      Non-Custodial
                    </p>
                    <p className="text-xs text-green-700 dark:text-green-400">
                      Your funds stay in your wallet. Ganamos never holds your Bitcoin.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
                  <Zap className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5" />
                  <div>
                    <p className="font-medium text-amber-800 dark:text-amber-300 text-sm">
                      Instant Payments
                    </p>
                    <p className="text-xs text-amber-700 dark:text-amber-400">
                      Send and receive Lightning payments directly from your wallet.
                    </p>
                  </div>
                </div>
              </div>

              <div className="border-t pt-4">
                <p className="text-sm font-medium mb-2">Supported Wallets</p>
                <div className="flex flex-wrap gap-2">
                  {["Alby", "Zeus", "Mutiny", "Primal", "Amethyst"].map((wallet) => (
                    <span
                      key={wallet}
                      className="px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded text-xs"
                    >
                      {wallet}
                    </span>
                  ))}
                  <span className="px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded text-xs">
                    + any NWC wallet
                  </span>
                </div>
              </div>

              <Button size="xl" onClick={() => setStep("connect")} className="w-full">
                <Link2 className="h-4 w-4 mr-2" />
                Connect Wallet
              </Button>
            </div>
          </>
        )}

        {step === "connect" && (
          <>

            <div className="space-y-4 pt-1">
              <div className="space-y-2">
                <Label htmlFor="wallet-name">Wallet Name (Optional)</Label>
                <Input
                  id="wallet-name"
                  placeholder="My Lightning Wallet"
                  value={walletName}
                  onChange={(e) => setWalletName(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="connection-string">NWC Connection String</Label>
                <Input
                  id="connection-string"
                  type="password"
                  placeholder="nostr+walletconnect://..."
                  value={connectionString}
                  onChange={(e) => setConnectionString(e.target.value)}
                  className="font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  Find this in your wallet's settings under "Nostr Wallet Connect" or "NWC"
                </p>
              </div>

              <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
                <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  Keep your connection string secret! Anyone with it can access your wallet.
                  We store it securely and never share it.
                </p>
              </div>

              <div className="flex flex-col gap-3">
                <Button
                  size="xl"
                  onClick={handleConnect}
                  disabled={isConnecting || !connectionString.trim()}
                  className="w-full"
                >
                  {isConnecting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Connecting...
                    </>
                  ) : (
                    "Connect"
                  )}
                </Button>
                <Button
                  size="xl"
                  variant="outline"
                  onClick={() => setStep("intro")}
                  disabled={isConnecting}
                  className="w-full"
                >
                  Back
                </Button>
              </div>

              <div className="text-center">
                <a
                  href="https://nwc.dev"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                >
                  Learn more about NWC
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </div>
          </>
        )}

        {step === "success" && connectedWallet && (
          <>

            <div className="space-y-4 pt-1">
              <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg text-center">
                <Wallet className="h-12 w-12 mx-auto text-green-600 dark:text-green-400 mb-2" />
                <p className="font-medium">{connectedWallet.name}</p>
                {connectedWallet.balance !== undefined && (
                  <p className="text-sm text-muted-foreground">
                    Balance: {connectedWallet.balance.toLocaleString()} sats
                  </p>
                )}
              </div>

              <div className="space-y-2 text-sm">
                <p className="font-medium">What happens now?</p>
                <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                  <li>Payments will be made from your connected wallet</li>
                  <li>Rewards will be received directly to your wallet</li>
                  <li>Your Ganamos balance is still available</li>
                  <li>You can disconnect anytime from wallet settings</li>
                </ul>
              </div>

              <Button size="xl" onClick={handleClose} className="w-full">
                Done
              </Button>
            </div>
          </>
        )}
        </div>
      </BottomSheetContent>
    </BottomSheet>
  )
}
