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

      // Call the success callback with the new group
      onSuccess({
        ...groupData,
        memberCount: 1,
      })

      // Reset form
      setName("")
      setDescription("")
    } catch (error) {
      console.error("Error creating group:", error)
      toast.error("Error", {
        description: "There was an error creating your group. Please try again.",
      })
    } finally {
      setIsSubmitting(false)
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
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
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
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
      </DialogContent>
    </Dialog>
  )
}
