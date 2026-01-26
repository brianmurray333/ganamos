"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { useAuth } from "@/components/auth-provider"
import { createBrowserSupabaseClient } from "@/lib/supabase"
import { toast } from "sonner"
import { v4 as uuidv4 } from "@/lib/uuid"

interface GroupSearchResult {
  id: string
  name: string
  description: string | null
  group_code: string
  memberCount: number
  created_by: string
}

export default function GroupSearchPage() {
  const [searchCode, setSearchCode] = useState("")
  const [searchResult, setSearchResult] = useState<GroupSearchResult | null>(null)
  const [isSearching, setIsSearching] = useState(false)
  const [isJoining, setIsJoining] = useState(false)
  const [searchError, setSearchError] = useState("")
  const { user, activeUserId } = useAuth()
  const router = useRouter()
  const supabase = createBrowserSupabaseClient()
  
  // Use activeUserId for child accounts, fall back to user.id for main account
  const effectiveUserId = activeUserId || user?.id

  const handleSearch = async () => {
    if (!searchCode.trim() || searchCode.length !== 4) {
      setSearchError("Please enter a 4-character group code")
      return
    }

    setIsSearching(true)
    setSearchError("")
    setSearchResult(null)

    try {
      // Search for the group by code
      const { data: groupData, error: groupError } = await supabase
        .from("groups")
        .select("*")
        .eq("group_code", searchCode.toUpperCase())
        .single()

      if (groupError || !groupData) {
        setSearchError("Group not found. Please check the code and try again.")
        return
      }

      // Get member count
      const { count: memberCount, error: countError } = await supabase
        .from("group_members")
        .select("*", { count: "exact", head: true })
        .eq("group_id", groupData.id)
        .eq("status", "approved")

      if (countError) {
        console.error("Error getting member count:", countError)
      }

      setSearchResult({
        ...groupData,
        memberCount: memberCount || 0,
      })
    } catch (error) {
      console.error("Error searching for group:", error)
      setSearchError("An error occurred while searching. Please try again.")
    } finally {
      setIsSearching(false)
    }
  }

  const handleJoinRequest = async () => {
    if (!user || !searchResult) return

    setIsJoining(true)

    try {
      // Check if user is already a member or has a pending request
      const { data: existingMember, error: memberError } = await supabase
        .from("group_members")
        .select("*")
        .eq("group_id", searchResult.id)
        .eq("user_id", effectiveUserId!)
        .single()

      if (memberError && memberError.code !== "PGRST116") {
        // PGRST116 is "not found" error, which is expected if user is not a member
        throw memberError
      }

      if (existingMember) {
        if (existingMember.status === "approved") {
          toast.error("Already a member", {
            description: "You are already a member of this group.",
          })
          return
        } else if (existingMember.status === "pending") {
          toast.error("Request pending", {
            description: "You already have a pending request to join this group.",
          })
          return
        }
      }

      // Create join request
      const now = new Date().toISOString()
      const { error: insertError } = await supabase.from("group_members").insert({
        id: uuidv4(),
        group_id: searchResult.id,
        user_id: effectiveUserId,
        role: "member",
        status: "pending",
        created_at: now,
        updated_at: now,
      })

      if (insertError) {
        throw insertError
      }

      toast.success("Request sent", {
        description: "Your request to join the group has been sent to the admin.",
      })

      // Send email notification to group admins (fire and forget)
      fetch("/api/email/group-join-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupId: searchResult.id, requesterId: effectiveUserId }),
      }).catch((err) => console.error("Failed to send join request email:", err))

      // Navigate to groups page
      router.push("/profile?tab=groups")
    } catch (error) {
      console.error("Error requesting to join group:", error)
      toast.error("Error", {
        description: "Failed to send join request. Please try again.",
      })
    } finally {
      setIsJoining(false)
    }
  }

  const handleInputChange = (value: string) => {
    // Only allow alphanumeric characters and limit to 4 characters
    const cleanValue = value
      .replace(/[^A-Za-z0-9]/g, "")
      .toUpperCase()
      .slice(0, 4)
    setSearchCode(cleanValue)
    setSearchError("")
    setSearchResult(null)
  }

  if (!user) {
    return (
      <div className="container px-4 py-6 mx-auto max-w-md">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Find Groups</h1>
          <p className="mb-4">Please sign in to search for groups.</p>
          <Button onClick={() => router.push("/auth/login")}>Sign In</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="container px-4 py-6 mx-auto max-w-md">
      <div className="flex items-center mb-6">
        <Button variant="ghost" size="sm" onClick={() => router.back()} className="mr-2">
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
            <path d="m15 18-6-6 6-6" />
          </svg>
        </Button>
        <h1 className="text-2xl font-bold">Find Groups</h1>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Search by Group Code</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="groupCode" className="text-sm font-medium">
              Enter 4-character group code
            </label>
            <div className="flex gap-2">
              <Input
                id="groupCode"
                value={searchCode}
                onChange={(e) => handleInputChange(e.target.value)}
                placeholder="ABCD"
                className="text-center text-lg font-mono tracking-widest"
                maxLength={4}
              />
              <Button onClick={handleSearch} disabled={isSearching || searchCode.length !== 4}>
                {isSearching ? (
                  <svg
                    className="animate-spin h-4 w-4"
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
                ) : (
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
                )}
              </Button>
            </div>
          </div>

          {searchError && <p className="text-sm text-red-600">{searchError}</p>}
        </CardContent>
      </Card>

      {searchResult && (
        <Card>
          <CardContent className="p-6">
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold">{searchResult.name}</h3>
                {searchResult.description && (
                  <p className="text-sm text-muted-foreground mt-1">{searchResult.description}</p>
                )}
              </div>

              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">
                  Code: {searchResult.group_code}
                </Badge>
                <Badge variant="outline" className="text-xs">
                  {searchResult.memberCount} {searchResult.memberCount === 1 ? "member" : "members"}
                </Badge>
              </div>

              <Button onClick={handleJoinRequest} disabled={isJoining} className="w-full">
                {isJoining ? (
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
                    Sending Request...
                  </div>
                ) : (
                  "Request to Join"
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="mt-8 p-4 bg-muted rounded-lg">
        <h4 className="font-medium mb-2">How to use group codes:</h4>
        <ul className="text-sm text-muted-foreground space-y-1">
          <li>• Ask a group admin for their 4-character group code</li>
          <li>• Enter the code above to find the group</li>
          <li>• Send a request to join the group</li>
          <li>• Wait for the admin to approve your request</li>
        </ul>
      </div>
    </div>
  )
}
