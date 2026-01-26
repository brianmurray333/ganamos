"use client"

import type React from "react"

import { useState, useEffect, useCallback, useRef } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useAuth } from "@/components/auth-provider"
import { createBrowserSupabaseClient } from "@/lib/supabase"
import { toast } from "sonner"
import Image from "next/image"
import { QrCode, User } from "lucide-react"
import { QRScanner } from "@/components/qr-scanner"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"

type SearchedProfile = { id: string; username: string; name: string; avatar_url: string | null }

interface AddConnectedAccountDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onAccountAdded: (addedProfile?: SearchedProfile) => void
}

export function AddConnectedAccountDialog({ open, onOpenChange, onAccountAdded }: AddConnectedAccountDialogProps) {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [showEmailForm, setShowEmailForm] = useState(false)
  const [showChildAccountForm, setShowChildAccountForm] = useState(false)
  const [showQRScanner, setShowQRScanner] = useState(false)
  const [showUsernameSearch, setShowUsernameSearch] = useState(false)
  const [usernameQuery, setUsernameQuery] = useState("")
  const [searchResults, setSearchResults] = useState<SearchedProfile[]>([])
  const [searchedProfile, setSearchedProfile] = useState<SearchedProfile | null>(null)
  const [usernameSearchError, setUsernameSearchError] = useState<string | null>(null)
  const [childUsername, setChildUsername] = useState("")
  const [selectedAvatar, setSelectedAvatar] = useState("")
  const { user } = useAuth()
  const supabase = createBrowserSupabaseClient()
  const [loadedImages, setLoadedImages] = useState<Record<string, boolean>>({})
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const [isSearching, setIsSearching] = useState(false)

  // Preload avatar images when dialog opens
  useEffect(() => {
    if (open && typeof window !== "undefined") {
      try {
        ghibliAvatars.forEach((src) => {
          const img = document.createElement('img')
          img.src = src
        })
      } catch (error) {
        console.warn("Failed to preload avatar images:", error)
      }
    }
  }, [open])

  // Studio Ghibli-style animal avatar options (7 images + camera option)
  const ghibliAvatars = [
    "/images/avatars/ghibli-1.png", // Fox
    "/images/avatars/ghibli-2.png", // Bunny
    "/images/avatars/ghibli-3.png", // Owl
    "/images/avatars/ghibli-4.png", // Cat
    "/images/avatars/ghibli-5.png", // Deer
    "/images/avatars/ghibli-6.png", // Bear
    "/images/avatars/ghibli-7.png", // Swan
  ]

  const handleGoogleConnect = async () => {
    setIsLoading(true)
    try {
      // For now, show a message that this feature is coming soon
      toast("Coming Soon", {
        description: "Google account connection will be available soon. Please use email/password for now.",
      })
    } catch (error) {
      console.error("Error connecting Google account:", error)
      toast.error("Error", {
        description: "Failed to connect Google account",
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleEmailConnect = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) return

    setIsLoading(true)
    try {
      // Get the user profile for the email (no password verification for now)
      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("*")
        .eq("email", email)
        .single()

      if (profileError || !profileData) {
        toast.error("Account Not Found", {
          description: "No profile found for this email address.",
        })
        setIsLoading(false)
        return
      }

      // Check if this account is already connected
      const { data: existingConnection } = await supabase
        .from("connected_accounts")
        .select("id")
        .eq("primary_user_id", user.id)
        .eq("connected_user_id", profileData.id)
        .single()

      if (existingConnection) {
        toast("Already Connected", {
          description: "This account is already connected to your profile.",
        })
        setIsLoading(false)
        return
      }

      // Create the connection
      const { error: connectionError } = await supabase.from("connected_accounts").insert({
        primary_user_id: user.id,
        connected_user_id: profileData.id,
      })

      if (connectionError) {
        throw connectionError
      }

      toast.success("Account Connected", {
        description: `Successfully connected ${profileData.name}'s account.`,
      })

      // Reset form and close dialog
      setEmail("")
      setPassword("")
      setShowEmailForm(false)
      onOpenChange(false)
      
      // Refresh connected accounts without changing current session
      onAccountAdded()
    } catch (error) {
      console.error("Error connecting account:", error)
      toast.error("Connection Failed", {
        description: "Failed to connect the account. Please try again.",
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleQRScan = async (scannedData: string) => {
    if (!user) return

    setIsLoading(true)
    try {
      // Check if scanned data is a UUID or username
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      const isUUID = uuidRegex.test(scannedData)
      
      // Get the profile by username or user ID
      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("*")
        .eq(isUUID ? "id" : "username", scannedData)
        .single()

      if (profileError || !profileData) {
        toast.error("Account Not Found", {
          description: "No account found for this QR code.",
        })
        setShowQRScanner(false)
        setIsLoading(false)
        return
      }

      // Check if already in family members
      const { data: existingMember } = await supabase
        .from("family_members")
        .select("id")
        .eq("user_id", user.id)
        .eq("member_id", profileData.id)
        .single()

      if (existingMember) {
        toast("Already Added", {
          description: "This person is already in your family.",
        })
        setShowQRScanner(false)
        setIsLoading(false)
        return
      }

      // Add to family_members (NOT connected_accounts - no profile toggling)
      const { error: insertError } = await supabase.from("family_members").insert({
        user_id: user.id,
        member_id: profileData.id,
      })

      if (insertError) {
        throw insertError
      }

      toast.success("Added to Family", {
        description: `${profileData.name} added to your family via QR code.`,
      })

      // Close scanner and dialog
      setShowQRScanner(false)
      onOpenChange(false)
      onAccountAdded()

    } catch (error) {
      console.error("Error adding family member via QR:", error)
      toast.error("Failed to Add", {
        description: "Failed to add family member. Please try again.",
      })
      setShowQRScanner(false)
    } finally {
      setIsLoading(false)
    }
  }

  // Typeahead search with debounce
  const performTypeaheadSearch = useCallback(async (query: string) => {
    if (!query.trim() || query.length < 2) {
      setSearchResults([])
      return
    }

    setIsSearching(true)
    try {
      const cleanQuery = query.startsWith('@') ? query.substring(1) : query

      const { data: profiles, error } = await supabase
        .from("profiles")
        .select("id, username, name, avatar_url")
        .or(`username.ilike.%${cleanQuery.toLowerCase()}%,name.ilike.%${cleanQuery}%`)
        .neq("id", user?.id || "")
        .limit(5)

      if (error) {
        console.error("Error in typeahead search:", error)
        return
      }

      setSearchResults(profiles || [])
    } catch (error) {
      console.error("Error in typeahead search:", error)
    } finally {
      setIsSearching(false)
    }
  }, [supabase, user?.id])

  // Handle input change with debounced typeahead
  const handleUsernameInputChange = useCallback((value: string) => {
    setUsernameQuery(value)
    setUsernameSearchError(null)
    setSearchedProfile(null)

    // Clear existing timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current)
    }

    // Debounce the search
    searchTimeoutRef.current = setTimeout(() => {
      performTypeaheadSearch(value)
    }, 300)
  }, [performTypeaheadSearch])

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current)
      }
    }
  }, [])

  const handleUsernameSearch = async () => {
    if (!usernameQuery.trim()) {
      setUsernameSearchError("Please enter a username")
      return
    }

    setIsLoading(true)
    setUsernameSearchError(null)
    setSearchedProfile(null)

    try {
      // Clean the username (remove @ if present)
      const cleanUsername = usernameQuery.startsWith('@') ? usernameQuery.substring(1) : usernameQuery

      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("id, username, name, avatar_url")
        .eq("username", cleanUsername.toLowerCase())
        .single()

      if (profileError || !profileData) {
        setUsernameSearchError(`No user found with username "${cleanUsername}"`)
        return
      }

      setSearchedProfile(profileData)
      setSearchResults([]) // Clear typeahead results when exact match is found
    } catch (error) {
      console.error("Error searching for user:", error)
      setUsernameSearchError("An error occurred while searching")
    } finally {
      setIsLoading(false)
    }
  }

  // Connect a user by profile - can be called from typeahead directly or from confirmation view
  const connectUserByProfile = async (profileToAdd: SearchedProfile) => {
    if (!user) return

    setIsLoading(true)
    try {
      // Check if already in family members
      const { data: existingMember } = await supabase
        .from("family_members")
        .select("id")
        .eq("user_id", user.id)
        .eq("member_id", profileToAdd.id)
        .single()

      if (existingMember) {
        toast("Already Added", {
          description: "This person is already in your family.",
        })
        setIsLoading(false)
        return
      }

      // Add to family_members (NOT connected_accounts - no profile toggling)
      const { error: insertError } = await supabase.from("family_members").insert({
        user_id: user.id,
        member_id: profileToAdd.id,
      })

      if (insertError) {
        throw insertError
      }

      toast.success("Added to Family", {
        description: `${profileToAdd.name} added to your family for quick sending.`,
      })

      // Reset and close
      setUsernameQuery("")
      setSearchedProfile(null)
      setSearchResults([])
      setShowUsernameSearch(false)
      onOpenChange(false)
      // Pass the added profile back so family section can update immediately
      onAccountAdded(profileToAdd)
    } catch (error) {
      console.error("Error adding family member:", error)
      toast.error("Failed to Add", {
        description: "Failed to add family member. Please try again.",
      })
    } finally {
      setIsLoading(false)
    }
  }

  // Wrapper for the confirmation view's Add button
  const handleConnectSearchedUser = async () => {
    if (!searchedProfile) return
    await connectUserByProfile(searchedProfile)
  }

  const handleCreateChildAccount = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) return

    setIsLoading(true)
    try {
      // Call the API route to create the child account
      const response = await fetch("/api/child-account", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: childUsername,
          avatarUrl: selectedAvatar,
          primaryUserId: user.id,
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || "Failed to create child account")
      }

      toast.success("Child Account Created", {
        description: `Successfully created ${result.profile.name}'s account.`,
      })

      // Reset form and close dialog
      setChildUsername("")
      setSelectedAvatar("")
      setShowChildAccountForm(false)
      onOpenChange(false)
      onAccountAdded()
    } catch (error) {
      console.error("Error creating child account:", error)
      toast.error("Creation Failed", {
        description: "Failed to create the child account. Please try again.",
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    try {
      // In a real app, you would upload the file to storage
      // For now, we'll use a URL.createObjectURL as a placeholder
      const avatarUrl = URL.createObjectURL(file)
      setSelectedAvatar(avatarUrl)
    } catch (error) {
      console.error("Error uploading avatar:", error)
      toast.error("Error", {
        description: "Failed to upload avatar",
      })
    }
  }

  const handleClose = () => {
    setEmail("")
    setPassword("")
    setShowEmailForm(false)
    setShowChildAccountForm(false)
    setShowUsernameSearch(false)
    setUsernameQuery("")
    setSearchedProfile(null)
    setSearchResults([])
    setUsernameSearchError(null)
    setChildUsername("")
    setSelectedAvatar("")
    onOpenChange(false)
  }

  // Determine the dialog title based on current view
  const getDialogTitle = () => {
    if (showUsernameSearch) return "Find User"
    if (showChildAccountForm) return "Create Child Account"
    if (showEmailForm) return "Connect by Email"
    if (showQRScanner) return "Scan QR Code"
    return "Add Connected Account"
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{getDialogTitle()}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {showChildAccountForm ? (
            <form onSubmit={handleCreateChildAccount} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="child-username">Username</Label>
                <Input
                  id="child-username"
                  type="text"
                  placeholder="Enter username"
                  value={childUsername}
                  onChange={(e) => setChildUsername(e.target.value)}
                  required
                  disabled={isLoading}
                />
              </div>

              <div className="space-y-2">
                <Label>Choose Avatar</Label>
                <div className="grid grid-cols-4 gap-2">
                  {ghibliAvatars.map((avatar, index) => (
                    <div
                      key={index}
                      className={`relative w-16 h-16 overflow-hidden rounded-full cursor-pointer border-2 transition-all ${
                        selectedAvatar === avatar
                          ? "border-primary ring-2 ring-primary/20"
                          : "border-gray-200 hover:border-gray-300"
                      }`}
                      onClick={() => setSelectedAvatar(avatar)}
                    >
                      {!loadedImages[avatar] && (
                        <div className="absolute inset-0 bg-gray-200 animate-pulse rounded-full" />
                      )}
                      <Image
                        src={avatar || "/placeholder.svg"}
                        alt={`Studio Ghibli animal avatar ${index + 1}`}
                        fill
                        className="object-cover"
                        sizes="64px"
                        priority={index < 4}
                        loading={index < 4 ? "eager" : "lazy"}
                        onLoad={() => setLoadedImages((prev) => ({ ...prev, [avatar]: true }))}
                      />
                    </div>
                  ))}

                  {/* Camera option as 8th slot */}
                  <label
                    htmlFor="child-avatar-upload"
                    className={`relative w-16 h-16 overflow-hidden rounded-full cursor-pointer border-2 transition-all flex items-center justify-center bg-gray-100 hover:bg-gray-200 ${
                      selectedAvatar && !ghibliAvatars.includes(selectedAvatar)
                        ? "border-primary ring-2 ring-primary/20"
                        : "border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="text-gray-600"
                    >
                      <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
                      <circle cx="12" cy="13" r="3" />
                    </svg>
                    <input
                      id="child-avatar-upload"
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleFileUpload}
                    />
                  </label>
                </div>
                {selectedAvatar && !ghibliAvatars.includes(selectedAvatar) && (
                  <p className="text-sm text-green-600">Custom photo selected</p>
                )}
              </div>

              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowChildAccountForm(false)}
                  disabled={isLoading}
                  className="flex-1"
                >
                  Back
                </Button>
                <Button
                  type="submit"
                  disabled={isLoading || !selectedAvatar || !childUsername.trim()}
                  className="flex-1"
                >
                  {isLoading ? "Creating..." : "Create Account"}
                </Button>
              </div>
            </form>
          ) : showUsernameSearch ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="username-search">Username</Label>
                <div className="flex gap-2">
                  <Input
                    id="username-search"
                    type="text"
                    placeholder="@username"
                    value={usernameQuery}
                    onChange={(e) => handleUsernameInputChange(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        handleUsernameSearch()
                      }
                    }}
                    disabled={isLoading}
                  />
                  <Button
                    type="button"
                    onClick={handleUsernameSearch}
                    disabled={isLoading || !usernameQuery.trim()}
                    className="text-white"
                  >
                    {isLoading ? "..." : "Search"}
                  </Button>
                </div>
                {usernameSearchError && (
                  <p className="text-sm text-red-500">{usernameSearchError}</p>
                )}
              </div>

              {/* Typeahead search results */}
              {searchResults.length > 0 && !searchedProfile && (
                <div className="space-y-2">
                  {searchResults.map((profile) => (
                    <div
                      key={profile.id}
                      className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                      onClick={() => connectUserByProfile(profile)}
                    >
                      <div className="flex items-center gap-3">
                        <Avatar className="w-12 h-12">
                          <AvatarImage
                            src={profile.avatar_url ?? undefined}
                            alt={profile.name || "User"}
                            className="object-cover"
                          />
                          <AvatarFallback>
                            <User className="h-5 w-5" />
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1">
                          <p className="font-medium">{profile.name}</p>
                          <p className="text-sm text-muted-foreground">@{profile.username}</p>
                        </div>
                        <Button
                          onClick={(e) => {
                            e.stopPropagation()
                            connectUserByProfile(profile)
                          }}
                          size="sm"
                          className="text-white"
                          disabled={isLoading}
                        >
                          {isLoading ? "..." : "Add"}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Show loading state for typeahead */}
              {isSearching && usernameQuery.length >= 2 && (
                <p className="text-sm text-muted-foreground">Searching...</p>
              )}

              {/* Selected profile from exact search or typeahead selection */}
              {searchedProfile && (
                <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <div className="flex items-center gap-3">
                    <Avatar className="w-12 h-12">
                      <AvatarImage
                        src={searchedProfile.avatar_url ?? undefined}
                        alt={searchedProfile.name || "User"}
                        className="object-cover"
                      />
                      <AvatarFallback>
                        <User className="h-5 w-5" />
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <p className="font-medium">{searchedProfile.name}</p>
                      <p className="text-sm text-muted-foreground">@{searchedProfile.username}</p>
                    </div>
                    <Button
                      onClick={handleConnectSearchedUser}
                      disabled={isLoading}
                      size="sm"
                      className="text-white"
                    >
                      {isLoading ? "..." : "Add"}
                    </Button>
                  </div>
                </div>
              )}

              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setShowUsernameSearch(false)
                  setUsernameQuery("")
                  setSearchedProfile(null)
                  setSearchResults([])
                  setUsernameSearchError(null)
                }}
                disabled={isLoading}
                className="w-full"
              >
                Back
              </Button>
            </div>
          ) : showEmailForm ? (
            <form onSubmit={handleEmailConnect} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="connect-email">Email</Label>
                <Input
                  id="connect-email"
                  type="email"
                  placeholder="their@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={isLoading}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="connect-password">Password</Label>
                <Input
                  id="connect-password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={isLoading}
                />
              </div>

              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowEmailForm(false)}
                  disabled={isLoading}
                  className="flex-1"
                >
                  Back
                </Button>
                <Button type="submit" disabled={isLoading} className="flex-1">
                  {isLoading ? "Connecting..." : "Connect Account"}
                </Button>
              </div>
            </form>
          ) : (
            <div className="space-y-4">
              <Button
                className="w-full flex items-center justify-center gap-2"
                variant="default"
                onClick={() => setShowQRScanner(true)}
                disabled={isLoading}
              >
                <QrCode className="h-4 w-4" />
                Scan QR Code
              </Button>

              <Button
                className="w-full flex items-center justify-center gap-2"
                variant="secondary"
                onClick={() => setShowUsernameSearch(true)}
                disabled={isLoading}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="11" cy="11" r="8" />
                  <path d="m21 21-4.3-4.3" />
                </svg>
                Find by Username
              </Button>

              <Button
                className="w-full"
                variant="outline"
                onClick={() => setShowChildAccountForm(true)}
                disabled={isLoading}
              >
                Create Child Account
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
      
      {/* QR Scanner */}
      <QRScanner
        isOpen={showQRScanner}
        onScan={handleQRScan}
        onClose={() => setShowQRScanner(false)}
      />
    </Dialog>
  )
}
