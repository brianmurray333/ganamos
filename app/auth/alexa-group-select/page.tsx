"use client"

import { useState, useEffect, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent } from "@/components/ui/card"
import { useAuth } from "@/components/auth-provider"
import { createBrowserSupabaseClient } from "@/lib/supabase"
import { toast } from "sonner"
import { Mic, Users, Search, Check, Loader2 } from "lucide-react"
import Image from "next/image"

interface Group {
  id: string
  name: string
  description?: string
  group_code: string
  memberCount?: number
}

function AlexaGroupSelectContent() {
  const [groups, setGroups] = useState<Group[]>([])
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [searchCode, setSearchCode] = useState("")
  const [isSearching, setIsSearching] = useState(false)
  const [searchResult, setSearchResult] = useState<Group | null>(null)
  const [searchError, setSearchError] = useState("")
  
  const { user, profile } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createBrowserSupabaseClient()
  
  // OAuth parameters
  const clientId = searchParams.get("client_id")
  const redirectUri = searchParams.get("redirect_uri")
  const state = searchParams.get("state")

  // Fetch user's groups
  useEffect(() => {
    const fetchGroups = async () => {
      if (!user) return
      
      try {
        const { data: memberships, error } = await supabase
          .from("group_members")
          .select(`
            group_id,
            groups:group_id (
              id,
              name,
              description,
              group_code
            )
          `)
          .eq("user_id", user.id)
          .eq("status", "approved")
        
        if (error) {
          console.error("Error fetching groups:", error)
          return
        }
        
        const userGroups = memberships
          ?.map((m: any) => m.groups)
          .filter(Boolean) as Group[]
        
        setGroups(userGroups || [])
      } catch (error) {
        console.error("Error fetching groups:", error)
      } finally {
        setIsLoading(false)
      }
    }
    
    fetchGroups()
  }, [user, supabase])

  // Search for group by code
  const handleSearch = async () => {
    if (!searchCode.trim() || searchCode.length !== 4) {
      setSearchError("Please enter a 4-character group code")
      return
    }

    setIsSearching(true)
    setSearchError("")
    setSearchResult(null)

    try {
      const { data: groupData, error: groupError } = await supabase
        .from("groups")
        .select("id, name, description, group_code")
        .eq("group_code", searchCode.toUpperCase())
        .single()

      if (groupError || !groupData) {
        setSearchError("Group not found. Please check the code and try again.")
        return
      }

      // Check if already a member
      const isMember = groups.some(g => g.id === groupData.id)
      if (isMember) {
        setSearchError("You're already a member of this group!")
        return
      }

      setSearchResult(groupData)
    } catch (error) {
      console.error("Error searching for group:", error)
      setSearchError("An error occurred while searching. Please try again.")
    } finally {
      setIsSearching(false)
    }
  }

  // Request to join a group
  const handleJoinRequest = async () => {
    if (!searchResult || !user) return
    
    setIsSubmitting(true)
    
    try {
      // Check if already has a pending request
      const { data: existingRequest } = await supabase
        .from("group_members")
        .select("id, status")
        .eq("group_id", searchResult.id)
        .eq("user_id", user.id)
        .single()

      if (existingRequest) {
        if (existingRequest.status === "pending") {
          toast.info("Request Pending", {
            description: "Your request to join this group is already pending approval."
          })
        } else if (existingRequest.status === "approved") {
          toast.info("Already a Member", {
            description: "You're already a member of this group!"
          })
        }
        setSearchResult(null)
        setSearchCode("")
        return
      }

      // Create join request
      const { error: insertError } = await supabase.from("group_members").insert({
        group_id: searchResult.id,
        user_id: user.id,
        role: "member",
        status: "pending",
      })

      if (insertError) {
        throw insertError
      }

      toast.success("Request Sent", {
        description: `Your request to join "${searchResult.name}" has been sent. You'll be able to select it here once approved.`
      })
      
      setSearchResult(null)
      setSearchCode("")
    } catch (error) {
      console.error("Error requesting to join group:", error)
      toast.error("Failed to send request", {
        description: "Please try again later."
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  // Complete the OAuth flow
  const handleComplete = async () => {
    if (!selectedGroupId || !clientId || !redirectUri) {
      toast.error("Please select a group")
      return
    }
    
    setIsSubmitting(true)
    
    try {
      // Call the authorize endpoint to get the auth code
      // This will store the selected group and generate the code
      const response = await fetch(`/api/alexa/complete-linking`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          groupId: selectedGroupId,
          clientId,
          redirectUri,
          state,
        }),
      })
      
      const data = await response.json()
      
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to complete linking")
      }
      
      // Redirect to Alexa with the authorization code
      window.location.href = data.redirectUrl
    } catch (error: any) {
      console.error("Error completing linking:", error)
      toast.error("Failed to link account", {
        description: error.message || "Please try again."
      })
      setIsSubmitting(false)
    }
  }

  if (!user) {
    router.push(`/auth/alexa-login?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri || '')}&state=${state || ''}`)
    return null
  }

  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center">
      {/* Background */}
      <div className="fixed inset-0 z-0">
        <div className="absolute inset-0">
          <img
            src="/images/community-fixing.jpg"
            alt="Person fixing a fence in a community"
            className="w-full h-full object-cover"
          />
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-white/95 dark:from-black/95 via-white/60 dark:via-black/60 to-white/30 dark:to-black/30" />
      </div>

      <div className="w-full max-w-md px-4 z-10 py-8">
        <div className="bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm p-6 rounded-lg shadow-lg space-y-6">
          {/* Header - inside modal */}
          <div className="space-y-2 text-center">
            <div className="flex items-center justify-center gap-3">
              <Mic className="h-8 w-8 text-primary" />
              <h1 className="text-2xl font-bold">Select a Group</h1>
            </div>
            <p className="text-muted-foreground">
              Choose which group Alexa will manage jobs for
            </p>
          </div>
          {/* User info */}
          <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <div className="relative w-10 h-10 overflow-hidden rounded-full">
              <Image
                src={profile?.avatar_url || "/placeholder-user.jpg"}
                alt={profile?.name || "User"}
                fill
                className="object-cover"
              />
            </div>
            <div>
              <p className="font-medium">{profile?.name}</p>
              <p className="text-sm text-muted-foreground">{profile?.email}</p>
            </div>
          </div>

          {/* Groups list */}
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : groups.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground">
              <Users className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>You're not a member of any groups yet.</p>
              <p className="text-sm mt-1">Search for a group below to join one.</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {groups.map((group) => (
                <div
                  key={group.id}
                  className={`cursor-pointer transition-all rounded-lg border p-4 flex items-center justify-between ${
                    selectedGroupId === group.id
                      ? "border-primary ring-2 ring-primary/20 bg-primary/5"
                      : "border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"
                  }`}
                  onClick={() => setSelectedGroupId(group.id)}
                >
                  <div>
                    <p className="font-medium">{group.name}</p>
                    <p className="text-xs text-muted-foreground">
                      Code: {group.group_code}
                    </p>
                  </div>
                  {selectedGroupId === group.id && (
                    <Check className="h-5 w-5 text-primary" />
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Search for group */}
          <div className="border-t pt-4">
            <Label className="text-sm font-medium">Join a new group</Label>
            <div className="flex gap-2 mt-2">
              <Input
                placeholder="4-letter code"
                value={searchCode}
                onChange={(e) => setSearchCode(e.target.value.toUpperCase())}
                maxLength={4}
                className="uppercase"
              />
              <Button
                variant="outline"
                onClick={handleSearch}
                disabled={isSearching || searchCode.length !== 4}
              >
                {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              </Button>
            </div>
            {searchError && (
              <p className="text-sm text-red-500 mt-2">{searchError}</p>
            )}
            {searchResult && (
              <Card className="mt-3 bg-green-50 dark:bg-green-900/30 border-green-200">
                <CardContent className="p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{searchResult.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {searchResult.description || "No description"}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      onClick={handleJoinRequest}
                      disabled={isSubmitting}
                    >
                      {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Request to Join"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Complete button */}
          <Button
            className="w-full"
            onClick={handleComplete}
            disabled={!selectedGroupId || isSubmitting}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Linking...
              </>
            ) : (
              <>
                <Mic className="h-4 w-4 mr-2" />
                Complete Alexa Setup
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}

export default function AlexaGroupSelectPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    }>
      <AlexaGroupSelectContent />
    </Suspense>
  )
}


