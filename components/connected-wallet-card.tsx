"use client"

import { useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { 
  Wallet, 
  Unlink, 
  CheckCircle2, 
  Loader2,
  RefreshCw,
  ExternalLink
} from "lucide-react"
import { toast } from "sonner"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"

interface ConnectedWalletCardProps {
  wallet: {
    id: string
    name: string
    relayUrl?: string
    status: string
    lastConnected?: string
  }
  onDisconnect: () => void
}

export function ConnectedWalletCard({ wallet, onDisconnect }: ConnectedWalletCardProps) {
  const [isDisconnecting, setIsDisconnecting] = useState(false)

  const handleDisconnect = async () => {
    setIsDisconnecting(true)
    try {
      const response = await fetch("/api/wallet/nwc/disconnect", {
        method: "POST",
      })

      const result = await response.json()

      if (result.success) {
        toast.success("Wallet Disconnected", {
          description: "You'll now use your Ganamos custodial wallet for payments",
        })
        onDisconnect()
      } else {
        toast.error("Failed to disconnect wallet")
      }
    } catch (error) {
      toast.error("Failed to disconnect wallet")
    } finally {
      setIsDisconnecting(false)
    }
  }

  // Extract relay hostname for display
  const relayHost = wallet.relayUrl 
    ? new URL(wallet.relayUrl).hostname 
    : null

  return (
    <Card className="mb-4 border-green-200 dark:border-green-800/50 bg-green-50/50 dark:bg-green-900/10">
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
              <Wallet className="h-5 w-5 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-medium">{wallet.name}</span>
                <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                  <CheckCircle2 className="h-3 w-3" />
                  Connected
                </span>
              </div>
              {relayHost && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  via {relayHost}
                </p>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                Payments will be made from this wallet
              </p>
            </div>
          </div>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button 
                variant="ghost" 
                size="sm"
                className="text-muted-foreground hover:text-destructive"
              >
                <Unlink className="h-4 w-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Disconnect Wallet?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will disconnect your Lightning wallet from Ganamos. You'll use your Ganamos custodial wallet for future payments.
                  <br /><br />
                  Your funds in both wallets are safe and this action can be undone by reconnecting.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDisconnect}
                  disabled={isDisconnecting}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {isDisconnecting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Disconnecting...
                    </>
                  ) : (
                    "Disconnect"
                  )}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </CardContent>
    </Card>
  )
}
