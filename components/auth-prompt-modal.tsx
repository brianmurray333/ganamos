"use client"

import * as React from "react"
import { User, Wallet } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { useRouter } from "next/navigation"

interface AuthPromptModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  feature: "wallet" | "profile"
}

const COPY = {
  wallet: { icon: Wallet, title: "Sign up to use your wallet" },
  profile: { icon: User, title: "Sign up to see your profile" },
} as const

export function AuthPromptModal({ open, onOpenChange, feature }: AuthPromptModalProps) {
  const router = useRouter()
  const { icon: Icon, title } = COPY[feature]

  const handleSignUp = () => {
    onOpenChange(false)
    router.push(`/auth/register?returnUrl=/${feature}`)
  }

  const handleLogin = () => {
    onOpenChange(false)
    router.push(`/auth/login?returnUrl=/${feature}`)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm gap-6 px-6 pb-6 pt-8">
        <DialogHeader className="items-center space-y-3 text-center sm:text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-600/15">
            <Icon className="h-7 w-7 text-green-500" />
          </div>
          <DialogTitle className="text-xl">{title}</DialogTitle>
          <DialogDescription>Earn sats for fixing things nearby.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <Button size="xl" onClick={handleSignUp} className="w-full bg-green-600 text-white hover:bg-green-700">
            Sign Up
          </Button>
          <Button size="xl" onClick={handleLogin} variant="outline" className="w-full">
            Log In
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
