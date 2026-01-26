"use client"

import { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"
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

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        {step === "intro" && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Wallet className="h-5 w-5 text-amber-500" />
                Connect Your Lightning Wallet
              </DialogTitle>
              <DialogDescription>
                Use your own Lightning wallet for payments instead of the Ganamos custodial wallet.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
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

              <Button onClick={() => setStep("connect")} className="w-full">
                <Link2 className="h-4 w-4 mr-2" />
                Connect Wallet
              </Button>
            </div>
          </>
        )}

        {step === "connect" && (
          <>
            <DialogHeader>
              <DialogTitle>Enter Connection Details</DialogTitle>
              <DialogDescription>
                Paste your NWC connection string from your wallet app.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
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

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setStep("intro")}
                  disabled={isConnecting}
                  className="flex-1"
                >
                  Back
                </Button>
                <Button
                  onClick={handleConnect}
                  disabled={isConnecting || !connectionString.trim()}
                  className="flex-1"
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
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-green-600 dark:text-green-400">
                <CheckCircle2 className="h-5 w-5" />
                Wallet Connected!
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4 py-4">
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

              <Button onClick={handleClose} className="w-full">
                Done
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
