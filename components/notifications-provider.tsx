"use client"

import type React from "react"

import { createContext, useContext, useEffect, useState, useRef } from "react"
import { useRouter } from "next/navigation"
import { createBrowserSupabaseClient } from "@/lib/supabase"
import { useAuth } from "@/components/auth-provider"
import { toast } from "sonner"

type NotificationsContextType = {
  pendingGroupRequests: number
  hasPendingRequests: boolean
  pendingGroupIds: string[]
  clearPendingForGroup: (groupId: string) => void
}

const NotificationsContext = createContext<NotificationsContextType>({
  pendingGroupRequests: 0,
  hasPendingRequests: false,
  pendingGroupIds: [],
  clearPendingForGroup: () => {},
})

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const supabase = createBrowserSupabaseClient()
  const router = useRouter()

  const [pendingGroupRequests, setPendingGroupRequests] = useState(0)
  const [pendingGroupIds, setPendingGroupIds] = useState<string[]>([])
  const [adminGroupIds, setAdminGroupIds] = useState<string[]>([])
  
  // Add ref to prevent concurrent fetches
  const fetchingRef = useRef(false)

  // Fetch initial pending requests
  useEffect(() => {
    if (!user || fetchingRef.current) return
    
    fetchingRef.current = true

    async function fetchPendingRequests() {
      try {
        // First, get all groups where the user is an admin
        const { data: adminGroups, error: adminError } = await supabase
          .from("group_members")
          .select("group_id")
          .eq("user_id", user.id)
          .eq("role", "admin")

        if (adminError) throw adminError

        if (!adminGroups?.length) return

        const groupIds = adminGroups.map((g) => g.group_id)
        setAdminGroupIds(groupIds)

        // Then, get all pending requests for those groups
        const { data: pendingData, error: pendingError } = await supabase
          .from("group_members")
          .select(`
            id,
            group_id,
            user_id,
            status,
            profile:user_id(name)
          `)
          .in("group_id", groupIds)
          .eq("status", "pending")

        if (pendingError) throw pendingError

        // Count total pending requests
        setPendingGroupRequests(pendingData?.length || 0)

        // Get unique group IDs with pending requests
        const uniqueGroupIds = [...new Set(pendingData?.map((item) => item.group_id) || [])]
        setPendingGroupIds(uniqueGroupIds)
      } catch (error) {
        console.error("Error fetching pending requests:", error)
      } finally {
        fetchingRef.current = false
      }
    }

    fetchPendingRequests()
  }, [user, supabase])

  // Set up realtime subscription for new join requests
  useEffect(() => {
    if (!user || !adminGroupIds.length) return

    const channel = supabase
      .channel("group-join-requests")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "group_members",
          filter: `status=eq.pending`,
        },
        async (payload) => {
          const { group_id, user_id } = payload.new

          // Check if the current user is an admin of this group
          if (adminGroupIds.includes(group_id)) {
            // Fetch the requesting user's name
            const { data: userData } = await supabase.from("profiles").select("name").eq("id", user_id).single()

            const userName = userData?.name || "Someone"

            // Show toast notification
            toast("New Join Request", {
              description: `${userName} has requested to join your group`,
              action: {
                label: "Review",
                onClick: () => router.push(`/groups/${group_id}`),
              },
            })

            // Update pending counts
            setPendingGroupRequests((prev) => prev + 1)
            if (!pendingGroupIds.includes(group_id)) {
              setPendingGroupIds((prev) => [...prev, group_id])
            }
          }
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [user, adminGroupIds, supabase, toast, router, pendingGroupIds])

  // Function to clear pending indicator for a specific group
  const clearPendingForGroup = (groupId: string) => {
    setPendingGroupIds((prev) => prev.filter((id) => id !== groupId))
    // Recalculate total pending count
    setPendingGroupRequests((prev) => Math.max(0, prev - 1))
  }

  return (
    <NotificationsContext.Provider
      value={{
        pendingGroupRequests,
        hasPendingRequests: pendingGroupRequests > 0,
        pendingGroupIds,
        clearPendingForGroup,
      }}
    >
      {children}
    </NotificationsContext.Provider>
  )
}

export const useNotifications = () => {
  const context = useContext(NotificationsContext)
  if (context === undefined) {
    throw new Error("useNotifications must be used within a NotificationsProvider")
  }
  return context
}
