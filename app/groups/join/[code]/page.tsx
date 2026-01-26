"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { useAuth } from "@/components/auth-provider"
import { createBrowserSupabaseClient } from "@/lib/supabase"
import { toast } from "sonner"
import type { Group } from "@/lib/types"

export default function JoinGroupPage({ params }: { params: { code: string } }) {
  const { code } = params
  const { user, loading, activeUserId } = useAuth()
  const router = useRouter()
  const supabase = createBrowserSupabaseClient()
  
  // Use activeUserId for child accounts, fall back to user.id for main account
  const effectiveUserId = activeUserId || user?.id

  const [group, setGroup] = useState<Group | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [memberStatus, setMemberStatus] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    async function fetchGroupByCode() {
      if (loading) return

      setIsLoading(true)
      try {
        // Fetch group by invite code
        const { data: groupData, error: groupError } = await supabase
          .from("groups")
          .select("*")
          .eq("invite_code", code)
          .single()

        if (groupError) {
          console.error("Error fetching group:", groupError)
          if (groupError.code === "PGRST116") {
            // Group not found
            toast.error("Invalid invite code", {
              description: "This invite link is invalid or has expired.",
            })
            router.push("/profile")
            return
          }
          throw groupError
        }

        setGroup(groupData)

        // If user is logged in, check if they're already a member
        if (effectiveUserId) {
          const { data: memberData, error: memberError } = await supabase
            .from("group_members")
            .select("status")
            .eq("group_id", groupData.id)
            .eq("user_id", effectiveUserId)
            .single()

          if (memberError && memberError.code !== "PGRST116") {
            console.error("Error checking membership:", memberError)
            throw memberError
          }

          if (memberData) {
            setMemberStatus(memberData.status)
          }
        }
      } catch (error) {
        console.error("Error in fetchGroupByCode:", error)
        toast.error("Error", {
          description: "Failed to load group data. Please try again.",
        })
      } finally {
        setIsLoading(false)
      }
    }

    fetchGroupByCode()
  }, [code, effectiveUserId, loading, supabase, router, toast])

  const handleJoinRequest = async () => {
    if (!effectiveUserId || !group) return

    setIsSubmitting(true)
    try {
      const { error } = await supabase.from("group_members").insert({
        group_id: group.id,
        user_id: effectiveUserId,
        role: "member",
        status: "pending",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })

      if (error) throw error

      setMemberStatus("pending")
      toast.success("Request Sent", {
        description: "Your request to join this group has been sent to the admin.",
      })

      // Send email notification to group admins (fire and forget)
      fetch("/api/email/group-join-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupId: group.id, requesterId: effectiveUserId }),
      }).catch((err) => console.error("Failed to send join request email:", err))
    } catch (error) {
      console.error("Error sending join request:", error)
      toast.error("Error", {
        description: "Failed to send join request. Please try again.",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const navigateToGroup = () => {
    if (group) {
      router.push(`/groups/${group.id}`)
    }
  }

  const navigateToLogin = () => {
    // Store the current URL to redirect back after login
    if (typeof window !== "undefined") {
      localStorage.setItem("redirectAfterLogin", window.location.pathname)
    }
    router.push("/auth/login")
  }

  if (isLoading) {
    return (
      <div className="container px-4 py-6 mx-auto max-w-md">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded-md w-3/4"></div>
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded-md w-1/2"></div>
          <div className="h-32 bg-gray-200 dark:bg-gray-700 rounded-md"></div>
        </div>
      </div>
    )
  }

  if (!group) {
    return (
      <div className="container px-4 py-6 mx-auto max-w-md">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Invalid Invite Link</h1>
          <p className="mb-4">This invite link is invalid or has expired.</p>
          <Button onClick={() => router.push("/profile")}>Go to Profile</Button>
        </div>
      </div>
    )
  }

  // User is not logged in
  if (!user) {
    return (
      <div className="container px-4 py-6 mx-auto max-w-md">
        <div className="flex items-center mb-6">
          <h1 className="text-2xl font-bold">Join Group</h1>
        </div>

        <Card className="mb-6">
          <CardContent className="p-6">
            <div className="text-center mb-6">
              <h2 className="text-xl font-bold mb-2">{group.name}</h2>
              {group.description && <p className="text-muted-foreground mb-4">{group.description}</p>}
              <p className="text-sm text-muted-foreground mb-6">Please log in or sign up to join this group.</p>
              <Button className="w-full" onClick={navigateToLogin}>
                Log In to Continue
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  // User is already a member
  if (memberStatus === "approved") {
    return (
      <div className="container px-4 py-6 mx-auto max-w-md">
        <div className="flex items-center mb-6">
          <h1 className="text-2xl font-bold">Already a Member</h1>
        </div>

        <Card className="mb-6">
          <CardContent className="p-6">
            <div className="text-center mb-6">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="48"
                height="48"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="mx-auto mb-4 text-green-500"
              >
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
              <h2 className="text-xl font-bold mb-2">{group.name}</h2>
              <p className="text-muted-foreground mb-4">You are already a member of this group.</p>
              <Button onClick={navigateToGroup}>Go to Group</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  // User has a pending request
  if (memberStatus === "pending") {
    return (
      <div className="container px-4 py-6 mx-auto max-w-md">
        <div className="flex items-center mb-6">
          <h1 className="text-2xl font-bold">Pending Approval</h1>
        </div>

        <Card className="mb-6">
          <CardContent className="p-6">
            <div className="text-center mb-6">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="48"
                height="48"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="mx-auto mb-4 text-yellow-500"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" x2="12" y1="8" y2="12" />
                <line x1="12" x2="12.01" y1="16" y2="16" />
              </svg>
              <h2 className="text-xl font-bold mb-2">{group.name}</h2>
              <p className="text-muted-foreground mb-4">
                Your request to join this group is pending approval from the admin.
              </p>
              <Button variant="outline" onClick={() => router.push("/profile")}>
                Return to Profile
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  // User can request to join
  return (
    <div className="container px-4 py-6 mx-auto max-w-md">
      <div className="flex items-center mb-6">
        <h1 className="text-2xl font-bold">Join Group</h1>
      </div>

      <Card className="mb-6">
        <CardContent className="p-6">
          <div className="text-center mb-6">
            <h2 className="text-xl font-bold mb-2">{group.name}</h2>
            {group.description && <p className="text-muted-foreground mb-4">{group.description}</p>}
            <Button className="w-full" onClick={handleJoinRequest} disabled={isSubmitting}>
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
                  Requesting...
                </div>
              ) : (
                "Request to Join Group"
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
