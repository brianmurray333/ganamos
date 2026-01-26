"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { X, Zap, ChevronRight } from "lucide-react"

interface WalletConnectBannerProps {
  onConnect: () => void
  onDismiss: () => void
}

export function WalletConnectBanner({ onConnect, onDismiss }: WalletConnectBannerProps) {
  const [isDismissing, setIsDismissing] = useState(false)

  const handleDismiss = async () => {
    setIsDismissing(true)
    try {
      await fetch("/api/wallet/nwc/dismiss-prompt", {
        method: "POST",
      })
      onDismiss()
    } catch (error) {
      console.error("Failed to dismiss prompt:", error)
      onDismiss() // Still dismiss locally even if API fails
    }
  }

  return (
    <div className="relative mb-6 overflow-hidden rounded-xl bg-gradient-to-r from-purple-500/10 via-violet-500/10 to-purple-500/10 border border-purple-200 dark:border-purple-800/50">
      {/* Background decoration */}
      <div className="absolute inset-0 opacity-5">
        <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-purple-500" />
        <div className="absolute -left-4 -bottom-4 h-16 w-16 rounded-full bg-violet-500" />
      </div>

      <div className="relative p-4">
        <button
          onClick={handleDismiss}
          disabled={isDismissing}
          className="absolute right-2 top-2 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex-1 min-w-0 pr-6">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-1">
            Connect Your Lightning Wallet
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
            Use your own wallet for full control of your funds.
          </p>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              onClick={onConnect}
              className="bg-purple-600 hover:bg-purple-700 text-white"
            >
              <Zap className="h-3.5 w-3.5 mr-1.5" />
              Connect Wallet
              <ChevronRight className="h-3.5 w-3.5 ml-1" />
            </Button>
            <span className="text-xs text-gray-500 dark:text-gray-500">
              Works with Alby, Zeus, Mutiny & more
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
