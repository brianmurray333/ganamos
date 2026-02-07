"use client"

import * as React from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { useRouter } from "next/navigation"

interface AuthPromptModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  feature: "wallet" | "profile"
}

export function AuthPromptModal({ open, onOpenChange, feature }: AuthPromptModalProps) {
  const router = useRouter()
  const featureTitle = feature === "wallet" ? "Wallet" : "Profile"
  
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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Sign Up to Access Your {featureTitle}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <p className="text-sm text-muted-foreground">
            Create an account to access your {feature === "wallet" ? "Bitcoin wallet and manage your earnings" : "profile and track your activity"}.
          </p>
          <div className="flex flex-col gap-3">
            <Button onClick={handleSignUp} className="w-full">
              Sign Up
            </Button>
            <Button onClick={handleLogin} variant="outline" className="w-full">
              Log In
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
