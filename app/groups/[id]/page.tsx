"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { PostCard } from "@/components/post-card"
import { useAuth } from "@/components/auth-provider"
import { createBrowserSupabaseClient } from "@/lib/supabase"
import { toast } from "sonner"
import { formatDistanceToNow } from "date-fns"
import { Share2 } from "lucide-react"
import type { Group, GroupMember, Post } from "@/lib/types"

export default function GroupPage({ params }: { params: { id: string } }) {
  const { id: groupId } = params
  const { user, activeUserId } = useAuth()
  const router = useRouter()
  const supabase = createBrowserSupabaseClient()
  // NotificationsProvider removed - clearPendingForGroup disabled
  const clearPendingForGroup = () => {}
  
  // Use activeUserId for child accounts, fall back to user.id for main account
  const effectiveUserId = activeUserId || user?.id

  const [group, setGroup] = useState<Group | null>(null)
  const [members, setMembers] = useState<GroupMember[]>([])
  const [posts, setPosts] = useState<Post[]>([])
  const [pendingMembers, setPendingMembers] = useState<GroupMember[]>([])
  const [userRole, setUserRole] = useState<string | null>(null)
  const [userStatus, setUserStatus] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState("members")
  const [postFilter, setPostFilter] = useState<"all" | "open" | "in_review" | "fixed">("all")
  const [showInviteDialog, setShowInviteDialog] = useState(false)
  const [inviteUrl, setInviteUrl] = useState("")
  
  // Admin group management
  const [showRenameDialog, setShowRenameDialog] = useState(false)
  const [showAppointAdminDialog, setShowAppointAdminDialog] = useState(false)
  const [showDeleteGroupDialog, setShowDeleteGroupDialog] = useState(false)
  const [showDeleteConfirmDialog, setShowDeleteConfirmDialog] = useState(false)
  const [newGroupName, setNewGroupName] = useState("")
  const [selectedNewAdmin, setSelectedNewAdmin] = useState<string | null>(null)
  const [isRegeneratingCode, setIsRegeneratingCode] = useState(false)
  const [isRenamingGroup, setIsRenamingGroup] = useState(false)
  const [isDeletingGroup, setIsDeletingGroup] = useState(false)
  const [isAppointingAdmin, setIsAppointingAdmin] = useState(false)
  
  // Track if initial data was loaded to prevent refetch on app resume
  const initialDataLoaded = useRef(false)

  useEffect(() => {
    if (!user) return
    
    // Skip refetch if data was already loaded (prevents refresh on app background/foreground)
    if (initialDataLoaded.current && group) return

    async function fetchGroupData() {
      // Validate that groupId is a valid UUID
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      if (!uuidRegex.test(groupId)) {
        console.error("Invalid group ID format:", groupId)
        toast.error("Invalid Group", {
          description: "The group link is invalid or malformed.",
        })
        router.push("/profile")
        return
      }

      setLoading(true)
      try {
        // Parallel fetch: group details and user membership
        const [groupResult, memberResult] = await Promise.all([
          supabase
            .from("groups")
            .select("*")
            .eq("id", groupId)
            .single(),
          supabase
            .from("group_members")
            .select("*")
            .eq("group_id", groupId)
            .eq("user_id", effectiveUserId!)
            .single()
        ])

        const { data: groupData, error: groupError } = groupResult
        const { data: memberData, error: memberError } = memberResult

        if (groupError) {
          console.error("Error fetching group:", groupError)
          if (groupError.code === "PGRST116") {
            toast.error("Group not found", {
              description: "The group you're looking for doesn't exist or has been deleted.",
            })
            router.push("/profile")
            return
          }
          throw groupError
        }

        setGroup(groupData)

        // Handle member data (error is expected if user is not a member)
        if (memberError && memberError.code !== "PGRST116") {
          console.error("Error checking membership:", memberError)
          throw memberError
        }

        if (memberData) {
          setUserRole(memberData.role)
          setUserStatus(memberData.status)
        }

        // If user is approved member, fetch additional data in parallel
        if (memberData && memberData.status === "approved") {
          const queries = [
            // Always fetch approved members
            supabase
              .from("group_members")
              .select(`
                id,
                group_id,
                user_id,
                role,
                status,
                created_at,
                updated_at,
                profile:user_id(name, avatar_url)
              `)
              .eq("group_id", groupId)
              .eq("status", "approved"),
            
            // Always fetch posts
            supabase
              .from("posts")
              .select(`
                *,
                group:group_id(
                  id,
                  name,
                  description
                ),
                assigned_to_user:assigned_to(
                  id,
                  name
                )
              `)
              .eq("group_id", groupId)
              .is("deleted_at", null)
              .order("created_at", { ascending: false })
              .limit(20) // Limit posts for better performance
          ]

          // Only fetch pending members if user is admin
          if (memberData.role === "admin") {
            queries.push(
              supabase
                .from("group_members")
                .select(`
                  id,
                  group_id,
                  user_id,
                  role,
                  status,
                  created_at,
                  updated_at,
                  profile:user_id(name, avatar_url)
                `)
                .eq("group_id", groupId)
                .eq("status", "pending")
            )
          }

          const results = await Promise.all(queries)
          
          const { data: approvedMembers, error: approvedError } = results[0]
          const { data: postsData, error: postsError } = results[1]
          const pendingResult = results[2] // Only exists if user is admin

          if (approvedError) {
            console.error("Error fetching members:", approvedError)
            throw approvedError
          }

          if (postsError) {
            console.error("Error fetching posts:", postsError)
            throw postsError
          }

          setMembers(approvedMembers as GroupMember[] || [])
          setPosts(postsData as Post[] || [])

          // Handle pending members if user is admin
          if (pendingResult) {
            const { data: pendingData, error: pendingError } = pendingResult
            if (pendingError) {
              console.error("Error fetching pending members:", pendingError)
              throw pendingError
            }

            setPendingMembers(pendingData as GroupMember[] || [])

            // Clear notification if viewing members tab with pending requests
            if (pendingData && pendingData.length > 0 && activeTab === "members") {
              clearPendingForGroup(groupId)
            }
          }
        }

        // Generate invite URL
        if (groupData) {
          const baseUrl = window.location.origin
          setInviteUrl(`${baseUrl}/groups/join/${groupData.invite_code}`)
        }
        // Mark as loaded after successful fetch
        initialDataLoaded.current = true
      } catch (error) {
        console.error("Error in fetchGroupData:", error)
        toast.error("Error", {
          description: "Failed to load group data. Please try again.",
        })
      } finally {
        setLoading(false)
      }
    }

    fetchGroupData()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId, user, effectiveUserId])

  // Clear notification when switching to members tab
  useEffect(() => {
    if (activeTab === "members" && pendingMembers.length > 0 && userRole === "admin") {
      clearPendingForGroup(groupId)
    }
  }, [activeTab, pendingMembers.length, userRole, groupId, clearPendingForGroup])

  const handleJoinRequest = async () => {
    if (!effectiveUserId || !group) return

    try {
      const { error } = await supabase.from("group_members").insert({
        group_id: groupId,
        user_id: effectiveUserId,
        role: "member",
        status: "pending",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })

      if (error) throw error

      setUserStatus("pending")
      toast.success("Request Sent", {
        description: "Your request to join this group has been sent to the admin.",
      })

      // Send email notification to group admins (fire and forget)
      fetch("/api/email/group-join-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupId, requesterId: effectiveUserId }),
      }).catch((err) => console.error("Failed to send join request email:", err))
    } catch (error) {
      console.error("Error sending join request:", error)
      toast.error("Error", {
        description: "Failed to send join request. Please try again.",
      })
    }
  }

  const handleMemberAction = async (memberId: string, action: "approve" | "reject") => {
    try {
      // Call API to handle action and create activities
      const response = await fetch("/api/groups/member-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupMemberId: memberId, action, groupId }),
      })

      const result = await response.json()
      
      if (!result.success) {
        throw new Error(result.error || "Failed to process action")
      }

      if (action === "approve") {
        // Update UI
        setPendingMembers((prev) => prev.filter((member) => member.id !== memberId))
        const approvedMember = pendingMembers.find((member) => member.id === memberId)
        if (approvedMember) {
          setMembers((prev) => [...prev, { ...approvedMember, status: "approved" }])
        }

        toast.success("Member Approved", {
          description: "The member has been approved and added to the group.",
        })
      } else {
        // Update UI
        setPendingMembers((prev) => prev.filter((member) => member.id !== memberId))

        toast.success("Member Rejected", {
          description: "The member request has been rejected.",
        })
      }
    } catch (error) {
      console.error(`Error ${action}ing member:`, error)
      toast.error("Error", {
        description: `Failed to ${action} member. Please try again.`,
      })
    }
  }

  const handleRemoveMember = async (memberId: string, memberName: string) => {
    if (!confirm(`Are you sure you want to remove ${memberName} from the group?`)) {
      return
    }

    try {
      const { error } = await supabase
        .from("group_members")
        .delete()
        .eq("id", memberId)

      if (error) throw error

      // Update UI
      setMembers((prev) => prev.filter((member) => member.id !== memberId))

      toast.success("Member Removed", {
        description: `${memberName} has been removed from the group.`,
      })
    } catch (error) {
      console.error("Error removing member:", error)
      toast.error("Error", {
        description: "Failed to remove member. Please try again.",
      })
    }
  }

  const copyInviteLink = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl)
      toast.success("Copied to clipboard", {
        description: "Invite link copied",
      })
    } catch (error) {
      console.error("Failed to copy:", error)
    }
  }

  const copyGroupCode = async () => {
    if (group?.group_code) {
      try {
        await navigator.clipboard.writeText(group.group_code)
        toast.success("Copied to clipboard", {
          description: "Group code copied",
        })
      } catch (error) {
        console.error("Failed to copy:", error)
      }
    }
  }

  const handleShareLink = async () => {
    const shareText = `Join my group "${group?.name}" on Ganamos!\n\nUse invite link: ${inviteUrl}\n\nOr enter code: ${group?.group_code}`
    
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
    
    if (isMobile && navigator.share) {
      try {
        await navigator.share({
          title: `Join ${group?.name} on Ganamos`,
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

  const handleShareCode = async () => {
    const shareText = `Join my group "${group?.name}" on Ganamos!\n\nEnter group code: ${group?.group_code}`
    
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
    
    if (isMobile && navigator.share) {
      try {
        await navigator.share({
          title: `Join ${group?.name} on Ganamos`,
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

  const handleCreatePost = () => {
    // Store the group ID in localStorage to use in the post creation flow
    localStorage.setItem("selectedGroupId", groupId)
    router.push("/post/new")
  }

  const handleRegenerateCode = async () => {
    if (!group) return
    
    setIsRegeneratingCode(true)
    try {
      const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
      let newCode = ""
      for (let i = 0; i < 4; i++) {
        newCode += characters.charAt(Math.floor(Math.random() * characters.length))
      }
      
      const { error } = await supabase
        .from("groups")
        .update({ group_code: newCode, updated_at: new Date().toISOString() })
        .eq("id", groupId)
      
      if (error) throw error
      
      setGroup({ ...group, group_code: newCode })
      toast.success("Code Regenerated", {
        description: `New group code: ${newCode}`,
      })
    } catch (error) {
      console.error("Error regenerating code:", error)
      toast.error("Error", {
        description: "Failed to regenerate group code. Please try again.",
      })
    } finally {
      setIsRegeneratingCode(false)
    }
  }

  const handleRenameGroup = async () => {
    if (!group || !newGroupName.trim()) return
    
    setIsRenamingGroup(true)
    try {
      const { error } = await supabase
        .from("groups")
        .update({ name: newGroupName.trim(), updated_at: new Date().toISOString() })
        .eq("id", groupId)
      
      if (error) throw error
      
      setGroup({ ...group, name: newGroupName.trim() })
      setShowRenameDialog(false)
      setNewGroupName("")
      toast.success("Group Renamed", {
        description: `Group is now called "${newGroupName.trim()}"`,
      })
    } catch (error) {
      console.error("Error renaming group:", error)
      toast.error("Error", {
        description: "Failed to rename group. Please try again.",
      })
    } finally {
      setIsRenamingGroup(false)
    }
  }

  const handleAppointAdmin = async () => {
    if (!selectedNewAdmin) return
    
    setIsAppointingAdmin(true)
    try {
      const { error } = await supabase
        .from("group_members")
        .update({ role: "admin", updated_at: new Date().toISOString() })
        .eq("group_id", groupId)
        .eq("user_id", selectedNewAdmin)
      
      if (error) throw error
      
      // Update local state
      setMembers(prev => prev.map(m => 
        m.user_id === selectedNewAdmin ? { ...m, role: "admin" } : m
      ))
      setShowAppointAdminDialog(false)
      setSelectedNewAdmin(null)
      
      const appointedMember = members.find(m => m.user_id === selectedNewAdmin)
      toast.success("Admin Appointed", {
        description: `${appointedMember?.profile?.name || "Member"} is now an admin.`,
      })
    } catch (error) {
      console.error("Error appointing admin:", error)
      toast.error("Error", {
        description: "Failed to appoint admin. Please try again.",
      })
    } finally {
      setIsAppointingAdmin(false)
    }
  }

  const handleDeleteGroup = async () => {
    setIsDeletingGroup(true)
    try {
      // First, disassociate all posts from this group (set group_id to null)
      const { error: postsError } = await supabase
        .from("posts")
        .update({ group_id: null })
        .eq("group_id", groupId)
      
      if (postsError) throw postsError
      
      // Then delete all group members
      const { error: membersError } = await supabase
        .from("group_members")
        .delete()
        .eq("group_id", groupId)
      
      if (membersError) throw membersError
      
      // Finally delete the group
      const { error: groupError } = await supabase
        .from("groups")
        .delete()
        .eq("id", groupId)
      
      if (groupError) throw groupError
      
      toast.success("Group Deleted", {
        description: "The group has been permanently deleted.",
      })
      router.push("/profile")
    } catch (error) {
      console.error("Error deleting group:", error)
      toast.error("Error", {
        description: "Failed to delete group. Please try again.",
      })
    } finally {
      setIsDeletingGroup(false)
    }
  }

  if (loading) {
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
          <h1 className="text-2xl font-bold mb-4">Group Not Found</h1>
          <p className="mb-4">The group you're looking for doesn't exist or has been deleted.</p>
          <Button onClick={() => router.push("/profile")}>Go to Profile</Button>
        </div>
      </div>
    )
  }

  // User is not a member or pending
  if (!userStatus) {
    return (
      <div className="container px-4 py-6 mx-auto max-w-md">
        <div className="flex items-center mb-6">
          <Button variant="ghost" size="icon" onClick={() => router.back()} className="mr-2">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m15 18-6-6 6-6" />
            </svg>
            <span className="sr-only">Back</span>
          </Button>
          <h1 className="text-2xl font-bold">Join Group</h1>
        </div>

        <Card className="mb-6">
          <CardContent className="p-6">
            <div className="text-center mb-6">
              <h2 className="text-xl font-bold mb-2">{group.name}</h2>
              {group.description && <p className="text-muted-foreground">{group.description}</p>}
            </div>
            <Button className="w-full" onClick={handleJoinRequest}>
              Request to Join Group
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  // User has a pending request
  if (userStatus === "pending") {
    return (
      <div className="container px-4 py-6 mx-auto max-w-md">
        <div className="flex items-center mb-6">
          <Button variant="ghost" size="icon" onClick={() => router.back()} className="mr-2">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m15 18-6-6 6-6" />
            </svg>
            <span className="sr-only">Back</span>
          </Button>
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

  // User is an approved member
  return (
    <div className="container px-4 mx-auto max-w-md min-h-screen flex flex-col">
      {/* Sticky Header */}
      <div className="sticky top-0 z-10 bg-background pt-6 pb-4">
        <div className="flex items-center mb-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()} className="mr-2">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m15 18-6-6 6-6" />
            </svg>
            <span className="sr-only">Back</span>
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold truncate">{group.name}</h1>
            {userRole === "admin" && group.group_code && (
              <div className="flex items-center gap-2 mt-1">
                <span className="text-sm text-muted-foreground">Code:</span>
                <button
                  onClick={copyGroupCode}
                  className="font-mono text-sm font-bold bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                >
                  {group.group_code}
                </button>
                {copiedGroupCode && <span className="text-xs text-green-600 dark:text-green-400">Copied!</span>}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            {userRole === "admin" && (
              <>
                <Button variant="outline" size="icon" onClick={() => setShowInviteDialog(true)}>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" x2="12" y1="3" y2="15" />
                  </svg>
                  <span className="sr-only">Share</span>
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="icon">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <circle cx="12" cy="12" r="1" />
                        <circle cx="12" cy="5" r="1" />
                        <circle cx="12" cy="19" r="1" />
                      </svg>
                      <span className="sr-only">Group options</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => {
                      setNewGroupName(group.name)
                      setShowRenameDialog(true)
                    }}>
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
                        className="mr-2"
                      >
                        <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                        <path d="m15 5 4 4" />
                      </svg>
                      Rename Group
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setShowAppointAdminDialog(true)}>
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
                        className="mr-2"
                      >
                        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                        <circle cx="9" cy="7" r="4" />
                        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                      </svg>
                      Appoint Admin
                    </DropdownMenuItem>
                    <DropdownMenuItem 
                      className="text-red-600 focus:text-red-600"
                      onClick={() => setShowDeleteGroupDialog(true)}
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
                        className="mr-2"
                      >
                        <path d="M3 6h18" />
                        <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                        <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                      </svg>
                      Delete Group
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            )}
          </div>
        </div>

        <Tabs defaultValue="members" className="w-full" value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="members">
              Members
              {userRole === "admin" && pendingMembers.length > 0 && (
                <Badge className="ml-2 bg-orange-100 text-orange-800 text-xs">
                  {pendingMembers.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="posts">Posts</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto pb-6">
        <Tabs value={activeTab} className="w-full">
          <TabsContent value="members" className="space-y-4 mt-0">

          <div className="space-y-3">
            {[...members].sort((a, b) => {
              // Pin admins to the top
              if (a.role === "admin" && b.role !== "admin") return -1
              if (a.role !== "admin" && b.role === "admin") return 1
              return 0
            }).map((member) => (
              <Card key={member.id} className="overflow-hidden">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <div className="relative w-10 h-10 mr-3 overflow-hidden rounded-full">
                        <Image
                          src={member.profile?.avatar_url || "/placeholder.svg?height=40&width=40"}
                          alt={member.profile?.name || "Member"}
                          fill
                          className="object-cover"
                        />
                      </div>
                      <div>
                        <p className="font-medium">{member.profile?.name || "Unknown Member"}</p>
                        <div className="flex items-center gap-2">
                          {member.role === "admin" && (
                            <Badge className="bg-green-100 text-green-800 hover:bg-green-200 border-green-200 text-xs">
                              Admin
                            </Badge>
                          )}
                          <p className="text-xs text-muted-foreground">
                            Joined {formatDistanceToNow(new Date(member.created_at), { addSuffix: true })}
                          </p>
                        </div>
                      </div>
                    </div>
                    {userRole === "admin" && member.user_id !== user?.id && member.user_id !== effectiveUserId && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
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
                              <circle cx="12" cy="12" r="1" />
                              <circle cx="12" cy="5" r="1" />
                              <circle cx="12" cy="19" r="1" />
                            </svg>
                            <span className="sr-only">Member options</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {/* Make Admin / Remove Admin toggle */}
                          {member.role === "admin" ? (
                            <DropdownMenuItem
                              onClick={async () => {
                                // Prevent demoting the group creator
                                if (group && member.user_id === group.created_by) {
                                  toast.error("Cannot remove admin", {
                                    description: "The group creator must always be an admin.",
                                  })
                                  return
                                }
                                
                                // Prevent demoting the last admin
                                const adminCount = members.filter(m => m.role === "admin" && m.status === "approved").length
                                if (adminCount <= 1) {
                                  toast.error("Cannot remove admin", {
                                    description: "A group must have at least one admin.",
                                  })
                                  return
                                }
                                
                                try {
                                  const { error } = await supabase
                                    .from("group_members")
                                    .update({ role: "member", updated_at: new Date().toISOString() })
                                    .eq("group_id", groupId)
                                    .eq("user_id", member.user_id)
                                  
                                  if (error) throw error
                                  
                                  setMembers(prev => prev.map(m => 
                                    m.user_id === member.user_id ? { ...m, role: "member" } : m
                                  ))
                                  toast.success("Admin Removed", {
                                    description: `${member.profile?.name || "Member"} is no longer an admin.`,
                                  })
                                } catch (error) {
                                  console.error("Error removing admin:", error)
                                  toast.error("Error", { description: "Failed to remove admin role." })
                                }
                              }}
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
                                className="mr-2"
                              >
                                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                                <circle cx="9" cy="7" r="4" />
                                <line x1="17" y1="11" x2="22" y2="11" />
                              </svg>
                              Remove Admin
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem
                              onClick={async () => {
                                try {
                                  const { error } = await supabase
                                    .from("group_members")
                                    .update({ role: "admin", updated_at: new Date().toISOString() })
                                    .eq("group_id", groupId)
                                    .eq("user_id", member.user_id)
                                  
                                  if (error) throw error
                                  
                                  setMembers(prev => prev.map(m => 
                                    m.user_id === member.user_id ? { ...m, role: "admin" } : m
                                  ))
                                  toast.success("Admin Added", {
                                    description: `${member.profile?.name || "Member"} is now an admin.`,
                                  })
                                } catch (error) {
                                  console.error("Error making admin:", error)
                                  toast.error("Error", { description: "Failed to make admin." })
                                }
                              }}
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
                                className="mr-2"
                              >
                                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                                <circle cx="9" cy="7" r="4" />
                                <line x1="19" y1="8" x2="19" y2="14" />
                                <line x1="16" y1="11" x2="22" y2="11" />
                              </svg>
                              Make Admin
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem
                            className="text-red-600 focus:text-red-600"
                            onClick={() => handleRemoveMember(member.id, member.profile?.name || "this member")}
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
                              className="mr-2"
                            >
                              <path d="M3 6h18" />
                              <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                              <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                            </svg>
                            Remove from group
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {userRole === "admin" && pendingMembers.length > 0 && (
            <>
              <Separator className="my-4" />
              <div className="space-y-3">
                <h3 className="font-medium">Pending Requests ({pendingMembers.length})</h3>
                {pendingMembers.map((member) => (
                  <Card key={member.id} className="overflow-hidden">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center">
                          <div className="relative w-10 h-10 mr-3 overflow-hidden rounded-full">
                            <Image
                              src={member.profile?.avatar_url || "/placeholder.svg?height=40&width=40"}
                              alt={member.profile?.name || "Member"}
                              fill
                              className="object-cover"
                            />
                          </div>
                          <div>
                            <p className="font-medium">{member.profile?.name || "Unknown Member"}</p>
                            <p className="text-xs text-muted-foreground">
                              Requested {formatDistanceToNow(new Date(member.created_at), { addSuffix: true })}
                            </p>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 px-2 text-xs"
                            onClick={() => handleMemberAction(member.id, "reject")}
                          >
                            Reject
                          </Button>
                          <Button
                            size="sm"
                            className="h-8 px-2 text-xs text-white"
                            onClick={() => handleMemberAction(member.id, "approve")}
                          >
                            Approve
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </>
          )}
        </TabsContent>

        <TabsContent value="posts" className="space-y-4">
          {/* Filter Pills */}
          <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1">
            {[
              { value: "all", label: "All", count: posts.length },
              { value: "open", label: "Open", count: posts.filter(p => !p.fixed && !p.under_review).length },
              { value: "in_review", label: "In Review", count: posts.filter(p => p.under_review && !p.fixed).length },
              { value: "fixed", label: "Fixed", count: posts.filter(p => p.fixed).length },
            ].map((filter) => (
              <button
                key={filter.value}
                onClick={() => setPostFilter(filter.value as typeof postFilter)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all whitespace-nowrap ${
                  postFilter === filter.value
                    ? "bg-primary text-primary-foreground"
                    : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
                }`}
              >
                {filter.label}
                <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                  postFilter === filter.value
                    ? "bg-primary-foreground/20 text-primary-foreground"
                    : "bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400"
                }`}>
                  {filter.count}
                </span>
              </button>
            ))}
          </div>

          {/* Filtered Posts */}
          {(() => {
            const filteredPosts = posts.filter((post) => {
              switch (postFilter) {
                case "open":
                  return !post.fixed && !post.under_review
                case "in_review":
                  return post.under_review && !post.fixed
                case "fixed":
                  return post.fixed
                default:
                  return true
              }
            })

            return filteredPosts.length > 0 ? (
              <div className="space-y-4">
                {filteredPosts.map((post) => (
                  <PostCard key={post.id} post={post} showStatusBadge />
                ))}
              </div>
            ) : (
              <div className="text-center p-8 border rounded-lg border-dashed">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="40"
                  height="40"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="mx-auto mb-4 text-muted-foreground"
                >
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14,2 14,8 20,8" />
                  <line x1="16" x2="8" y1="13" y2="13" />
                  <line x1="16" x2="8" y1="17" y2="17" />
                  <polyline points="10,9 9,9 8,9" />
                </svg>
                <p className="text-muted-foreground mb-4">
                  {postFilter === "all" ? "No posts in this group yet" : `No ${postFilter.replace("_", " ")} posts`}
                </p>
                {postFilter === "all" && (
                  <Button onClick={handleCreatePost}>
                    Create First Post
                  </Button>
                )}
              </div>
            )
          })()}
        </TabsContent>
        </Tabs>
      </div>

      {/* Share Group Dialog */}
      <Dialog open={showInviteDialog} onOpenChange={setShowInviteDialog}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Share {group?.name} group</DialogTitle>
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
                  onClick={copyInviteLink}
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
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium flex items-center gap-1">
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
                {userRole === "admin" && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="text-xs text-muted-foreground hover:text-foreground transition-colors">
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
                          <circle cx="12" cy="12" r="1" />
                          <circle cx="12" cy="5" r="1" />
                          <circle cx="12" cy="19" r="1" />
                        </svg>
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={handleRegenerateCode} disabled={isRegeneratingCode}>
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
                          className="mr-2"
                        >
                          <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                          <path d="M3 3v5h5" />
                          <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
                          <path d="M16 16h5v5" />
                        </svg>
                        {isRegeneratingCode ? "Regenerating..." : "Regenerate Code"}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={copyGroupCode}
                  className="flex-1 h-10 bg-gray-50 dark:bg-gray-800 rounded-md flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors cursor-pointer border border-transparent hover:border-gray-200 dark:hover:border-gray-600"
                >
                  <span className="font-mono text-xl font-bold tracking-widest">
                    {group?.group_code}
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
        </DialogContent>
      </Dialog>

      {/* Rename Group Dialog */}
      <Dialog open={showRenameDialog} onOpenChange={setShowRenameDialog}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Rename Group</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Input
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              placeholder="Enter new group name"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRenameDialog(false)}>
              Cancel
            </Button>
            <Button 
              className="text-white"
              onClick={handleRenameGroup} 
              disabled={isRenamingGroup || !newGroupName.trim()}
            >
              {isRenamingGroup ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Appoint Admin Dialog */}
      <Dialog open={showAppointAdminDialog} onOpenChange={setShowAppointAdminDialog}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Appoint Admin</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-3">
            <p className="text-sm text-muted-foreground">Select a member to make admin:</p>
            {members.filter(m => m.role !== "admin" && m.user_id !== effectiveUserId).map((member) => (
              <button
                key={member.id}
                onClick={() => setSelectedNewAdmin(member.user_id)}
                className={`w-full flex items-center gap-3 p-3 rounded-lg transition-all ${
                  selectedNewAdmin === member.user_id 
                    ? 'bg-green-100 dark:bg-green-900/30 ring-2 ring-green-500' 
                    : 'bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                <div className="relative w-10 h-10 overflow-hidden rounded-full">
                  <Image
                    src={member.profile?.avatar_url || "/placeholder.svg?height=40&width=40"}
                    alt={member.profile?.name || "Member"}
                    fill
                    className="object-cover"
                  />
                </div>
                <span className="font-medium">{member.profile?.name || "Unknown Member"}</span>
              </button>
            ))}
            {members.filter(m => m.role !== "admin" && m.user_id !== effectiveUserId).length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                No eligible members to appoint as admin.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setShowAppointAdminDialog(false)
              setSelectedNewAdmin(null)
            }}>
              Cancel
            </Button>
            <Button 
              className="text-white"
              onClick={handleAppointAdmin} 
              disabled={isAppointingAdmin || !selectedNewAdmin}
            >
              {isAppointingAdmin ? "Appointing..." : "Appoint Admin"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Group Dialog - First confirmation */}
      <Dialog open={showDeleteGroupDialog} onOpenChange={setShowDeleteGroupDialog}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Delete Group</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground">
              Are you sure you want to delete <strong>{group?.name}</strong>? This will remove all members and posts. This action cannot be undone.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteGroupDialog(false)}>
              Cancel
            </Button>
            <Button 
              variant="destructive"
              onClick={() => {
                setShowDeleteGroupDialog(false)
                setShowDeleteConfirmDialog(true)
              }}
            >
              Delete Group
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Group Dialog - Final confirmation */}
      <Dialog open={showDeleteConfirmDialog} onOpenChange={setShowDeleteConfirmDialog}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="text-red-600">Confirm Deletion</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground mb-4">
              This is your final warning. Deleting this group will:
            </p>
            <ul className="text-sm text-muted-foreground list-disc pl-5 space-y-1">
              <li>Remove all {members.length} members</li>
              <li>Delete all {posts.length} posts</li>
              <li>This cannot be undone</li>
            </ul>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteConfirmDialog(false)}>
              Cancel
            </Button>
            <Button 
              variant="destructive"
              onClick={handleDeleteGroup}
              disabled={isDeletingGroup}
            >
              {isDeletingGroup ? "Deleting..." : "Yes, Delete Forever"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
