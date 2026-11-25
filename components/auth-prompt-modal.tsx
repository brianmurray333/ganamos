"use client"

import * as React from "react"
import { User, Wallet } from "lucide-react"
import { BottomSheet, BottomSheetContent, BottomSheetDescription, BottomSheetTitle } from "@/components/ui/bottom-sheet"
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
    <BottomSheet open={open} onOpenChange={onOpenChange}>
      <BottomSheetContent
        onDismiss={() => onOpenChange(false)}
        header={
          <div className="flex flex-col items-center space-y-3 px-6 pt-4 text-center lg:pt-10">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-600/15">
              <Icon className="h-7 w-7 text-green-500" />
            </div>
            <BottomSheetTitle className="text-xl font-semibold">{title}</BottomSheetTitle>
            <BottomSheetDescription className="text-sm text-muted-foreground">
              Earn sats for fixing things nearby.
            </BottomSheetDescription>
          </div>
        }
      >
        <div className="flex flex-col gap-3 px-6 pb-6 pt-6">
          <Button size="xl" onClick={handleSignUp} className="w-full bg-green-600 text-white hover:bg-green-700">
            Sign Up
          </Button>
          <Button size="xl" onClick={handleLogin} variant="outline" className="w-full">
            Log In
          </Button>
        </div>
      </BottomSheetContent>
    </BottomSheet>
  )
}
