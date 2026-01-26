"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useAuth } from "@/components/auth-provider"
import { toast } from "sonner"
import QRCode from "@/components/qr-code"
import { Copy, Check, X } from "lucide-react"

interface UserQRModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function UserQRModal({ open, onOpenChange }: UserQRModalProps) {
  const { user, profile, updateProfile } = useAuth()
  const [isEditingUsername, setIsEditingUsername] = useState(false)
  const [newUsername, setNewUsername] = useState("")
  const [isSaving, setIsSaving] = useState(false)

  // Reset editing state when modal opens/closes
  useEffect(() => {
    if (open) {
      setNewUsername(profile?.username || "")
      setIsEditingUsername(false)
    }
  }, [open, profile?.username])

  // Generate QR code data - using username for account connection
  const qrData = profile?.username || user?.id || ""

  const handleCopyUsername = () => {
    const dataToCopy = profile?.username || user?.id || ""
    if (dataToCopy) {
      navigator.clipboard.writeText(dataToCopy)
      toast.success("Copied!", {
        description: profile?.username ? "Your username has been copied to clipboard." : "Your account ID has been copied to clipboard.",
      })
    }
  }

  const handleStartEditing = () => {
    setNewUsername(profile?.username || "")
    setIsEditingUsername(true)
  }

  const handleCancelEditing = () => {
    setNewUsername(profile?.username || "")
    setIsEditingUsername(false)
  }

  const handleSaveUsername = async () => {
    const trimmedUsername = newUsername.trim()
    
    if (!trimmedUsername || trimmedUsername.length < 3) {
      toast.error("Invalid Username", {
        description: "Username must be at least 3 characters long.",
      })
      return
    }

    // If username hasn't changed, just exit edit mode
    if (trimmedUsername === profile?.username) {
      setIsEditingUsername(false)
      return
    }

    // Show confirmation toast
    toast(`Change username to @${trimmedUsername}?`, {
      action: {
        label: 'Confirm',
        onClick: async () => {
          setIsSaving(true)
          try {
            await updateProfile({ username: trimmedUsername })
            toast.success("Username Updated", {
              description: `Your username is now: @${trimmedUsername}`,
            })
            setIsEditingUsername(false)
          } catch (error: any) {
            toast.error("Update Failed", {
              description: error.message?.includes('duplicate') 
                ? "Username already taken. Please choose another." 
                : "Failed to update username.",
            })
          } finally {
            setIsSaving(false)
          }
        },
      },
      cancel: {
        label: 'Cancel',
        onClick: () => {},
      },
    })
  }

  const handleUsernameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Only allow lowercase letters, numbers, and hyphens
    const sanitized = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '')
    setNewUsername(sanitized)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[320px]">
        <DialogHeader>
          <DialogTitle className="text-center">My QR Code</DialogTitle>
        </DialogHeader>
        
        <div className="flex flex-col items-center space-y-6 py-4">
          {/* User Info */}
          <div className="text-center">
            <h3 className="text-lg font-semibold">{profile?.name || "User"}</h3>
            <p className="text-sm text-gray-500">Share this QR code to connect accounts</p>
          </div>

          {/* QR Code */}
          <div className="p-4 bg-white rounded-lg">
            <QRCode 
              data={qrData}
              size={200}
              backgroundColor="#ffffff"
              color="#000000"
            />
          </div>

          {/* Username/Account ID with Edit capability - matches QR code box width (200px + p-4 padding) */}
          <div className="w-[232px]">
            {isEditingUsername ? (
              // Edit mode
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <div className="flex-1 flex items-center bg-gray-50 dark:bg-gray-800 rounded-md px-2">
                    <span className="text-sm text-gray-500">@</span>
                    <Input
                      value={newUsername}
                      onChange={handleUsernameChange}
                      placeholder="username"
                      maxLength={30}
                      className="border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 px-1"
                      autoFocus
                    />
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleSaveUsername}
                    disabled={isSaving || !newUsername.trim() || newUsername.length < 3}
                    className="h-8 w-8 p-0 text-green-600 hover:text-green-700 hover:bg-green-100"
                  >
                    <Check className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleCancelEditing}
                    disabled={isSaving}
                    className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-100"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-xs text-gray-500 text-center">
                  Only lowercase letters, numbers, and hyphens. Min 3 characters.
                </p>
              </div>
            ) : (
              // Display mode - tap anywhere to edit
              <div 
                className="flex items-center space-x-2 p-2 bg-gray-50 dark:bg-gray-800 rounded-md cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                onClick={handleStartEditing}
              >
                <code className="flex-1 text-xs font-mono truncate">
                  {profile?.username ? `@${profile.username}` : user?.id || ""}
                </code>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleCopyUsername();
                  }}
                  className="h-6 w-6 p-0"
                  title="Copy"
                >
                  <Copy className="h-3 w-3" />
                </Button>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
