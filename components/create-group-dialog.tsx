"use client"

import type React from "react"

import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { createBrowserSupabaseClient } from "@/lib/supabase"
import { toast } from "sonner"
import { v4 as uuidv4 } from "@/lib/uuid"
import type { Group } from "@/lib/types"
import { Share2 } from "lucide-react"

interface CreateGroupDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  userId: string
  onSuccess: (group: Group) => void
}

export function CreateGroupDialog({ open, onOpenChange, userId, onSuccess }: CreateGroupDialogProps) {
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [step, setStep] = useState<"create" | "share">("create")
  const [createdGroup, setCreatedGroup] = useState<Group | null>(null)
  const supabase = createBrowserSupabaseClient()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!name.trim()) {
      toast.error("Group name required", {
        description: "Please enter a name for your group",
      })
      return
    }

    setIsSubmitting(true)

    try {
      // Generate a unique invite code
      const inviteCode = generateInviteCode()
      const now = new Date().toISOString()

      // Generate a unique 4-character group code
      const groupCode = generateGroupCode()

      // Create the group
      const { data: groupData, error: groupError } = await supabase
        .from("groups")
        .insert({
          name,
          description: description || null,
          created_by: userId,
          created_at: now,
          updated_at: now,
          invite_code: inviteCode,
          group_code: groupCode,
        })
        .select()
        .single()

      if (groupError) {
        throw groupError
      }

      // Add the creator as an admin member
      const { error: memberError } = await supabase.from("group_members").insert({
        id: uuidv4(),
        group_id: groupData.id,
        user_id: userId,
        role: "admin",
        status: "approved",
        created_at: now,
        updated_at: now,
      })

      if (memberError) {
        throw memberError
      }

      // Store created group and show share step
      const newGroup = {
        ...groupData,
        memberCount: 1,
      }
      setCreatedGroup(newGroup)
      setStep("share")
    } catch (error) {
      console.error("Error creating group:", error)
      toast.error("Error", {
        description: "There was an error creating your group. Please try again.",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleContinue = () => {
    if (createdGroup) {
      onSuccess(createdGroup)
    }
    handleClose()
  }

  const handleClose = () => {
    // Reset state when dialog closes
    setStep("create")
    setName("")
    setDescription("")
    setCreatedGroup(null)
    onOpenChange(false)
  }

  const inviteUrl = createdGroup?.invite_code 
    ? `https://www.ganamos.earth/groups/join/${createdGroup.invite_code}`
    : ""

  const handleCopyLink = async () => {
    if (inviteUrl) {
      try {
        await navigator.clipboard.writeText(inviteUrl)
        toast.success("Copied to clipboard", {
          description: "Invite link copied",
        })
      } catch (error) {
        console.error("Failed to copy:", error)
      }
    }
  }

  const handleCopyCode = async () => {
    if (createdGroup?.group_code) {
      try {
        await navigator.clipboard.writeText(createdGroup.group_code)
        toast.success("Copied to clipboard", {
          description: "Group code copied",
        })
      } catch (error) {
        console.error("Failed to copy:", error)
      }
    }
  }

  const handleShareLink = async () => {
    const shareText = `Join my group "${createdGroup?.name}" on Ganamos!\n\nUse invite link: ${inviteUrl}\n\nOr enter code: ${createdGroup?.group_code}`
    
    // Check if it's a mobile device and supports native share
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
    
    if (isMobile && navigator.share) {
      try {
        await navigator.share({
          title: `Join ${createdGroup?.name} on Ganamos`,
          text: shareText,
        })
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          console.error('Error sharing:', error)
        }
      }
    } else {
      // Desktop fallback - copy to clipboard
      try {
        await navigator.clipboard.writeText(shareText)
        toast.success("Copied to clipboard", {
          description: "Share text copied - paste it in your favorite app",
        })
      } catch (error) {
        console.error("Failed to copy:", error)
      }
    }
  }

  const handleShareCode = async () => {
    const shareText = `Join my group "${createdGroup?.name}" on Ganamos!\n\nEnter group code: ${createdGroup?.group_code}`
    
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
    
    if (isMobile && navigator.share) {
      try {
        await navigator.share({
          title: `Join ${createdGroup?.name} on Ganamos`,
          text: shareText,
        })
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          console.error('Error sharing:', error)
        }
      }
    } else {
      try {
        await navigator.clipboard.writeText(shareText)
        toast.success("Copied to clipboard", {
          description: "Share text copied - paste it in your favorite app",
        })
      } catch (error) {
        console.error("Failed to copy:", error)
      }
    }
  }

  // Generate a random invite code
  const generateInviteCode = () => {
    const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
    let result = ""
    for (let i = 0; i < 10; i++) {
      result += characters.charAt(Math.floor(Math.random() * characters.length))
    }
    return result
  }

  // Generate a random 4-character group code
  const generateGroupCode = () => {
    const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
    let result = ""
    for (let i = 0; i < 4; i++) {
      result += characters.charAt(Math.floor(Math.random() * characters.length))
    }
    return result
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[425px]">
        {step === "create" ? (
          <>
            <DialogHeader>
              <DialogTitle>Create New Group</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit}>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="name">Group Name</Label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Enter group name"
                    required
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="description">Description (Optional)</Label>
                  <Textarea
                    id="description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Describe your group"
                    rows={3}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={handleClose}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? (
                    <div className="flex items-center">
                      <svg
                        className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        ></circle>
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        ></path>
                      </svg>
                      Creating...
                    </div>
                  ) : (
                    "Create Group"
                  )}
                </Button>
              </DialogFooter>
            </form>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Share {createdGroup?.name} group</DialogTitle>
            </DialogHeader>
            <div className="py-4 space-y-4">
              {/* Invite Link */}
              <div>
                <p className="text-sm font-medium mb-2 flex items-center gap-1">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                  </svg>
                  Invite Link
                </p>
                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={handleCopyLink}
                    className="flex-1 h-10 bg-gray-50 dark:bg-gray-800 rounded-md px-3 text-left text-sm font-mono truncate hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors cursor-pointer border border-transparent hover:border-gray-200 dark:hover:border-gray-600"
                  >
                    {inviteUrl}
                  </button>
                  <Button 
                    type="button"
                    variant="outline" 
                    size="icon" 
                    className="h-10 w-10 shrink-0" 
                    onClick={handleShareLink}
                    title="Share link"
                  >
                    <Share2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Group Code */}
              <div>
                <p className="text-sm font-medium mb-2 flex items-center gap-1">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                  </svg>
                  Group Code
                </p>
                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={handleCopyCode}
                    className="flex-1 h-10 bg-gray-50 dark:bg-gray-800 rounded-md flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors cursor-pointer border border-transparent hover:border-gray-200 dark:hover:border-gray-600"
                  >
                    <span className="font-mono text-xl font-bold tracking-widest">
                      {createdGroup?.group_code}
                    </span>
                  </button>
                  <Button 
                    type="button"
                    variant="outline" 
                    size="icon" 
                    className="h-10 w-10 shrink-0" 
                    onClick={handleShareCode}
                    title="Share code"
                  >
                    <Share2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>

            {/* Continue Button - matches Start button styling */}
            <Button 
              type="button"
              onClick={handleContinue}
              className="w-full h-12 bg-green-600 hover:bg-green-700 text-white text-lg font-semibold"
            >
              Continue
            </Button>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
