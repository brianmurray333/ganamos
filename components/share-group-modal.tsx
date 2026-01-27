"use client"

import type React from "react"
import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { toast } from "sonner"
import { Copy, Check, Users, Link as LinkIcon } from "lucide-react"
import type { Group } from "@/lib/types"

interface ShareGroupModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  group: Group | null
  onDone: () => void
}

export function ShareGroupModal({ open, onOpenChange, group, onDone }: ShareGroupModalProps) {
  const [copiedLink, setCopiedLink] = useState(false)
  const [copiedCode, setCopiedCode] = useState(false)

  if (!group) return null

  const inviteUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/groups/join/${group.invite_code}`
  const groupCode = group.group_code || group.invite_code?.substring(0, 4).toUpperCase()

  const copyInviteLink = () => {
    navigator.clipboard.writeText(inviteUrl)
    setCopiedLink(true)
    toast.success("Copied!", {
      description: "Invite link copied to clipboard",
    })
    setTimeout(() => setCopiedLink(false), 2000)
  }

  const copyGroupCode = () => {
    if (groupCode) {
      navigator.clipboard.writeText(groupCode)
      setCopiedCode(true)
      toast.success("Copied!", {
        description: "Group code copied to clipboard",
      })
      setTimeout(() => setCopiedCode(false), 2000)
    }
  }

  const handleDone = () => {
    onDone()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="text-xl">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-blue-600" />
              Share "{group.name}"
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Group Info */}
          <div className="bg-blue-50 dark:bg-blue-950/30 p-4 rounded-lg">
            <p className="text-sm text-muted-foreground mb-1">Your group has been created!</p>
            <p className="text-sm font-medium">{group.name}</p>
            {group.description && (
              <p className="text-sm text-muted-foreground mt-1">{group.description}</p>
            )}
          </div>

          {/* Invite Link */}
          <div className="space-y-2">
            <label className="text-sm font-semibold flex items-center gap-2">
              <LinkIcon className="w-4 h-4" />
              Invite Link
            </label>
            <div className="flex items-center gap-2">
              <Input
                value={inviteUrl}
                readOnly
                className="text-xs font-mono"
                onClick={(e) => e.currentTarget.select()}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="shrink-0"
                onClick={copyInviteLink}
              >
                {copiedLink ? (
                  <Check className="h-4 w-4 text-green-500" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Share this link with people you want to invite to your group
            </p>
          </div>

          {/* Group Code */}
          {groupCode && (
            <div className="space-y-2">
              <label className="text-sm font-semibold flex items-center gap-2">
                <Users className="w-4 h-4" />
                Group Code
              </label>
              <div className="flex items-center gap-2">
                <Input
                  value={groupCode}
                  readOnly
                  className="text-lg font-bold text-center tracking-wider"
                  onClick={(e) => e.currentTarget.select()}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="shrink-0"
                  onClick={copyGroupCode}
                >
                  {copiedCode ? (
                    <Check className="h-4 w-4 text-green-500" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                People can join by entering this code in the app
              </p>
            </div>
          )}

          {/* Info Box */}
          <div className="bg-muted/50 p-3 rounded-lg">
            <p className="text-xs text-muted-foreground">
              💡 <strong>Tip:</strong> You can invite more members later from the group settings page
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            onClick={handleDone}
            className="w-full bg-green-600 hover:bg-green-700 text-white"
          >
            Done - Continue with Post
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
