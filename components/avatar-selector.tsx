"use client"

import type React from "react"

import { useState } from "react"
import Image from "next/image"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/components/auth-provider"
import { toast } from "sonner"
import { createBrowserSupabaseClient } from "@/lib/supabase"
import { useRouter } from "next/navigation"

interface AvatarSelectorProps {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
}

export function AvatarSelector({ isOpen, onOpenChange }: AvatarSelectorProps) {
  const { profile, updateProfile } = useAuth()
  const router = useRouter()
  const [selectedTab, setSelectedTab] = useState("gallery")
  const [isUploading, setIsUploading] = useState(false)

  // Studio Ghibli-style animal avatar options
  const ghibliAvatars = [
    "/images/avatars/ghibli-1.png", // Fox
    "/images/avatars/ghibli-2.png", // Bunny
    "/images/avatars/ghibli-3.png", // Owl
    "/images/avatars/ghibli-4.png", // Cat
    "/images/avatars/ghibli-5.png", // Deer
    "/images/avatars/ghibli-6.png", // Bear
    "/images/avatars/ghibli-7.png", // Swan
  ]

  const handleSelectAvatar = async (avatarUrl: string) => {
    try {
      setIsUploading(true)
      await updateProfile({ avatar_url: avatarUrl })

      toast.success("Profile updated", {
        description: "Your avatar has been updated successfully",
      })
      console.log("Profile Updated toast will appear for 2000ms (2 seconds)")

      onOpenChange(false)
    } catch (error) {
      console.error("Error updating avatar:", error)
      toast.error("Error", {
        description: "Failed to update avatar",
      })
    } finally {
      setIsUploading(false)
    }
  }

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast.error("Invalid file type", {
        description: "Please select an image file",
      })
      return
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error("File too large", {
        description: "Please select an image smaller than 5MB",
      })
      return
    }

    try {
      setIsUploading(true)

      // Get current user and profile info
      const supabase = createBrowserSupabaseClient()
      const { data: { user } } = await supabase.auth.getUser()
      
      if (!user) {
        throw new Error("User not authenticated")
      }

      // Use the profile ID being updated (could be main user or connected account)
      // This comes from the auth context via updateProfile
      const profileId = profile?.id || user.id

      // Create unique filename using the profile being updated
      const fileExt = file.name.split('.').pop()
      const fileName = `${profileId}-${Date.now()}.${fileExt}`
      const filePath = fileName // Don't add 'avatars/' prefix - bucket name is already specified

      // Upload file to Supabase Storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('profile-avatars')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false
        })

      if (uploadError) {
        throw uploadError
      }

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('profile-avatars')
        .getPublicUrl(filePath)

      // Update profile with the storage URL
      await updateProfile({ avatar_url: publicUrl })

      toast.success("Profile updated", {
        description: "Your avatar has been updated successfully",
      })
      console.log("Profile Updated toast will appear for 2000ms (2 seconds)")

      onOpenChange(false)
    } catch (error) {
      console.error("Error uploading avatar:", error)
      toast.error("Error", {
        description: "Failed to update avatar. Please try again.",
      })
    } finally {
      setIsUploading(false)
    }
  }

  const handleTakePhoto = () => {
    router.push("/profile/camera")
    onOpenChange(false)
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Update Profile Picture</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="gallery" value={selectedTab} onValueChange={setSelectedTab}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="gallery">Gallery</TabsTrigger>
            <TabsTrigger value="camera">Camera</TabsTrigger>
            <TabsTrigger value="upload">Upload</TabsTrigger>
          </TabsList>

          <TabsContent value="gallery" className="mt-4">
            <div className="h-40 overflow-y-auto">
              <div className="grid grid-cols-4 gap-2">
                {ghibliAvatars.map((avatar, index) => (
                  <div
                    key={index}
                    className="relative w-16 h-16 overflow-hidden rounded-full cursor-pointer hover:opacity-80 transition-opacity"
                    onClick={() => handleSelectAvatar(avatar)}
                  >
                    <Image
                      src={avatar || "/placeholder.svg"}
                      alt={`Studio Ghibli animal avatar ${index + 1}`}
                      fill
                      className="object-cover"
                      sizes="64px"
                    />
                  </div>
                ))}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="camera" className="mt-4">
            <div className="h-40 flex flex-col items-center justify-center p-4">
              <div className="mb-4 text-center">
                <p>Take a new photo for your profile</p>
              </div>
              <Button onClick={handleTakePhoto} disabled={isUploading}>
                {isUploading ? "Processing..." : "Open Camera"}
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="upload" className="mt-4">
            <div className="h-40 flex flex-col items-center justify-center p-4">
              {isUploading ? (
                // Loading state - spinner + "Uploading..." text
                <div className="flex items-center gap-2">
                  <svg
                    className="animate-spin h-5 w-5 text-primary"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  <span className="text-sm font-medium">Uploading...</span>
                </div>
              ) : (
                // Normal state - instruction text + choose file button
                <>
                  <div className="mb-4 text-center">
                    <p>Upload a photo from your device</p>
                  </div>
                  <label htmlFor="avatar-upload" className="cursor-pointer">
                    <div className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90">
                      Choose File
                    </div>
                    <input
                      id="avatar-upload"
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleFileUpload}
                      disabled={isUploading}
                    />
                  </label>
                </>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
